/**
 * Takes the screens of the motion design (motion.html) into
 * scripts/motion/out/shots/, from the anonymised demo data only (see
 * ../screenshots/demo-browser.mjs): modern theme, English, 1440 × 900 at
 * twice the pixels, so they stay sharp when the motion zooms in. Next to
 * them, out/boxes.json holds where the parts the motion points at sit on each
 * screen, in CSS pixels.
 *
 *   pnpm exec vite --port 5175 --strictPort &   # the interface, without the dev profile
 *   node scripts/motion/capture.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { ids, NOW, openDemoContext, signIn } from '../screenshots/demo-browser.mjs';

const BASE = process.env.CVC_CAPTURE_URL ?? 'http://localhost:5175/';
const OUT = new URL('./out/shots/', import.meta.url);
const multilogs = `#/orga/${ids.orga}/logs?apps=${ids.logsApps.join(',')}`;
/** A log line, by what it says. */
const line = (hasText) => ({ selector: '.line', hasText });
const home = (params = {}) =>
  `#/orga/${ids.orga}?${new URLSearchParams({ g: 'project > env', ...params }).toString().replace(/\+/g, '%20')}`;

/** Each screen: where it is, what to do before taking it, and the parts to locate on it. */
const SHOTS = [
  {
    name: 'home',
    // A flat list: the filter and the grouping are typed in the motion.
    hash: home({ g: '' }),
    boxes: {
      cli: 'cvc-orga-page cvc-cli',
      filter: 'cvc-orga-page input[placeholder*="press /"]',
      grouping: 'cvc-orga-page input[placeholder*="project > env"]',
      side: 'cvc-orga-page aside.side',
      views: 'cvc-favorites-menu button.trigger',
      costs: 'cvc-dropdown.costs-menu button.trigger',
    },
  },
  {
    name: 'filter',
    hash: home({ q: 'mcp AND -is:addon', g: '' }),
    boxes: { filter: 'cvc-orga-page input[placeholder*="press /"]' },
  },
  {
    name: 'group',
    hash: home({ q: 'mcp AND -is:addon', g: 'project > env' }),
    boxes: { grouping: 'cvc-orga-page input[placeholder*="project > env"]' },
  },
  { name: 'views', hash: home(), action: 'views', boxes: { menu: ':popover-open' } },
  { name: 'costs', hash: home(), action: 'costs', boxes: { menu: ':popover-open' } },
  {
    name: 'selection',
    hash: home(),
    action: 'selection',
    boxes: { bar: 'cvc-orga-page .selection.active', menu: ':popover-open' },
  },
  {
    name: 'tags',
    hash: home(),
    action: 'tags',
    boxes: { bar: 'cvc-orga-page .selection.active', menu: ':popover-open' },
  },
  {
    name: 'multilogs',
    hash: multilogs,
    storage: { 'cvc.logs.layout': '2' },
    boxes: { layout: 'cvc-logs-page select:has(option[value="merged"])' },
  },
  {
    name: 'multilogs-merged',
    hash: multilogs,
    storage: { 'cvc.logs.layout': 'merged' },
    boxes: {
      timeout: line('Payment provider timed out'),
      gateway: line('api POST /api/payments 502'),
      circuit: line('circuit "payments" open'),
      waiting: line('Order 4812 waiting'),
      unreachable: line('Order 4812: payment provider unreachable'),
    },
  },
  { name: 'app', hash: `#/orga/${ids.orga}/app/${ids.app}`, boxes: { tabs: 'cvc-app-page nav' } },
  {
    name: 'logs-app',
    hash: `#/orga/${ids.orga}/app/${ids.app}/logs`,
    storage: { 'cvc.logs.mode': 'app' },
    boxes: { timeout: line('Payment provider timed out'), both: { selector: 'cvc-app-logs button', hasText: 'Both' } },
  },
  {
    name: 'logs-both',
    hash: `#/orga/${ids.orga}/app/${ids.app}/logs`,
    storage: { 'cvc.logs.mode': 'both' },
    boxes: {
      both: { selector: 'cvc-app-logs button', hasText: 'Both' },
      payment: line('/api/payments'),
      timeout: line('Payment provider timed out'),
      notFound: line('/api/orders/4812'),
    },
  },
  { name: 'accounts', hash: '#/account', boxes: {} },
];

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const { context, missing } = await openDemoContext(browser, { theme: 'modern', deviceScaleFactor: 2 });
// No scrollbar: a long list and a short one keep the same width, so the motion can fade from one to the other.
await context.addInitScript(() => {
  document.addEventListener('DOMContentLoaded', () => {
    const style = document.createElement('style');
    style.textContent = 'html { scrollbar-width: none; }';
    document.head.append(style);
  });
});
const page = await context.newPage();
await page.clock.setFixedTime(NOW);
mkdirSync(OUT, { recursive: true });
const boxes = {};

async function locate(selectors) {
  const found = {};
  for (const [name, selector] of Object.entries(selectors)) {
    const { selector: css, hasText } = typeof selector === 'string' ? { selector } : selector;
    const box = await page.locator(css, { hasText }).first().boundingBox();
    if (box == null) {
      throw new Error(`Not found on the screen: ${name} (${css})`);
    }
    found[name] = Object.fromEntries(Object.entries(box).map(([key, value]) => [key, Math.round(value)]));
  }
  return found;
}

async function take(name, selectors = {}) {
  await page.waitForTimeout(500);
  boxes[name] = await locate(selectors);
  await page.screenshot({ path: new URL(`${name}.png`, OUT).pathname, animations: 'disabled' });
  console.log('took', name);
}

const ACTIONS = {
  async selection() {
    const rows = page.locator('tr.app td.check input');
    for (const index of [0, 1, 2]) {
      await rows.nth(index).check();
    }
    await page.getByRole('button', { name: /^Applications/ }).click();
  },
  async tags() {
    const rows = page.locator('tr.app td.check input');
    for (const index of [0, 1, 2]) {
      await rows.nth(index).check();
    }
    await page.getByRole('button', { name: /^Tags/ }).click();
  },
  async views() {
    await page.locator('cvc-favorites-menu button.trigger').click();
  },
  async costs() {
    await page.locator('cvc-dropdown.costs-menu button.trigger').click();
  },
};

await page.goto(BASE);
await page.getByPlaceholder('API token').waitFor();
await take('signin', { card: 'cvc-login section.card' });
await signIn(page);

// A second account in this browser, for the accounts page: the tab-only vault, as the sign-in left it.
await page.evaluate(() => {
  const vault = JSON.parse(sessionStorage.getItem('cvc.vault.session'));
  vault.profiles.push({
    id: 'demo-second',
    alias: 'sam.rivera@example.com',
    credentials: { type: 'api-token', apiToken: 'demo-token-2' },
    userId: 'user_demo_second',
    email: 'sam.rivera@example.com',
    name: 'Sam Rivera',
    createdAt: new Date().toISOString(),
  });
  sessionStorage.setItem('cvc.vault.session', JSON.stringify(vault));
});

for (const shot of SHOTS) {
  await page.evaluate((entries) => {
    for (const [key, value] of Object.entries(entries)) {
      localStorage.setItem(key, value);
    }
  }, shot.storage ?? {});
  await page.goto(`${BASE}${shot.hash}`);
  // A fresh page each time: no selection or open menu left by the screen before.
  await page.reload();
  await page.waitForTimeout(shot.name === 'home' || shot.action != null ? 5000 : 3500);
  if (shot.action != null) {
    await ACTIONS[shot.action]();
    await page.waitForTimeout(800);
  }
  await take(shot.name, shot.boxes);
}

writeFileSync(new URL('../boxes.json', OUT), `${JSON.stringify(boxes, null, 2)}\n`);
if (missing.size > 0) {
  console.log('Not in the demo data:', [...missing].sort());
}
await browser.close();
