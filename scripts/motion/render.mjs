/**
 * Renders the motion design (motion.html) into
 * scripts/motion/out/clever-visual-cli.mp4: 1920 × 1080, 30 frames a second,
 * H.264. Each frame is set by time and taken by the installed Chrome, then
 * encoded by Chrome itself (WebCodecs, through mediabunny): no ffmpeg needed.
 * Run capture.mjs first, for the screens.
 *
 *   node scripts/motion/render.mjs                    # the video
 *   CVC_MOTION_WIDTH=1280 CVC_MOTION_BITRATE=700000 CVC_MOTION_NAME=clever-visual-cli-720p \
 *     node scripts/motion/render.mjs                  # a lighter one, 720p, under 10 MB
 *   node scripts/motion/render.mjs --stills 1,9.5,47  # a few moments, as PNG, into out/stills/
 *   node scripts/motion/render.mjs --poster 3.2       # the picture shown before the video plays, out/poster.jpg
 *   node scripts/motion/render.mjs --preview          # a link to play it in a browser
 */
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const OUT = fileURLToPath(new URL('./out/', import.meta.url));
// In bits a second.
const BITRATE = Number(process.env.CVC_MOTION_BITRATE ?? 2_500_000);
const NAME = process.env.CVC_MOTION_NAME ?? 'clever-visual-cli';
// The frames are taken at 1920 × 1080 and scaled down to this width when smaller (1280 for 720p).
const WIDTH = Number(process.env.CVC_MOTION_WIDTH ?? 1920);
const HEIGHT = Math.round((WIDTH * 9) / 16);
const TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

// The repository, read-only, on localhost: WebCodecs needs a secure context, which localhost is.
const server = createServer((request, response) => {
  const path = normalize(decodeURIComponent(new URL(request.url, 'http://localhost').pathname));
  if (path === `${sep}__encoder`) {
    response.setHeader('content-type', 'text/html');
    response.end(`<!doctype html><canvas width="${WIDTH}" height="${HEIGHT}"></canvas>`);
    return;
  }
  const file = join(ROOT, path);
  if (!file.startsWith(ROOT) || !statSync(file, { throwIfNoEntry: false })?.isFile()) {
    response.statusCode = 404;
    response.end();
    return;
  }
  response.setHeader('content-type', TYPES[extname(file)] ?? 'application/octet-stream');
  response.end(readFileSync(file));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://localhost:${server.address().port}`;
const MOTION = `${origin}/scripts/motion/motion.html`;

const args = process.argv.slice(2);
if (args[0] === '--preview') {
  console.log(`Open ${MOTION}?play (or ?t=12.5 for one moment); Ctrl+C to stop.`);
} else {
  await render();
  server.close();
}

async function render() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('pageerror', (error) => console.error('motion:', error.message));
  await page.goto(MOTION);
  await page.waitForSelector('body[data-ready="true"]', { timeout: 60_000 });
  const { fps, duration } = await page.evaluate(() => ({ fps: window.motion.FPS, duration: window.motion.DURATION }));
  const seek = (t) => page.evaluate((t) => window.motion.seek(t), t);

  if (args[0] === '--stills') {
    mkdirSync(join(OUT, 'stills'), { recursive: true });
    for (const t of args[1].split(',').map(Number)) {
      await seek(t);
      const path = join(OUT, 'stills', `t-${t.toFixed(1).padStart(4, '0')}.png`);
      await page.screenshot({ path });
      console.log('still', path);
    }
    await browser.close();
    return;
  }

  if (args[0] === '--poster') {
    // The picture a page shows before the video plays: one moment, as JPEG.
    await seek(Number(args[1]));
    const path = join(OUT, 'poster.jpg');
    await page.screenshot({ path, type: 'jpeg', quality: 82 });
    console.log('poster', path);
    await browser.close();
    return;
  }

  const encoder = await browser.newPage();
  await encoder.goto(`${origin}/__encoder`);
  await encoder.evaluate(
    async ({ library, fps, bitrate }) => {
      const { Output, Mp4OutputFormat, BufferTarget, CanvasSource } = await import(library);
      const canvas = document.querySelector('canvas');
      window.context2d = canvas.getContext('2d');
      window.context2d.imageSmoothingQuality = 'high';
      window.output = new Output({
        format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
        target: new BufferTarget(),
      });
      window.source = new CanvasSource(canvas, {
        codec: 'avc',
        bitrate,
        bitrateMode: 'variable',
        latencyMode: 'quality',
      });
      window.output.addVideoTrack(window.source, { frameRate: fps });
      await window.output.start();
    },
    { library: `${origin}/node_modules/mediabunny/dist/bundles/mediabunny.min.mjs`, fps, bitrate: BITRATE },
  );

  const frames = Math.round(duration * fps);
  const started = Date.now();
  for (let index = 0; index < frames; index++) {
    await seek(index / fps);
    const image = await page.screenshot({ type: 'png' });
    await encoder.evaluate(
      async ({ data, index, fps }) => {
        const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${data}`)).blob());
        window.context2d.drawImage(bitmap, 0, 0, window.context2d.canvas.width, window.context2d.canvas.height);
        bitmap.close();
        await window.source.add(index / fps, 1 / fps);
      },
      { data: image.toString('base64'), index, fps },
    );
    if (index % fps === 0) {
      process.stdout.write(`\r${index / fps} / ${duration} s`);
    }
  }
  const video = await encoder.evaluate(async () => {
    await window.output.finalize();
    const bytes = new Uint8Array(window.output.target.buffer);
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    return btoa(binary);
  });
  mkdirSync(OUT, { recursive: true });
  const path = join(OUT, `${NAME}.mp4`);
  writeFileSync(path, Buffer.from(video, 'base64'));
  console.log(`\n${path}: ${frames} frames in ${Math.round((Date.now() - started) / 1000)} s`);
  await browser.close();
}
