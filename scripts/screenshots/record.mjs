/**
 * Records, once and locally, the answers of the Clever Cloud API to the pages
 * the screenshots show, into scripts/screenshots/.raw/ (git-ignored, never
 * committed): `node scripts/screenshots/record.mjs` while `pnpm dev:cli` runs on
 * port 5174 with CVC_DEV_API_TOKEN set. Read-only: any other method than GET
 * is refused; environment variables, SSO payloads and invoices are never
 * asked for; secret fields are dropped before anything is written.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { API_HOSTS, SHOTS, requestKey } from './shots.mjs';

/**
 * The organisation to record and the resources the screenshots open, by their real names. They
 * stay in targets.local.json, git-ignored, so that no real name reaches the repository; copy
 * targets.example.json to start one.
 */
const TARGETS = new URL('./targets.local.json', import.meta.url);
if (!existsSync(TARGETS)) {
  console.error('Missing scripts/screenshots/targets.local.json: copy targets.example.json and fill it in.');
  process.exit(1);
}
const { organisation: ORGANISATION, resources: RESOURCES } = JSON.parse(readFileSync(TARGETS, 'utf8'));

const BASE = process.env.CVC_RECORD_URL ?? 'http://localhost:5174/';
const OUT = new URL('./.raw/', import.meta.url);

/** Never fetched while recording: values that are secrets, or private. */
const NEVER = [
  /\/env$/,
  /\/env\?/,
  /\/sso$/,
  /\/invoices/,
  /\/exposed_env/,
  /\/logs(\?|$)/,
  /\/accesslogs/,
  /download-url/,
];
/** Fields dropped from every recorded answer, whatever their depth. */
const SECRET_FIELD =
  /pass|secret|token|signature|private|credential|^key$|apikey|download_?url|phone|address|vat|iban/i;

function strip(value) {
  if (Array.isArray(value)) {
    return value.map(strip);
  }
  if (value != null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !SECRET_FIELD.test(key))
        .map(([key, inner]) => [key, strip(inner)]),
    );
  }
  return value;
}

const recorded = {};
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-GB' });
await context.addInitScript(() => {
  localStorage.setItem('cvc.locale', 'en');
  localStorage.setItem('cvc.theme', 'light');
});
await context.route(
  (url) => API_HOSTS.includes(url.host),
  async (route) => {
    const request = route.request();
    if (request.method() !== 'GET' && request.method() !== 'OPTIONS') {
      return route.fulfill({ status: 418, body: '{"message":"refused while recording"}' });
    }
    if (NEVER.some((pattern) => pattern.test(new URL(request.url()).pathname + new URL(request.url()).search))) {
      return route.fulfill({ status: 404, contentType: 'application/json', body: '{"message":"not recorded"}' });
    }
    const response = await route.fetch();
    const text = await response.text();
    let body = text;
    try {
      body = JSON.stringify(strip(JSON.parse(text)));
    } catch {
      // Not JSON: kept as is.
    }
    recorded[requestKey(request.method(), request.url())] = {
      status: response.status(),
      contentType: response.headers()['content-type'] ?? 'application/json',
      body,
    };
    return route.fulfill({ status: response.status(), headers: response.headers(), body });
  },
);

const page = await context.newPage();
await page.goto(BASE);
await page.getByRole('button', { name: 'Use this token' }).click();
await page.getByRole('button', { name: 'Continue without saving' }).click();
await page.waitForFunction(
  (organisation) =>
    document
      .querySelector('cvc-app')
      ?.session?.organisations?.some(
        (candidate) => candidate.name === organisation && candidate.applications.length > 0,
      ),
  ORGANISATION,
  { timeout: 60_000 },
);

/** The ids the screenshots need, from the summary the page loaded. */
const ids = await page.evaluate(
  ({ organisation, resources }) => {
    const session = document.querySelector('cvc-app').session;
    const orga = session.organisations.find((candidate) => candidate.name === organisation);
    const app = (name) => orga.applications.find((candidate) => candidate.name === name)?.id;
    const addon = (name) => orga.addons.find((candidate) => candidate.name === name)?.id;
    return {
      orga: orga.id,
      app: app(resources.app),
      failedApp: app(resources.failedApp),
      database: addon(resources.database),
      cellar: addon(resources.cellar),
      logsApps: resources.logsApps.map(app),
    };
  },
  { organisation: ORGANISATION, resources: RESOURCES },
);
// The last deployment of the application that failed, for its logs.
await page.goto(`${BASE}#/orga/${ids.orga}/app/${ids.failedApp}/deployments`);
await page.waitForTimeout(4000);
ids.failedDeployment = await page.evaluate(() => {
  const app = document.querySelector('cvc-app').shadowRoot.querySelector('cvc-app-page');
  const href = app.shadowRoot
    .querySelector('cvc-app-deployments')
    .shadowRoot.querySelector('a.logs')
    ?.getAttribute('href');
  return new URLSearchParams(href.slice(href.indexOf('?') + 1)).get('deployment');
});

// The costs shown on the home page, so every source is read: yesterday, 30 days, the estimate.
await page.evaluate((orgaId) => {
  localStorage.setItem(
    `cvc.home.${orgaId}`,
    JSON.stringify({
      grouping: 'project > env',
      sort: { column: 'name', direction: 'asc' },
      collapsed: [],
      costs: true,
      costSource: 'days30',
      updatedAt: 1,
    }),
  );
}, ids.orga);
await page.reload();
await page.waitForTimeout(3000);

for (const shot of SHOTS) {
  await page.goto(`${BASE}${shot.hash(ids)}`);
  await page.waitForTimeout(shot.name === 'home' ? 45_000 : 6000);
  console.log('visited', shot.name);
}

mkdirSync(OUT, { recursive: true });
writeFileSync(new URL('responses.json', OUT), JSON.stringify(recorded, null, 2));
writeFileSync(new URL('ids.json', OUT), JSON.stringify({ ...ids, recordedAt: new Date().toISOString() }, null, 2));
console.log(`${Object.keys(recorded).length} answers recorded`);
await browser.close();
