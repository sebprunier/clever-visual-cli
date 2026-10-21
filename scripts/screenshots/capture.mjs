/**
 * Takes the screenshots of the user documentation (#15) into
 * docs/public/screenshots/, from the anonymised demo data only: every call to
 * the Clever Cloud API, the status page and npm is answered here, nothing
 * leaves the machine, no token is needed. Light theme, English, 1440 × 900,
 * the clock set to the time of the recording.
 *
 *   pnpm exec vite --port 5175 --strictPort &   # the interface, without the dev profile
 *   node scripts/screenshots/capture.mjs
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { favourites, logLines, platformStatus, syncVariables, VARIABLES } from './demo-data.mjs';
import { API_HOSTS, SHOTS, requestKey } from './shots.mjs';

const BASE = process.env.CVC_CAPTURE_URL ?? 'http://localhost:5175/';
const OUT = new URL('../../docs/public/screenshots/', import.meta.url);
const fixtures = JSON.parse(readFileSync(new URL('./fixtures/responses.json', import.meta.url), 'utf8'));
const ids = JSON.parse(readFileSync(new URL('./fixtures/ids.json', import.meta.url), 'utf8'));
const NOW = Date.parse(ids.recordedAt);
const only = process.argv.slice(2);

const failedDeploymentKey = Object.keys(fixtures).find(
  (key) => key.includes('/v4/orchestration/') && key.endsWith(`/deployments/${ids.failedDeployment}`),
);
const failedDeployment = JSON.parse(fixtures[failedDeploymentKey].body);
const LOGS = logLines(ids, NOW, failedDeployment.startDate ?? failedDeployment.startsAt);
const STATUS = platformStatus(NOW);
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
};
const missing = new Set();

const json = (route, body, status = 200) =>
  route.fulfill({ status, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(body) });

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  locale: 'en-GB',
  timezoneId: 'Europe/Paris',
});
await context.addInitScript(
  ({ orga, prefs, favorites }) => {
    if (sessionStorage.getItem('cvc.demo.seeded') == null) {
      localStorage.setItem('cvc.locale', 'en');
      localStorage.setItem('cvc.theme', 'light');
      localStorage.setItem(`cvc.home.${orga}`, JSON.stringify(prefs));
      localStorage.setItem(`cvc.favorites.${orga}`, JSON.stringify(favorites));
      sessionStorage.setItem('cvc.demo.seeded', 'yes');
    }
  },
  {
    orga: ids.orga,
    prefs: {
      grouping: 'project > env',
      sort: { column: 'name', direction: 'asc' },
      collapsed: [],
      costs: true,
      costSource: 'days30',
      updatedAt: NOW,
    },
    favorites: favourites(NOW),
  },
);
// The log streams: made-up lines, then a heartbeat that keeps them open.
await context.addInitScript((logs) => {
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    // A string, a URL (what the client passes) or a Request.
    const url = new URL(input instanceof Request ? input.url : String(input), location.href);
    const match = url.pathname.match(/\/v4\/logs\/organisations\/[^/]+\/applications\/([^/]+)\/logs$/);
    if (match == null) {
      return realFetch(input, init);
    }
    const deploymentId = url.searchParams.get('deploymentId');
    const lines = (deploymentId != null ? logs.deployments[deploymentId] : logs.apps[match[1]]) ?? [];
    const encoder = new TextEncoder();
    const body = new ReadableStream({
      start(controller) {
        for (const line of lines) {
          controller.enqueue(encoder.encode(`event: APPLICATION_LOG\ndata: ${JSON.stringify(line)}\n\n`));
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
      return json(route, { name: 'clever-tools', version: '5.2.0' });
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
    const fixture = fixtures[requestKey('GET', request.url())];
    if (fixture == null) {
      missing.add(requestKey('GET', request.url()).replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, '…'));
      return json(route, { message: 'not in the demo data' }, 404);
    }
    return route.fulfill({
      status: fixture.status,
      headers: { ...CORS, 'content-type': fixture.contentType },
      body: fixture.body,
    });
  },
);

mkdirSync(OUT, { recursive: true });
const page = await context.newPage();
await page.clock.setFixedTime(NOW);
const take = async (name, clip) => {
  if (only.length === 0 || only.includes(name)) {
    await page.waitForTimeout(400);
    await page.screenshot({ path: new URL(`${name}.png`, OUT).pathname, animations: 'disabled', clip });
    console.log('took', name);
  }
};

await page.goto(BASE);
await page.getByPlaceholder('API token').waitFor();
// The sign-in card only, not the empty page around it.
await take('sign-in', { x: 420, y: 16, width: 600, height: 280 });
await page.getByPlaceholder('API token').fill('demo-token');
await page.getByRole('button', { name: 'Sign in', exact: true }).click();
await page.getByRole('button', { name: 'Continue without saving' }).click();
await page.waitForFunction(
  (orga) => document.querySelector('cvc-app')?.session?.organisations?.some((candidate) => candidate.id === orga),
  ids.orga,
  { timeout: 30_000 },
);

const ACTIONS = {
  async selection() {
    const boxes = page.locator('tr.app td.check input');
    for (const index of [0, 1, 2]) {
      await boxes.nth(index).check();
    }
    await page.getByRole('button', { name: /^Applications/ }).click();
  },
  async views() {
    await page.locator('cvc-favorites-menu button.trigger').click();
  },
  async costs() {
    await page.locator('cvc-dropdown.costs-menu button.trigger').click();
  },
  async palette() {
    await page.keyboard.press('ControlOrMeta+k');
    await page.keyboard.type('re');
  },
};

for (const shot of SHOTS) {
  if (only.length > 0 && !only.includes(shot.name)) {
    continue;
  }
  await page.goto(`${BASE}${shot.hash(ids)}`);
  // A fresh page each time: no selection or open menu left by the screenshot before.
  await page.reload();
  await page.waitForTimeout(shot.name.startsWith('home') || shot.name.endsWith('menu') ? 5000 : 3500);
  if (shot.actions != null) {
    await ACTIONS[shot.actions]();
    await page.waitForTimeout(800);
  }
  await take(shot.name, shot.clip);
}

if (missing.size > 0) {
  console.log('Not in the demo data:', [...missing].sort());
}
await browser.close();
