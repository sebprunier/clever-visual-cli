/**
 * Takes the screenshots of the user documentation (#15) into
 * docs/public/screenshots/, from the anonymised demo data only: every call to
 * the Clever Cloud API, the status page and npm is answered here, nothing
 * leaves the machine, no token is needed (see demo-browser.mjs). Light theme,
 * English, 1440 × 900, the clock set to the time of the recording.
 *
 *   pnpm exec vite --port 5175 --strictPort &   # the interface, without the dev profile
 *   node scripts/screenshots/capture.mjs
 */
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { ids, NOW, openDemoContext, signIn } from './demo-browser.mjs';
import { SHOTS } from './shots.mjs';

const BASE = process.env.CVC_CAPTURE_URL ?? 'http://localhost:5175/';
const OUT = new URL('../../docs/public/screenshots/', import.meta.url);
const only = process.argv.slice(2);

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const { context, missing } = await openDemoContext(browser);

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
await signIn(page);

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
