/**
 * The motion design of clever-visual-cli: every frame is computed from a time t
 * by `seek(t)`, so render.mjs takes them one by one, at any frame rate, and the
 * same t always gives the same picture. `?play` plays it in real time, `?t=12.5`
 * shows one moment.
 *
 * The screens come from capture.mjs (out/shots/, the modern theme on the demo
 * data) and the parts it points at from out/boxes.json.
 */
export const FPS = 30;
/** Real seconds per second of the choreography below: under 1 plays it faster. */
const PACE = 0.85;
export const DURATION = Math.round(108 * PACE * 10) / 10;

const boxes = await (await fetch('out/boxes.json')).json();
const logo = await (await fetch('../../public/favicon.svg')).text();
for (const id of ['intro-logo', 'outro-logo']) {
  document.getElementById(id).innerHTML = logo;
}

// --- the engine -------------------------------------------------------------

const EASINGS = {
  linear: (x) => x,
  out: (x) => 1 - (1 - x) ** 3,
  in: (x) => x ** 3,
  inOut: (x) => (x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2),
};
const DEFAULTS = { opacity: 1, x: 0, y: 0, scale: 1, blur: 0 };
const tracks = [];
const frameHooks = [];

/**
 * Keyframes `[t, values, easing]` of an element: opacity, x, y, scale, blur. The easing leads into the
 * keyframe; a value a keyframe leaves out is the one before it, or the default.
 */
function animate(el, keys) {
  tracks.push({ el, keys: normalise(keys.map(([t, values, easing = 'inOut']) => ({ t, values, easing }))) });
}

function normalise(keys) {
  const props = new Set(keys.flatMap((key) => Object.keys(key.values)));
  let carried = Object.fromEntries([...props].map((prop) => [prop, DEFAULTS[prop]]));
  return keys.map((key) => {
    carried = { ...carried, ...key.values };
    return { ...key, values: carried };
  });
}

function valueAt(keys, prop, t) {
  let previous = null;
  for (const key of keys) {
    if (!(prop in key.values)) {
      continue;
    }
    if (key.t <= t) {
      previous = key;
      continue;
    }
    if (previous == null) {
      return key.values[prop];
    }
    const progress = EASINGS[key.easing]((t - previous.t) / (key.t - previous.t));
    return previous.values[prop] + (key.values[prop] - previous.values[prop]) * progress;
  }
  return previous == null ? DEFAULTS[prop] : previous.values[prop];
}

function apply({ el, keys }, t) {
  const opacity = valueAt(keys, 'opacity', t);
  const blur = valueAt(keys, 'blur', t);
  el.style.opacity = String(opacity);
  el.style.visibility = opacity <= 0.001 ? 'hidden' : 'visible';
  el.style.transform = `translate(${valueAt(keys, 'x', t)}px, ${valueAt(keys, 'y', t)}px) scale(${valueAt(keys, 'scale', t)})`;
  el.style.filter = blur > 0.01 ? `blur(${blur}px)` : '';
}

/** Shows the moment t, in real seconds. */
export function seek(t) {
  const at = t / PACE;
  for (const track of tracks) {
    apply(track, at);
  }
  for (const hook of frameHooks) {
    hook(at);
  }
}

// --- building blocks ---------------------------------------------------------

const $ = (selector) => document.querySelector(selector);

/** In from below at t0, out at t1. */
function rise(el, t0, t1, { dy = 28, duration = 0.7 } = {}) {
  animate(el, [
    [t0, { opacity: 0, y: dy }],
    [t0 + duration, { opacity: 1, y: 0 }, 'out'],
    [t1 - 0.45, { opacity: 1, y: 0 }],
    [t1, { opacity: 0, y: -14 }, 'in'],
  ]);
}

/** The children of a text scene, one after the other. */
/** The children of a text scene, one after the other; one with `data-at` comes that many seconds after t0. */
function textScene(id, t0, t1) {
  const section = document.getElementById(id);
  section.style.opacity = '1';
  [...section.children].forEach((child, index) => {
    const at = child.dataset.at == null ? index * 0.12 : Number(child.dataset.at);
    rise(child, t0 + at, t1);
  });
}

/** Types `text` into the element between t0 and t1, a caret at the end while `caretUntil` is not reached. */
function typing(el, text, t0, t1, caretUntil = t1 + 1) {
  frameHooks.push((t) => {
    const count = Math.max(0, Math.min(text.length, Math.floor(((t - t0) / (t1 - t0)) * text.length)));
    const caret = t >= t0 - 0.3 && t < caretUntil && Math.floor(t * 2.2) % 2 === 0 ? '<span class="caret"></span>' : '';
    el.innerHTML = `${escapeHtml(text.slice(0, count))}${caret}`;
  });
}

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// The window: 1120 × 700 of a 1440 × 900 screen.
const SCREEN = { w: 1120, h: 700 };
const BASE_SCALE = SCREEN.w / 1440;

/** The camera on a part of the screen, `zoom` times closer than the whole screen; the whole screen when no box. */
function focus(box, zoom = 1) {
  const scale = BASE_SCALE * zoom;
  if (box == null) {
    return { x: 0, y: 0, scale };
  }
  const clamp = (value, min) => Math.min(0, Math.max(min, value));
  return {
    x: clamp(SCREEN.w / 2 - (box.x + box.width / 2) * scale, SCREEN.w - 1440 * scale),
    y: clamp(SCREEN.h / 2 - (box.y + box.height / 2) * scale, SCREEN.h - 900 * scale),
    scale,
  };
}

/** Two boxes as one. */
function union(a, b) {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
}

const screen = $('#screen');

/**
 * One screen in the window from t0 (fading in over the one before) to t1, the camera moving through
 * `[t, camera]` keyframes, and rings `[box, from, to]` around parts of it.
 */
function shot(name, t0, t1, cameras, rings = []) {
  const layer = document.createElement('div');
  layer.className = 'layer';
  const viewport = document.createElement('div');
  viewport.className = 'viewport';
  const img = document.createElement('img');
  img.src = `out/shots/${name}.png`;
  img.alt = '';
  viewport.append(img);
  layer.append(viewport);
  screen.append(layer);
  animate(layer, [
    [t0, { opacity: 0 }],
    [t0 + 0.5, { opacity: 1 }],
    [t1, { opacity: 1 }],
    [t1 + 0.5, { opacity: 0 }],
  ]);
  const keys = cameras.map(([t, camera, easing = 'inOut']) => ({ t, values: camera, easing }));
  frameHooks.push((t) => {
    const scale = valueAt(keys, 'scale', t);
    viewport.style.transform = `translate(${valueAt(keys, 'x', t)}px, ${valueAt(keys, 'y', t)}px) scale(${scale})`;
    // The rings keep the same thickness on screen, whatever the zoom.
    viewport.style.setProperty('--ring', `${3 / scale}px`);
  });
  for (const [box, from, to, pad = 8] of rings) {
    const ring = document.createElement('div');
    ring.className = 'ring';
    Object.assign(ring.style, {
      left: `${box.x - pad}px`,
      top: `${box.y - pad}px`,
      width: `${box.width + 2 * pad}px`,
      height: `${box.height + 2 * pad}px`,
      borderWidth: 'var(--ring)',
    });
    viewport.append(ring);
    animate(ring, [
      [from, { opacity: 0, scale: 1.08 }],
      [from + 0.4, { opacity: 1, scale: 1 }, 'out'],
      [to - 0.3, { opacity: 1 }],
      [to, { opacity: 0 }],
    ]);
  }
  return viewport;
}

// --- the background ------------------------------------------------------------

// The glows drift during the intro and the outro only: still behind the screens, they cost no bits.
frameHooks.push((t) => {
  const drift = Math.min(t, 5.5) + Math.max(0, t - 100.5);
  $('#glow-a').style.transform = `translate(${Math.sin(drift / 7) * 90}px, ${Math.cos(drift / 9) * 70}px)`;
  $('#glow-b').style.transform = `translate(${Math.cos(drift / 8) * -100}px, ${Math.sin(drift / 10) * -80}px)`;
});

// --- 1. intro: 0 → 5.5 ------------------------------------------------------------------------

animate($('#intro-logo'), [
  [0.2, { opacity: 0, scale: 0.6, blur: 14 }],
  [1.3, { opacity: 1, scale: 1, blur: 0 }, 'out'],
  [5, { opacity: 1, scale: 1 }],
  [5.5, { opacity: 0, scale: 1.06 }, 'in'],
]);
rise($('#intro-name'), 0.9, 5.5, { dy: 40 });
rise($('#intro-tagline'), 1.6, 5.5);
rise($('#intro-sub'), 2.3, 5.5);

// --- 2. the idea: 5.5 → 15.5 ---------------------------------------------------------------------

textScene('t-idea', 5.7, 15.5);
animate($('#terminal'), [
  [5.9, { opacity: 0, y: 40 }],
  [6.6, { opacity: 1, y: 0 }, 'out'],
  [8.6, { opacity: 1, scale: 1, blur: 0 }],
  [9.2, { opacity: 0, scale: 0.94, blur: 6 }],
]);
const command = 'clever applications list --org orga_60b0b979…';
frameHooks.push((t) => {
  const count = Math.max(0, Math.min(command.length, Math.floor(((t - 6.8) / 1.3) * command.length)));
  const caret = Math.floor(t * 2.2) % 2 === 0 ? '<span class="caret"></span>' : '';
  $('#term').innerHTML = `<span class="prompt">$</span> ${escapeHtml(command.slice(0, count))}${caret}`;
});
animate($('#window'), [
  [8.4, { opacity: 0, scale: 0.94, y: 30 }],
  [9.2, { opacity: 1, scale: 1, y: 0 }, 'out'],
  [99.9, { opacity: 1, scale: 1 }],
  [100.6, { opacity: 0, scale: 0.96 }, 'in'],
]);

const home = boxes.home;
shot(
  'home',
  8.4,
  17.3,
  [
    [9.6, focus(null)],
    [10.6, focus(home.cli, 2.1)],
    [13.6, focus(home.cli, 2.1)],
    [14.8, focus(null)],
    [15.8, focus(home.filter, 1.5)],
  ],
  [[home.cli, 10.5, 14]],
);

// --- 3. filter & group: 15.5 → 26 -------------------------------------------------------------------

textScene('t-filter', 15.7, 26);
typing($('#expr-filter .typed'), 'mcp AND -is:addon', 16.4, 17.5, 19.6);
typing($('#expr-group .typed'), 'project > env', 20.6, 21.5, 25.6);
frameHooks.push((t) => {
  $('#expr-filter').classList.toggle('active', t >= 16.3 && t < 19.6);
  $('#expr-group').classList.toggle('active', t >= 20.5 && t < 25.6);
});
// Each screen holds the camera of the one before while it fades in, then moves.
shot('filter', 17.3, 22.1, [
  [17.3, focus(home.filter, 1.5)],
  [17.9, focus(home.filter, 1.5)],
  [19, focus(null)],
  [19.6, focus(null)],
  [20.4, focus(home.grouping, 1.5)],
]);
const list = { x: 20, y: 150, width: 1090, height: 560 };
shot('group', 22.1, 26, [
  [22.1, focus(home.grouping, 1.5)],
  [22.7, focus(home.grouping, 1.5)],
  [23.8, focus(list, 1.25)],
]);

// --- 4. views: 26 → 33.5 ------------------------------------------------------------------------------

textScene('t-views', 26.2, 33.5);
shot(
  'views',
  26,
  33.5,
  [
    [26.2, focus(null)],
    [27.2, focus(boxes.views.menu, 1.8)],
  ],
  [[boxes.views.menu, 27.2, 33.2]],
);

// --- 5. costs: 33.5 → 41 ------------------------------------------------------------------------------

textScene('t-costs', 33.7, 41);
shot(
  'costs',
  33.5,
  41,
  [
    [33.7, focus(null)],
    [34.7, focus(boxes.costs.menu, 1.7)],
  ],
  [[boxes.costs.menu, 34.7, 40.7]],
);

// --- 6. bulk actions: 41 → 49.5 ------------------------------------------------------------------------

textScene('t-bulk', 41.2, 49.5);
const selection = boxes.selection;
shot(
  'selection',
  41,
  45.2,
  [
    [41.2, focus(null)],
    [42.2, focus(union(selection.bar, selection.menu), 1.25)],
  ],
  [
    [selection.bar, 42.2, 45.4],
    [selection.menu, 42.7, 45.4],
  ],
);
shot(
  'tags',
  45.2,
  49.5,
  [[45.2, focus(union(boxes.tags.bar, boxes.tags.menu), 1.25)]],
  [[boxes.tags.menu, 45.6, 49.2]],
);

// --- 7. logs of several applications: 49.5 → 63 -----------------------------------------------------------

textScene('t-multilogs', 49.7, 63);
const layout = boxes.multilogs.layout;
const grid = shot(
  'multilogs',
  49.5,
  54.4,
  [
    [49.7, focus(null)],
    [51.2, focus(null)],
    [52.2, focus(layout, 1.7)],
  ],
  [[layout, 51.6, 54.6]],
);
// The layout menu, opened on "2 columns", then on "Merged".
const menu = document.createElement('div');
menu.className = 'dropdown';
Object.assign(menu.style, { left: `${layout.x}px`, top: `${layout.y + layout.height + 4}px` });
const highlight = document.createElement('div');
highlight.className = 'highlight';
menu.append(highlight);
for (const label of ['1 column', '2 columns', '3 columns', 'Merged']) {
  const option = document.createElement('div');
  option.textContent = label;
  menu.append(option);
}
grid.append(menu);
animate(menu, [
  [52.6, { opacity: 0, y: -6 }],
  [52.9, { opacity: 1, y: 0 }, 'out'],
  [54.2, { opacity: 1 }],
  [54.4, { opacity: 0 }],
]);
animate(highlight, [
  [53.3, { y: 28 }],
  [53.7, { y: 84 }, 'out'],
]);
const merged = boxes['multilogs-merged'];
const lines = [merged.gateway, merged.circuit, merged.waiting, merged.unreachable].reduce(union, merged.timeout);
// The left of the lines: time, application, message.
const incident = { ...lines, width: 880 };
shot(
  'multilogs-merged',
  54.4,
  63,
  [
    [54.4, focus(layout, 1.7)],
    [55, focus(layout, 1.7)],
    [56, focus(null)],
    [56.6, focus(null)],
    [57.6, focus(incident, 1.55)],
  ],
  [[incident, 57.6, 62.7, 6]],
);

// --- 8. one application: 63 → 69 ---------------------------------------------------------------------------

textScene('t-app', 63.2, 69);
shot(
  'app',
  63,
  69,
  [
    [63, focus(null)],
    [69.4, focus(boxes.app.tabs, 1.15), 'linear'],
  ],
  [[boxes.app.tabs, 64.2, 68.7]],
);

// --- 9. application + access logs: 69 → 84 -------------------------------------------------------------------

textScene('t-mixed', 69.2, 84);
// The same frame on both modes, so the access lines are seen slipping in between.
const region = { x: 300, y: 200, width: 1110, height: 480 };
shot(
  'logs-app',
  69,
  76,
  [
    [69.2, focus(null)],
    [70.4, focus(region, 1.3)],
  ],
  [
    [boxes['logs-app'].timeout, 71.2, 74.8, 5],
    [boxes['logs-app'].both, 74.6, 76.3],
  ],
);
const both = boxes['logs-both'];
const request = union(both.payment, both.notFound);
// Time, kind, status, method, path and message: the columns that tell the story.
const story = { x: 305, y: request.y, width: 735, height: request.height };
shot(
  'logs-both',
  76,
  84,
  [
    [76, focus(region, 1.3)],
    [78.4, focus(region, 1.3)],
    // From the left of the logs panel, past the list beside the page.
    [79.6, focus({ x: 300, y: story.y - 50, width: 847, height: story.height + 100 }, 1.7)],
  ],
  [[story, 77, 83.7, 6]],
);

// --- 10. at a glance: 84 → 91.5 ----------------------------------------------------------------------------------

textScene('t-watch', 84.2, 91.5);
shot(
  'home',
  84,
  91.5,
  [
    [84.2, focus(null)],
    [85.4, focus(home.side, 1.9)],
  ],
  [[home.side, 85.4, 91.2]],
);

// --- 11. sign-in and accounts: 91.5 → 100.5 ------------------------------------------------------------------------

textScene('t-signin', 91.7, 100.5);
shot(
  'signin',
  91.5,
  95.8,
  [
    [91.7, focus(null)],
    [92.7, focus(boxes.signin.card, 1.7)],
  ],
  [[boxes.signin.card, 92.7, 95.8]],
);
const accounts = { x: 23, y: 115, width: 720, height: 198 };
shot('accounts', 95.8, 100.5, [[95.8, focus(accounts, 1.5)]], [[accounts, 96.2, 100.2]]);

// --- 12. outro: 100.5 → 108 ---------------------------------------------------------------------------------------------

// The outro stays to the end.
const hold = 1000;
animate($('#outro-logo'), [
  [100.8, { opacity: 0, scale: 0.7, blur: 12 }],
  [101.7, { opacity: 1, scale: 1, blur: 0 }, 'out'],
]);
rise($('#outro-name'), 101.2, hold, { dy: 36 });
rise($('#outro-credits'), 101.8, hold);
rise($('#outro-role'), 102.3, hold);
rise($('#outro-link'), 102.9, hold);

// --- start --------------------------------------------------------------------------------------------

await document.fonts.ready;
await Promise.all([...document.images].map((img) => img.decode()));
seek(0);
window.motion = { seek, FPS, DURATION };
document.body.dataset.ready = 'true';

const params = new URLSearchParams(location.search);
if (params.has('t')) {
  seek(Number(params.get('t')));
} else if (params.has('play')) {
  const start = performance.now();
  const frame = (now) => {
    seek(((now - start) / 1000) % DURATION);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
