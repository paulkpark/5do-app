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
    { key: 'alphaSpeed', label: 'Hopf rotation', min: 0, max: 1, step: 0.005 },
    { key: 'flowSpeed', label: 'Particle flow', min: 0, max: 4, step: 0.02 },
    { key: 'cameraDistance', label: 'Camera distance', min: 4, max: 16, step: 0.1 },
    { key: 'particleSize', label: 'Particle size', min: 0, max: 8, step: 0.05 },
    { key: 'particleAlpha', label: 'Particle brightness', min: 0, max: 3, step: 0.02 }
  ],
  lookControls: [
    { key: 'exposure', label: 'Exposure', min: 0.2, max: 3, step: 0.01 },
    { key: 'bloomStrength', label: 'Bloom strength', min: 0, max: 3, step: 0.01 },
    { key: 'bloomThreshold', label: 'Bloom threshold', min: 0, max: 2, step: 0.01 },
    { key: 'vignette', label: 'Vignette', min: 0, max: 1.5, step: 0.01 },
    { key: 'fiberOpacity', label: 'Fiber opacity', min: 0.05, max: 1, step: 0.01 },
    { key: 'sheenStrength', label: 'Sheen', min: 0, max: 2, step: 0.01 },
    { key: 'metalness', label: 'Ring metalness', min: 0, max: 1, step: 0.01 },
    { key: 'roughness', label: 'Ring roughness', min: 0.02, max: 1, step: 0.01 },
    { key: 'envIntensity', label: 'Ring reflectivity', min: 0, max: 3, step: 0.01 },
    { key: 'emissiveStrength', label: 'Ring glow', min: 0, max: 1, step: 0.005 }
  ]
};
const ALL_CONTROLS = Object.values(CONTROLS).flat();

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

// ─── permalink ───────────────────────────────────────────────────────────────
// Only non-default values are written, so a link stays short and readable and
// keeps working when a default is later retuned.

function writeHash() {
  const parts = [];
  for (const spec of ALL_CONTROLS) {
    const v = renderer.params[spec.key];
    if (Math.abs(v - DEFAULTS[spec.key]) > 1e-9) parts.push(`${spec.key}=${+v.toFixed(4)}`);
  }
  const hash = parts.join('&');
  history.replaceState(null, '', hash ? '#' + hash : location.pathname + location.search);
}

function readHash() {
  const raw = location.hash.replace(/^#/, '');
  if (!raw) return;
  const patch = {};
  for (const pair of raw.split('&')) {
    const [k, v] = pair.split('=');
    const spec = ALL_CONTROLS.find((s) => s.key === k);
    if (!spec) continue;
    const num = Number(v);
    if (!Number.isFinite(num)) continue;
    patch[k] = Math.min(spec.max, Math.max(spec.min, num));
  }
  if (Object.keys(patch).length) renderer.configure(patch);
}

// ─── wiring ──────────────────────────────────────────────────────────────────

buildControls();
readHash();
syncInputs();

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
  renderer.configure({ ...DEFAULTS });
  syncInputs();
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
