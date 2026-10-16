#!/usr/bin/env node
/**
 * Phase 0 check, run from Node so it needs no browser: does the new
 * `@clevercloud/client` command client work with the credentials clever-tools
 * already stores on this machine?
 *
 *   node scripts/spike-node.mjs [app-id-or-name] [stream-seconds]
 *
 * Credentials, in order of precedence:
 *   - CLEVER_API_TOKEN            → api-token auth through api-bridge
 *   - CLEVER_TOKEN + CLEVER_SECRET → oauth-v1 auth
 *   - ~/.config/clever-cloud/clever-tools.json, first profile (what `clever login` wrote)
 *
 * Nothing secret is printed.
 */
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { CcApiClient } from '@clevercloud/client/cc-api-client.js';
import { ListApplicationCommand } from '@clevercloud/client/cc-api-commands/application/list-application-command.js';
import { StreamApplicationRuntimeLogCommand } from '@clevercloud/client/cc-api-commands/log/stream-application-runtime-log-command.js';
import { ListOrganisationCommand } from '@clevercloud/client/cc-api-commands/organisation/list-organisation-command.js';
import { GetProfileCommand } from '@clevercloud/client/cc-api-commands/profile/get-profile-command.js';

// Same public consumer as clever-tools (see src/core/constants.ts).
const OAUTH_CONSUMER_KEY = 'T5nFjKeHH4AIlEveuGhB5S3xg8T19e';
const OAUTH_CONSUMER_SECRET = 'MgVMqTr6fWlf2M0tkC2MXOnhfqBWDT';

const [, , appSelector, streamSecondsArg] = process.argv;
const streamSeconds = Number(streamSecondsArg ?? 8);

const authMethod = await resolveAuthMethod();
console.log(`auth: ${authMethod.type}`);

const client = new CcApiClient({ authMethod });

const profile = await client.send(new GetProfileCommand());
console.log(`profile: ${profile.name ?? '(sans nom)'} <${maskEmail(profile.emailAddress)}> id=${profile.id}`);

const organisations = await client.send(new ListOrganisationCommand({ withPersonalOrganisation: true }));
console.log(`organisations: ${organisations.length}`);

const appsByOwner = new Map();
for (const orga of organisations) {
  const apps = await client.send(new ListApplicationCommand({ ownerId: orga.id, withBranches: false }));
  appsByOwner.set(orga.id, apps);
  console.log(`  - ${orga.name} (${orga.id}): ${apps.length} app(s)`);
}

const allApps = [...appsByOwner.values()].flat();
const targetApp =
  appSelector != null
    ? allApps.find((app) => app.id === appSelector || app.name === appSelector)
    : allApps.find((app) => app.lastDeployedAt > 0 && !app.isArchived);

if (targetApp == null) {
  console.log('no application to stream logs from, stopping here.');
  process.exit(0);
}

console.log(`\nstreaming runtime logs of "${targetApp.name}" (${targetApp.id}) for ${streamSeconds}s…`);
const stream = await client.stream(
  new StreamApplicationRuntimeLogCommand({
    applicationId: targetApp.id,
    ownerId: targetApp.ownerId,
    since: new Date(Date.now() - 60 * 60 * 1000),
    limit: 20,
  }),
);

let lines = 0;
stream
  .onOpen(() => console.log('stream: open'))
  .onLog((log) => {
    lines += 1;
    console.log(`  ${log.date} [${log.service}] ${log.message}`);
  })
  .onError((error) => console.log(`stream: error ${error.message}`));

const timer = setTimeout(() => stream.close(), streamSeconds * 1000);
const closeReason = await stream.start();
clearTimeout(timer);
console.log(`stream: closed (${JSON.stringify(closeReason)}), ${lines} line(s) received`);

// ---------------------------------------------------------------------------

async function resolveAuthMethod() {
  if (process.env.CLEVER_API_TOKEN) {
    return { type: 'api-token', apiToken: process.env.CLEVER_API_TOKEN };
  }
  if (process.env.CLEVER_TOKEN && process.env.CLEVER_SECRET) {
    return oauth(process.env.CLEVER_TOKEN, process.env.CLEVER_SECRET);
  }
  const configPath = path.join(homedir(), '.config', 'clever-cloud', 'clever-tools.json');
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  const profileEntry = config.profiles?.[0] ?? config;
  if (!profileEntry?.token || !profileEntry?.secret) {
    throw new Error(`no credentials found in ${configPath}, run "clever login" first`);
  }
  console.log(`credentials: clever-tools profile "${profileEntry.alias ?? 'default'}"`);
  return oauth(profileEntry.token, profileEntry.secret);
}

function oauth(token, secret) {
  return {
    type: 'oauth-v1',
    oauthTokens: { consumerKey: OAUTH_CONSUMER_KEY, consumerSecret: OAUTH_CONSUMER_SECRET, token, secret },
  };
}

function maskEmail(email) {
  if (typeof email !== 'string' || !email.includes('@')) {
    return '***';
  }
  const [user, domain] = email.split('@');
  return `${user.slice(0, 2)}***@${domain}`;
}
