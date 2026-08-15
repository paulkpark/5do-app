// standalone/torus/main.js
//
// Standalone Quantum Torus visualizer — a tuning and evaluation harness for the
// renderer that ships inside the app as a cymatics style.
//
// It imports the exact same modules the app uses (the build step copies them in
// unchanged), so anything tuned here transfers verbatim. What it adds is the
// things the in-app panel has no room for: live parameter sliders, a real FPS
// readout, selectable audio sources, and a permalink that carries the settings.
//
// Note this harness owns its own AudioContext, which the app deliberately does
// not do for the main player — connecting that element to an AudioContext
// breaks background playback on iOS. Here there is no background playback to
// protect, so a real AnalyserNode is the honest way to test reactivity.

import { createTorusRenderer } from './js/torus-render.js';

const $ = (id) => document.getElementById(id);
const BINS = 32;

// ─── controls ────────────────────────────────────────────────────────────────
// `topo` marks a parameter whose change rebuilds geometry and VAOs; those are
// debounced so dragging a slider does not rebuild on every pixel.
const CONTROLS = {
  structureControls: [
    { key: 'm', label: 'Fibers per family', min: 3, max: 12, step: 1, topo: true },
    { key: 'levels', label: 'Recursion levels', min: 0, max: 3, step: 1, topo: true },
    { key: 'nodeBudget', label: 'Node budget', min: 1, max: 4000, step: 1, topo: true },
    { key: 'holeRatio', label: 'Aperture', min: 0.02, max: 0.7, step: 0.001, topo: true },
    { key: 'aFill', label: 'Packing fill', min: 0.2, max: 1.2, step: 0.01, topo: true },
    { key: 'delta', label: 'Level twist', min: 0, max: 0.4, step: 0.002, topo: true },
    { key: 'profile', label: 'Axial squash', min: 0.2, max: 2.5, step: 0.01 }
  ],
  motionControls: [
    { key: 'orbitSpeed', label: 'Auto-rotate', min: -1, max: 1, step: 0.005 },
    { key: 'tilt', label: 'Viewing angle', min: 0.06, max: 1.55, step: 0.01 },
    { key: 'tiltWander', label: 'Angle drift', min: 0, max: 0.6, step: 0.01 },
    // Negative reverses the flow: the two chirality families swap which way
    // each current runs. Zero freezes the structure without stopping the view.
    { key: 'alphaSpeed', label: 'Hopf flow', min: -1, max: 1, step: 0.005 },
    { key: 'flowSpeed', label: 'Particle flow', min: -4, max: 4, step: 0.02 },
    { key: 'cameraDistance', label: 'Camera distance', min: 2, max: 20, step: 0.1 },
    { key: 'particleSize', label: 'Particle size', min: 0, max: 8, step: 0.05 },
    { key: 'particleAlpha', label: 'Particle brightness', min: 0, max: 3, step: 0.02 }
  ],
  lookControls: [
    { key: 'exposure', label: 'Exposure', min: 0.2, max: 3, step: 0.01 },
    { key: 'bloomStrength', label: 'Bloom strength', min: 0, max: 3, step: 0.01 },
    { key: 'bloomThreshold', label: 'Bloom threshold', min: 0, max: 2, step: 0.01 },
    { key: 'vignette', label: 'Vignette', min: 0, max: 1.5, step: 0.01 },
    { key: 'fiberOpacity', label: 'Fiber opacity', min: 0.05, max: 1, step: 0.01 },
    { key: 'shellOpacity', label: 'Ring opacity', min: 0.05, max: 1, step: 0.01 },
    { key: 'sheenStrength', label: 'Sheen', min: 0, max: 2, step: 0.01 },
    { key: 'metalness', label: 'Ring metalness', min: 0, max: 1, step: 0.01 },
    { key: 'roughness', label: 'Ring roughness', min: 0.02, max: 1, step: 0.01 },
    { key: 'envIntensity', label: 'Ring reflectivity', min: 0, max: 3, step: 0.01 },
    { key: 'emissiveStrength', label: 'Ring glow', min: 0, max: 1, step: 0.005 }
  ]
};
const ALL_CONTROLS = Object.values(CONTROLS).flat();

// ─── forms ───────────────────────────────────────────────────────────────────
// Each preset is a complete look — shape, palette and motion — authored by
// sweeping this renderer's own parameter space and looking at the results.
// Anything omitted falls back to the defaults, so a preset only states what it
// actually changes.

/** Ten colour keys in one line, in the order the renderer declares them. */
const pal = (plus, minus, shell, emissive, background, envMid, envHigh,
             sheen = '#FFF4D6', envLow = '#05050A', envKey = '#FFE9B8') =>
  ({ plus, minus, shell, emissive, background, envMid, envHigh, sheen, envLow, envKey });

const PRESETS = [
  {
    id: 'quantum',
    name: 'Quantum Torus',
    note: 'The product form: silver-ratio Clifford torus, brand chirality colours.',
    params: {}
  },
  {
    id: 'horizon',
    name: 'Event Horizon',
    note: 'Aperture closed almost shut, so the fibers pile into a blazing ring.',
    params: {
      holeRatio: 0.035, m: 6, levels: 2, tilt: 0.2, aFill: 0.9,
      bloomStrength: 1.5, bloomThreshold: 0.22, exposure: 1.25,
      particleAlpha: 1.5, orbitSpeed: 0.05,
      ...pal('#FFB86C', '#FF7A45', '#2A1608', '#FF9A3C', '#0B0603', '#3A2008', '#8C5A1E')
    }
  },
  {
    id: 'rose',
    name: 'Rose Window',
    note: 'Wide aperture seen face-on — the fibers resolve into concentric petals.',
    params: {
      holeRatio: 0.62, m: 8, levels: 2, tilt: 0.06, tiltWander: 0.03,
      aFill: 0.92, orbitSpeed: 0.06, alphaSpeed: 0.1,
      ...pal('#FF6B9D', '#C77DFF', '#240A18', '#FF6B9D', '#0B0509', '#3A1030', '#8C3A6E',
             '#FFE0EE')
    }
  },
  {
    id: 'egg',
    name: 'Cosmic Egg',
    note: 'Stretched along the axis, the shell turned to glass so the lattice inside shows.',
    params: {
      profile: 1.9, holeRatio: 0.28, m: 6, levels: 2, tilt: 0.95,
      cameraDistance: 10, shellOpacity: 0.45, envIntensity: 1.1,
      emissiveStrength: 0.06, fiberOpacity: 0.55,
      exposure: 0.88, bloomStrength: 0.6, bloomThreshold: 0.5, sheenStrength: 0.2,
      ...pal('#C6B6FF', '#FFD9A0', '#150F30', '#6A4FD0', '#07060E', '#241C52', '#5A4AA8')
    }
  },
  {
    id: 'pendant',
    name: 'Pendant',
    note: 'Edge-on, the way the piece hangs. Polished metal carries the light.',
    params: {
      tilt: 1.42, tiltWander: 0.05, levels: 1, cameraDistance: 8.6,
      metalness: 1, roughness: 0.18, envIntensity: 1.9, sheenStrength: 0.7,
      orbitSpeed: 0.16, particleSize: 2.4,
      ...pal('#B9A3FF', '#6FEFEF', '#1A1638', '#7C5CFC', '#08070E', '#2C2456', '#6656B4')
    }
  },
  {
    id: 'stillpoint',
    name: 'Still Point',
    note: 'Recursion off. Only the Villarceau circles, barely moving.',
    params: {
      levels: 0, tilt: 0.3, tiltWander: 0.06, orbitSpeed: 0.03,
      alphaSpeed: 0.035, flowSpeed: 0.35, particleSize: 2.2,
      bloomStrength: 0.7, vignette: 0.72,
      ...pal('#7FE9D8', '#4FA8E3', '#0A1A20', '#2E8C8C', '#04080A', '#0E2E36', '#2E7A8C',
             '#E8FFFA')
    }
  },
  {
    id: 'deepfield',
    name: 'Deep Field',
    note: 'Three levels of recursion at full budget — the structure all the way down.',
    params: {
      m: 8, levels: 3, nodeBudget: 3000, aFill: 0.98, delta: 0.02,
      tilt: 0.5, cameraDistance: 9.2, particleSize: 2.2, bloomStrength: 0.8,
      ...pal('#8FB4FF', '#5FE8E8', '#0A1024', '#4A6AD9', '#04060E', '#141E42', '#3A5490',
             '#DCEBFF')
    }
  },
  {
    id: 'heart',
    name: 'Heart Field',
    note: 'Open aperture, soft light, the two currents nearly in balance.',
    params: {
      holeRatio: 0.3, m: 6, levels: 2, tilt: 0.42, aFill: 0.88,
      alphaSpeed: 0.11, flowSpeed: 0.8, bloomStrength: 0.85, exposure: 1.1,
      ...pal('#6BE89A', '#FF8FB8', '#0A2014', '#3EC97A', '#050C08', '#103A24', '#2E8C5A',
             '#EAFFF0')
    }
  },
  {
    id: 'crown',
    name: 'Crown',
    note: 'Twelve fibers per family — the densest lattice the packing allows.',
    params: {
      m: 12, levels: 2, nodeBudget: 2200, tilt: 0.38, aFill: 0.86,
      sheenStrength: 0.55, bloomStrength: 1.05, exposure: 1.0,
      ...pal('#E2D6FF', '#A98FFF', '#1A1436', '#B79BFF', '#07060F', '#2A2050', '#6A5AB0',
             '#FFFFFF')
    }
  }
];

function fatal(title, body) {
  $('fatalTitle').textContent = title;
  $('fatalBody').textContent = body;
  $('fatal').classList.add('show');
}

let toastTimer = 0;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

// ─── GL bootstrap ────────────────────────────────────────────────────────────

const canvas = $('view');
const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance' });
if (!gl) {
  fatal('WebGL2 unavailable',
    'This visualizer needs WebGL2. Try a current Chrome, Edge, Firefox or Safari 15+, and check that hardware acceleration is enabled.');
  throw new Error('no webgl2');
}
if (!gl.getExtension('EXT_color_buffer_float')) {
  fatal('Float render targets unavailable',
    'Your browser has WebGL2 but not EXT_color_buffer_float, which the HDR bloom pipeline needs.');
  throw new Error('no float targets');
}

const isMobile = matchMedia('(max-width: 780px)').matches;
let renderer;
try {
  renderer = createTorusRenderer(gl, { mobile: isMobile });
} catch (e) {
  fatal('Renderer failed to start', String((e && e.message) || e));
  throw e;
}

const DEFAULTS = { ...renderer.params };

// Exposed for tooling: the preset sweeps that authored the looks below drive
// the renderer through this, and it is the handle to reach for when poking at
// a parameter from the console.
window.torus = { renderer };

// ─── audio ───────────────────────────────────────────────────────────────────
// Every source is normalized to the same 32-bin Float32Array the app's
// cymatics-loader produces, so behaviour here matches behaviour there.

const audioEl = $('audio');
const bins = new Float32Array(BINS);
let mode = 'demo';
let ctx = null;
let analyser = null;
let byteBuf = null;
let elementSource = null;
let micStream = null;

function ensureContext() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.72;
    byteBuf = new Uint8Array(analyser.frequencyBinCount);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function stopMic() {
  if (micStream) {
    micStream.getTracks().forEach((t) => t.stop());
    micStream = null;
  }
}

function sampleAnalyser() {
  analyser.getByteFrequencyData(byteBuf);
  const stride = byteBuf.length / BINS;
  for (let i = 0; i < BINS; i++) {
    let sum = 0, n = 0;
    const lo = Math.floor(i * stride), hi = Math.floor((i + 1) * stride);
    for (let j = lo; j < hi; j++) { sum += byteBuf[j]; n++; }
    bins[i] = sum / Math.max(1, n) / 255;
  }
  return bins;
}

/** Stand-in spectrum: a slow sweep with a pulsing low end, for eyeballing motion. */
function sampleDemo(t) {
  const beat = Math.pow(Math.max(0, Math.sin(t * 1.9)), 6);
  for (let i = 0; i < BINS; i++) {
    const band = i / BINS;
    const wave = 0.5 + 0.5 * Math.sin(t * 1.3 + band * 7.5);
    const sweep = Math.exp(-Math.pow((band - (0.5 + 0.45 * Math.sin(t * 0.31))) * 4.5, 2));
    bins[i] = Math.min(1, (wave * 0.35 + sweep * 0.7) * (1 - band * 0.55) + beat * 0.4 * (1 - band));
  }
  return bins;
}

async function setMode(next) {
  document.querySelectorAll('[data-src]').forEach((b) => b.classList.toggle('on', b.dataset.src === next));
  const note = $('audioNote');

  if (next !== 'mic') stopMic();
  if (next !== 'file') { audioEl.pause(); audioEl.style.display = 'none'; }

  if (next === 'mic') {
    try {
      ensureContext();
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
      });
      ctx.createMediaStreamSource(micStream).connect(analyser);
      note.textContent = 'Live microphone. Nothing is recorded or sent anywhere.';
      mode = 'mic';
    } catch (e) {
      // Denied permission or an insecure origin — say which, do not silently sit dark.
      note.textContent = window.isSecureContext
        ? 'Microphone blocked. Allow access in the browser, then pick Mic again.'
        : 'Microphone needs HTTPS. Open the deployed URL rather than a local file.';
      toast('Microphone unavailable');
      setMode('demo');
    }
    return;
  }

  if (next === 'file') {
    $('fileInput').click();
    return;
  }

  mode = next;
  note.textContent = next === 'demo'
    ? 'Synthetic sweep. Pick Mic or File to drive it with real sound.'
    : 'Silent — the resting state the app shows between tracks.';
}

$('fileInput').addEventListener('change', (ev) => {
  const file = ev.target.files && ev.target.files[0];
  if (!file) return;
  ensureContext();
  audioEl.src = URL.createObjectURL(file);
  audioEl.style.display = 'block';
  if (!elementSource) {
    // createMediaElementSource can only ever be called once per element.
    elementSource = ctx.createMediaElementSource(audioEl);
    elementSource.connect(analyser);
    analyser.connect(ctx.destination);
  }
  audioEl.play().catch(() => toast('Press play on the audio bar'));
  mode = 'file';
  document.querySelectorAll('[data-src]').forEach((b) => b.classList.toggle('on', b.dataset.src === 'file'));
  $('audioNote').textContent = file.name;
});

document.querySelectorAll('[data-src]').forEach((b) => {
  b.addEventListener('click', () => setMode(b.dataset.src));
});

// ─── parameter panel ─────────────────────────────────────────────────────────

const inputs = new Map();
let topoTimer = 0;
let pendingTopo = null;

function applyTopo() {
  renderer.configure(pendingTopo);
  pendingTopo = null;
  // Written here, not in setParam: until configure() lands, renderer.params
  // still holds the old value and the link would silently omit the change.
  writeHash();
}

function setParam(key, value, isTopo) {
  if (isTopo) {
    // Debounced: a rebuild recreates every VAO, which is far too much work to
    // do on each pixel of a slider drag.
    pendingTopo = { ...(pendingTopo || {}), [key]: value };
    clearTimeout(topoTimer);
    topoTimer = setTimeout(applyTopo, 140);
  } else {
    renderer.configure({ [key]: value });
    writeHash();
  }
}

function buildControls() {
  for (const [containerId, specs] of Object.entries(CONTROLS)) {
    const host = $(containerId);
    for (const spec of specs) {
      const row = document.createElement('div');
      row.className = 'row';

      const label = document.createElement('label');
      label.setAttribute('for', 'ctl-' + spec.key);
      const name = document.createElement('span');
      name.textContent = spec.label;
      const val = document.createElement('b');
      label.append(name, val);

      const input = document.createElement('input');
      input.type = 'range';
      input.id = 'ctl-' + spec.key;
      input.min = spec.min; input.max = spec.max; input.step = spec.step;
      input.value = renderer.params[spec.key];
      val.textContent = format(input.value, spec.step);

      input.addEventListener('input', () => {
        const v = Number(input.value);
        val.textContent = format(v, spec.step);
        setParam(spec.key, v, spec.topo);
      });

      row.append(label, input);
      host.append(row);
      inputs.set(spec.key, { input, val, spec });
    }
  }
}

const format = (v, step) => Number(v).toFixed(step >= 1 ? 0 : String(step).split('.')[1].length);

function syncInputs() {
  for (const [key, { input, val, spec }] of inputs) {
    input.value = renderer.params[key];
    val.textContent = format(renderer.params[key], spec.step);
  }
}

// ─── presets ─────────────────────────────────────────────────────────────────
// `m`, `levels` and `nodeBudget` decide how many nodes and vertices exist, so
// they snap; everything else — including the colours — eases across, which is
// what makes switching form feel like the piece changing rather than reloading.

const SNAP_KEYS = new Set(['m', 'levels', 'nodeBudget']);
const MORPH_SECONDS = 1.1;

let activePreset = PRESETS[0];
let morph = null;

/** Full parameter set a preset resolves to, defaults filled in. */
const presetTarget = (p) => ({ ...DEFAULTS, ...p.params });

function lerpHex(a, b, t) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift) => {
    const va = (pa >> shift) & 255;
    const vb = (pb >> shift) & 255;
    return Math.round(va + (vb - va) * t);
  };
  return '#' + [ch(16), ch(8), ch(0)]
    .map((v) => v.toString(16).padStart(2, '0')).join('');
}

function applyPreset(preset, { animate = true } = {}) {
  activePreset = preset;
  document.querySelectorAll('.preset-chip')
    .forEach((b) => b.classList.toggle('on', b.dataset.preset === preset.id));

  const target = presetTarget(preset);
  const snap = {};
  for (const k of SNAP_KEYS) snap[k] = target[k];
  renderer.configure(snap);

  if (!animate) {
    renderer.configure(target);
    morph = null;
    syncInputs();
    writeHash();
    return;
  }

  const from = {};
  for (const k of Object.keys(target)) {
    if (!SNAP_KEYS.has(k)) from[k] = renderer.params[k];
  }
  // Timed against the wall clock rather than accumulated frame deltas. Those
  // deltas are clamped to keep the animation sane after a stall, which would
  // stretch this transition to many seconds on a device rendering at a few
  // frames per second — exactly the device where it should not drag.
  morph = { from, to: target, start: performance.now() };
}

/** Advance an in-flight morph. Called once per frame. */
function stepMorph() {
  if (!morph) return;
  const t = Math.min(1, (performance.now() - morph.start) / (MORPH_SECONDS * 1000));
  // easeInOutQuad — starts and settles gently, which suits a healing piece
  // better than a linear ramp.
  const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

  const patch = {};
  for (const k of Object.keys(morph.from)) {
    const a = morph.from[k];
    const b = morph.to[k];
    patch[k] = typeof a === 'number' ? a + (b - a) * e : lerpHex(a, b, e);
  }
  renderer.configure(patch);
  syncInputs();

  if (t >= 1) {
    morph = null;
    writeHash();
  }
}

function buildPresetChips() {
  const host = $('presetControls');
  for (const p of PRESETS) {
    const b = document.createElement('button');
    b.className = 'preset-chip';
    b.dataset.preset = p.id;
    b.textContent = p.name;
    b.title = p.note;
    b.addEventListener('click', () => {
      applyPreset(p);
      $('presetNote').textContent = p.note;
    });
    host.append(b);
  }
}

// ─── permalink ───────────────────────────────────────────────────────────────
// Only non-default values are written, so a link stays short and readable and
// keeps working when a default is later retuned.

function writeHash() {
  // Values are compared against the active preset, not the defaults, so a link
  // records the preset by name plus only what was tweaked on top of it. That
  // also carries the colours, which have no sliders of their own.
  const base = presetTarget(activePreset);
  const parts = activePreset.id === PRESETS[0].id ? [] : [`preset=${activePreset.id}`];
  for (const spec of ALL_CONTROLS) {
    const v = renderer.params[spec.key];
    if (Math.abs(v - base[spec.key]) > 1e-9) parts.push(`${spec.key}=${+v.toFixed(4)}`);
  }
  const hash = parts.join('&');
  history.replaceState(null, '', hash ? '#' + hash : location.pathname + location.search);
}

function readHash() {
  const raw = location.hash.replace(/^#/, '');
  if (!raw) return;
  const pairs = raw.split('&').map((p) => p.split('='));

  // The preset lands first so per-parameter overrides in the link win over it.
  const presetId = (pairs.find(([k]) => k === 'preset') || [])[1];
  const preset = PRESETS.find((p) => p.id === presetId);
  if (preset) applyPreset(preset, { animate: false });

  const patch = {};
  for (const [k, v] of pairs) {
    const spec = ALL_CONTROLS.find((s) => s.key === k);
    if (!spec) continue;
    const num = Number(v);
    if (!Number.isFinite(num)) continue;
    patch[k] = Math.min(spec.max, Math.max(spec.min, num));
  }
  if (Object.keys(patch).length) {
    renderer.configure(patch);
    // applyPreset above already rewrote the hash, at which point the overrides
    // had not been applied yet — without this the link silently loses them the
    // moment it is opened.
    writeHash();
  }
}

// ─── wiring ──────────────────────────────────────────────────────────────────

buildControls();
buildPresetChips();
readHash();
syncInputs();
document.querySelector('.preset-chip').classList.toggle('on', activePreset.id === PRESETS[0].id);
$('presetNote').textContent = activePreset.note;

const panel = $('panel');
function setPanel(open) {
  panel.classList.toggle('open', open);
  document.body.classList.toggle('panel-open', open);
  $('panelToggle').setAttribute('aria-expanded', String(open));
  if (open) $('panelClose').focus();
}
$('panelToggle').addEventListener('click', () => setPanel(true));
$('panelClose').addEventListener('click', () => setPanel(false));

$('reset').addEventListener('click', () => {
  applyPreset(PRESETS[0], { animate: false });
  renderer.resetView();
  $('presetNote').textContent = PRESETS[0].note;
  history.replaceState(null, '', location.pathname + location.search);
  toast('Reset to defaults');
});

$('copyLink').addEventListener('click', async () => {
  writeHash();
  try {
    await navigator.clipboard.writeText(location.href);
    toast('Link copied');
  } catch {
    prompt('Copy this link:', location.href);
  }
});

// ─── orbit and zoom ──────────────────────────────────────────────────────────
// Pointer events cover mouse, trackpad and touch in one path, but every active
// pointer has to be tracked separately. Keeping a single lastX/lastY meant a
// second finger overwrote the first one's coordinates, so the next move
// reported the distance *between the fingers* as drag distance — which pinned
// the elevation at a pole and locked the view flat.

const pointers = new Map();     // pointerId → {x, y}
let dragId = null;              // the pointer currently orbiting, if any
let lastX = 0, lastY = 0, lastMoveTime = 0;
let velX = 0, velY = 0;
let pinchStartSpan = 0;
let pinchStartDistance = 0;

canvas.style.touchAction = 'none';
canvas.style.cursor = 'grab';

const CAMERA_MIN = 2;
const CAMERA_MAX = 20;

function setCameraDistance(v) {
  const d = Math.min(CAMERA_MAX, Math.max(CAMERA_MIN, v));
  renderer.configure({ cameraDistance: d });
  const entry = inputs.get('cameraDistance');
  if (entry) {
    entry.input.value = d;
    entry.val.textContent = format(d, entry.spec.step);
  }
  writeHash();
}

/** Distance between the first two active pointers. */
function pointerSpan() {
  const [a, b] = [...pointers.values()];
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function beginOrbit(e) {
  dragId = e.pointerId;
  lastX = e.clientX; lastY = e.clientY;
  lastMoveTime = e.timeStamp;
  velX = velY = 0;
  canvas.style.cursor = 'grabbing';
}

function beginPinch() {
  dragId = null;                // a pinch is never also an orbit
  canvas.style.cursor = 'grab';
  pinchStartSpan = pointerSpan();
  pinchStartDistance = renderer.params.cameraDistance;
}

canvas.addEventListener('pointerdown', (e) => {
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 1) beginOrbit(e);
  else if (pointers.size === 2) beginPinch();
  // Last, and guarded: capture can throw if the pointer is already gone, and
  // that must not abort the gesture setup above.
  try { canvas.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
});

canvas.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  p.x = e.clientX; p.y = e.clientY;

  if (pointers.size >= 2) {
    // Fingers apart → closer. The ratio is taken against the span at gesture
    // start, not the previous frame, so rounding cannot accumulate into drift.
    if (pinchStartSpan > 8) {
      setCameraDistance(pinchStartDistance * (pinchStartSpan / Math.max(8, pointerSpan())));
    }
    return;
  }

  if (e.pointerId !== dragId) return;
  const dx = e.clientX - lastX;
  const dy = e.clientY - lastY;
  lastX = e.clientX; lastY = e.clientY;

  // A full drag across the viewport turns roughly half a revolution.
  const az = (dx / Math.max(1, canvas.clientWidth)) * Math.PI * 2;
  const el = (dy / Math.max(1, canvas.clientHeight)) * Math.PI;
  renderer.orbitBy(-az, -el);

  const dt = Math.max(1, e.timeStamp - lastMoveTime) / 1000;
  lastMoveTime = e.timeStamp;
  velX = -az / dt;
  velY = -el / dt;
});

function endPointer(e) {
  if (!pointers.has(e.pointerId)) return;
  pointers.delete(e.pointerId);
  try { canvas.releasePointerCapture(e.pointerId); } catch { /* already gone */ }

  if (pointers.size === 1) {
    // Lifting one finger of a pinch hands control to the survivor. Its
    // coordinates are re-seeded first, or the view would jump by the gap.
    const [id] = [...pointers.keys()];
    const p = pointers.get(id);
    dragId = id;
    lastX = p.x; lastY = p.y;
    lastMoveTime = e.timeStamp;
    velX = velY = 0;
    return;
  }
  if (pointers.size > 0) return;

  const wasOrbiting = dragId !== null;
  dragId = null;
  canvas.style.cursor = 'grab';
  // Only a genuine flick coasts; a slow drag should stop where it was left.
  if (wasOrbiting && Math.hypot(velX, velY) > 0.35) renderer.flick(velX, velY);
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);

// Wheel and trackpad zoom. A pinch on a Mac trackpad arrives as a wheel event
// with ctrlKey set and much smaller deltas, hence the two sensitivities.
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const k = e.ctrlKey ? 0.012 : 0.0018;
  setCameraDistance(renderer.params.cameraDistance * Math.exp(e.deltaY * k));
}, { passive: false });

$('resetView').addEventListener('click', () => {
  renderer.resetView();
  toast('View reset');
});

$('fullscreen').addEventListener('click', () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.().catch(() => toast('Fullscreen blocked'));
});

document.addEventListener('keydown', (e) => {
  if (e.target.matches('input, select, audio')) return;
  if (e.key === 'Escape') setPanel(false);
  if (e.key === 'c' && !e.metaKey && !e.ctrlKey) setPanel(!panel.classList.contains('open'));
});

// ─── frame loop ──────────────────────────────────────────────────────────────

function resize() {
  // dpr is capped: the piece is bloom-heavy and soft, so beyond 2x the extra
  // fragments buy nothing visible.
  const dpr = Math.min(devicePixelRatio || 1, isMobile ? 2 : 2);
  const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
  const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
}

let last = performance.now();
let elapsed = 0;
let fpsAvg = 60;
let fpsShown = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  elapsed += dt;

  if (document.visibilityState !== 'visible') return;
  resize();
  stepMorph();

  let data;
  if (mode === 'none') data = bins.fill(0);
  else if (mode === 'demo') data = sampleDemo(elapsed);
  else data = sampleAnalyser();

  renderer.render(data, dt, canvas.width, canvas.height);

  fpsAvg = fpsAvg * 0.92 + (1 / Math.max(1e-4, dt)) * 0.08;
  if (now - fpsShown > 400) {
    fpsShown = now;
    $('fps').textContent = `${fpsAvg.toFixed(0)} fps · ${canvas.width}×${canvas.height}`;
  }
}
requestAnimationFrame(frame);

// A first gesture is what lets the AudioContext start on most browsers.
addEventListener('pointerdown', () => { if (ctx) ensureContext(); }, { once: true });
