/**
 * A browser context in which clever-visual-cli runs on the anonymised demo
 * data only: every call to the Clever Cloud API, the status page and npm is
 * answered here, the log streams are made up, nothing leaves the machine and
 * no token is needed. Shared by the screenshots of the documentation and the
 * motion design (scripts/motion/).
 */
import { readFileSync } from 'node:fs';
import {
  accessLines,
  demoDeployments,
  demoInstances,
  favourites,
  logLines,
  platformStatus,
  syncVariables,
  VARIABLES,
} from './demo-data.mjs';
import { API_HOSTS, requestKey } from './shots.mjs';

export const fixtures = JSON.parse(readFileSync(new URL('./fixtures/responses.json', import.meta.url), 'utf8'));
export const ids = JSON.parse(readFileSync(new URL('./fixtures/ids.json', import.meta.url), 'utf8'));
/** The time of the recording: the clock of every page. */
export const NOW = Date.parse(ids.recordedAt);

const failedDeploymentKey = Object.keys(fixtures).find(
  (key) => key.includes('/v4/orchestration/') && key.endsWith(`/deployments/${ids.failedDeployment}`),
);
const failedDeployment = JSON.parse(fixtures[failedDeploymentKey].body);

/** The recorded answer of a GET of the API, parsed, found by the start of its key (its path and query). */
function recorded(start) {
  const key = Object.keys(fixtures).find((candidate) => candidate.startsWith(start));
  return key == null ? null : JSON.parse(fixtures[key].body);
}
const appPath = (appId) => `/organisations/${ids.orga}/applications/${appId}`;
/** The running instance of the API when recorded: the previous one, in the demo, of a redeployment. */
const [previousInstance] = recorded(`GET api-bridge.clever-cloud.com/v4/orchestration${appPath(ids.app)}/instances?`);
/** The recorded deployments of an application (v2), the longest list of them. */
function recordedDeployments(appId) {
  const start = `GET api-bridge.clever-cloud.com/v2${appPath(appId)}/deployments?limit=`;
  const lists = Object.keys(fixtures)
    .filter((key) => key.startsWith(start))
    .map((key) => JSON.parse(fixtures[key].body));
  return lists.sort((a, b) => b.length - a.length)[0] ?? null;
}
const INSTANCES = demoInstances(ids, NOW, previousInstance, failedDeployment);
const NEW_DEPLOYMENTS = demoDeployments(ids, NOW, recordedDeployments(ids.app)[0]);

/** The instances of an application the API would list for a query (#38): by state, window and deployment. */
function listInstances(instances, query) {
  const excluded = query.getAll('excludeState').flatMap((value) => value.split(','));
  const since = query.get('since');
  const until = query.get('until');
  const deploymentId = query.get('deploymentId');
  return instances
    .filter(
      (instance) =>
        !excluded.includes(instance.state) &&
        (since == null || instance.deletionDate == null || instance.deletionDate >= since) &&
        (until == null || instance.creationDate <= until) &&
        (deploymentId == null || instance.deploymentId === deploymentId),
    )
    .slice(0, Number(query.get('limit') ?? 1000));
}

const LOGS = {
  ...logLines(ids, NOW, failedDeployment.startDate ?? failedDeployment.startsAt, previousInstance),
  access: { [ids.app]: accessLines(ids.app, NOW, previousInstance) },
};
const STATUS = platformStatus(NOW);
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

/**
 * Tags the recorded organisation lacks for the demo, by the demo name of the application: the MCP
 * applications split between production and development, so `project > env` has something to show.
 */
const EXTRA_TAGS = {
  'grove-zinnia-mcp': ['env:prod'],
  'tundra-mcp-app': ['env:prod'],
  'zephyr-mcp-app': ['env:prod'],
  'sage-mcp-app': ['env:dev'],
  'thistle-mcp-app': ['env:dev'],
};

/** The summary, with the extra tags. */
function withExtraTags(body) {
  const summary = JSON.parse(body);
  for (const orga of summary.organisations) {
    for (const app of orga.applications ?? []) {
      app.customerTags = [...(app.customerTags ?? []), ...(EXTRA_TAGS[app.name] ?? [])];
    }
  }
  return JSON.stringify(summary);
}

const json = (route, body, status = 200) =>
  route.fulfill({ status, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(body) });

/**
 * Opens the context. `storage` adds localStorage entries, set once per tab
 * before the page loads, next to the language, the theme and the home page
 * preferences. Returns the context and the set of requests the demo data
 * could not answer.
 */
export async function openDemoContext(
  browser,
  { theme = 'light', viewport = { width: 1440, height: 900 }, deviceScaleFactor = 1, storage = {} } = {},
) {
  const missing = new Set();
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor,
    locale: 'en-GB',
    timezoneId: 'Europe/Paris',
  });
  await context.addInitScript(
    (entries) => {
      if (sessionStorage.getItem('cvc.demo.seeded') == null) {
        for (const [key, value] of Object.entries(entries)) {
          localStorage.setItem(key, value);
        }
        sessionStorage.setItem('cvc.demo.seeded', 'yes');
      }
    },
    {
      'cvc.locale': 'en',
      'cvc.theme': theme,
      [`cvc.home.${ids.orga}`]: JSON.stringify({
        grouping: 'project > env',
        sort: { column: 'name', direction: 'asc' },
        collapsed: [],
        costs: true,
        costSource: 'days30',
        updatedAt: NOW,
      }),
      [`cvc.favorites.${ids.orga}`]: JSON.stringify(favourites(NOW)),
      ...storage,
    },
  );
  // The log streams: made-up lines, then a heartbeat that keeps them open.
  await context.addInitScript((logs) => {
    const realFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      // A string, a URL (what the client passes) or a Request.
      const url = new URL(input instanceof Request ? input.url : String(input), location.href);
      const runtime = url.pathname.match(/\/v4\/logs\/organisations\/[^/]+\/applications\/([^/]+)\/logs$/);
      const access = url.pathname.match(/\/v4\/accesslogs\/organisations\/[^/]+\/applications\/([^/]+)\/accesslogs$/);
      if (runtime == null && access == null) {
        return realFetch(input, init);
      }
      const deploymentId = url.searchParams.get('deploymentId');
      const lines =
        access != null
          ? (logs.access[access[1]] ?? [])
          : ((deploymentId != null ? logs.deployments[deploymentId] : logs.apps[runtime[1]]) ?? []);
      const event = access != null ? 'ACCESS_LOG' : 'APPLICATION_LOG';
      const encoder = new TextEncoder();
      const body = new ReadableStream({
        start(controller) {
          for (const line of lines) {
            controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(line)}\n\n`));
          }
          setInterval(() => controller.enqueue(encoder.encode('event: HEARTBEAT\ndata: {}\n\n')), 1000);
        },
      });
      return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
    };
  }, LOGS);

  await context.route(
    (url) =>
      API_HOSTS.includes(url.host) || url.host === 'www.clevercloudstatus.com' || url.host === 'registry.npmjs.org',
    async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (request.method() === 'OPTIONS') {
        return route.fulfill({ status: 204, headers: CORS });
      }
      if (url.host === 'www.clevercloudstatus.com') {
        return json(route, url.pathname.endsWith('/incidents') ? STATUS.incidents : STATUS.status);
      }
      if (url.host === 'registry.npmjs.org') {
        return json(route, { name: 'clever-tools', version: '5.4.0' });
      }
      if (request.method() !== 'GET') {
        // Nothing is changed for real: what was sent comes back.
        return json(route, request.postDataJSON() ?? {});
      }
      if (url.pathname.startsWith('/v4/addon-providers/config-provider/') && url.pathname.endsWith('/env')) {
        return json(route, syncVariables(ids.orga, NOW));
      }
      if (/\/applications\/[^/]+\/env$/.test(url.pathname)) {
        return json(route, VARIABLES);
      }
      if (/\/applications\/[^/]+\/(addons|dependencies)\/env$/.test(url.pathname)) {
        // What the linked add-ons and applications expose: nothing shown in the screenshots.
        return json(route, []);
      }
      if (url.pathname.includes('/invoices')) {
        return json(route, []);
      }
      // The instances behind the logs (#38): those of the demo, or none for a window of another application.
      const instancesPath = url.pathname.match(
        /^\/v4\/orchestration\/organisations\/[^/]+\/applications\/([^/]+)\/instances(?:\/([^/]+))?$/,
      );
      if (instancesPath != null) {
        const instances = INSTANCES[instancesPath[1]];
        if (instances != null && instancesPath[2] != null) {
          const instance = instances.find((candidate) => candidate.id === instancesPath[2]);
          return instance == null ? json(route, { message: 'not in the demo data' }, 404) : json(route, instance);
        }
        if (instances != null) {
          return json(route, listInstances(instances, url.searchParams));
        }
        if (url.searchParams.has('since') || url.searchParams.has('deploymentId')) {
          return json(route, []);
        }
      }
      // The deployments (v2), however many are asked for: the recorded ones after those of the demo.
      const deploymentsPath = url.pathname.match(
        /^\/v2\/organisations\/[^/]+\/applications\/([^/]+)\/deployments(?:\/([^/]+))?$/,
      );
      const deployments =
        deploymentsPath == null
          ? null
          : [...(NEW_DEPLOYMENTS[deploymentsPath[1]] ?? []), ...(recordedDeployments(deploymentsPath[1]) ?? [])];
      if (
        deployments != null &&
        deployments.length > 0 &&
        (NEW_DEPLOYMENTS[deploymentsPath[1]] != null || fixtures[requestKey('GET', request.url())] == null)
      ) {
        if (deploymentsPath[2] == null) {
          return json(route, deployments.slice(0, Number(url.searchParams.get('limit') ?? deployments.length)));
        }
        const deployment = deployments.find((candidate) => candidate.uuid === deploymentsPath[2]);
        if (deployment != null) {
          return json(route, deployment);
        }
      }
      // The API counts its deployments: one more with that of the demo.
      if (url.pathname === `/v2${appPath(ids.app)}`) {
        const app = JSON.parse(fixtures[requestKey('GET', request.url())].body);
        return json(route, { ...app, last_deploy: app.last_deploy + (NEW_DEPLOYMENTS[ids.app]?.length ?? 0) });
      }
      const fixture = fixtures[requestKey('GET', request.url())];
      if (fixture == null) {
        missing.add(requestKey('GET', request.url()).replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, '…'));
        return json(route, { message: 'not in the demo data' }, 404);
      }
      return route.fulfill({
        status: fixture.status,
        headers: { ...CORS, 'content-type': fixture.contentType },
        body: url.pathname === '/v2/summary' ? withExtraTags(fixture.body) : fixture.body,
      });
    },
  );
  return { context, missing };
}

/** From the sign-in page: signs in with the demo token, for the tab only, and waits for the organisation. */
export async function signIn(page) {
  await page.getByPlaceholder('API token').fill('demo-token');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Continue without saving' }).click();
  await page.waitForFunction(
    (orga) => document.querySelector('cvc-app')?.session?.organisations?.some((candidate) => candidate.id === orga),
    ids.orga,
    { timeout: 30_000 },
  );
}
