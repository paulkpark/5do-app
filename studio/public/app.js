// Karleido Studio — client (Stage A)
// WebGL preview + sectioned params + palette system + user preset library +
// Supabase tracks + local upload + live input + in-browser recording.

// ────────────────────────────────────────────────────
// Supabase config
// ────────────────────────────────────────────────────
const SUPABASE_URL = 'https://xdjgumqdwedgzwqturcx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhkamd1bXFkd2VkZ3p3cXR1cmN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA1MDQzNDUsImV4cCI6MjA3NjA4MDM0NX0.pZcnU1xMaaBBdvytSTVrLPsLU9r_3FPzCPSUeBFUsaU';
const BUCKET = 'media';
const MEDIA_BASE = SUPABASE_URL + '/storage/v1/object/public/' + BUCKET;
let SB = null;

const LS_USER_PRESETS = 'karleido.userPresets.v1';
const LS_LAST_STATE   = 'karleido.lastState.v1';

// ────────────────────────────────────────────────────
// State
// ────────────────────────────────────────────────────
const S = {
  presets: [],
  palettes: [],
  current: null,          // active preset
  paramValues: {},
  audioMap: {},
  paletteId: 'ocean-sunset',
  paletteMix: 0.85,
  beatMove: true,
  beatGlow: 0.0,          // extra gain on u_beat
  beatSensitivity: 0.12,  // threshold for beat detection
  track: null,
  audio: null,
  audioCtx: null,
  analyser: null,
  sourceNode: null,       // current connected node (media element or mic)
  inputMode: 'track',     // 'track' | 'live'
  freqData: null,
  bass: 0, mid: 0, treble: 0,
  beat: 0,
  lastBass: 0,
  playing: false,
  loop: false,
  recorder: null,
  recording: false,
  userPresets: [],
  lib: { level: 'categories', categories: null, tracks: {} },
};

// ────────────────────────────────────────────────────
// WebGL
// ────────────────────────────────────────────────────
const canvas = document.getElementById('previewCanvas');
const gl = canvas.getContext('webgl', { antialias: true, preserveDrawingBuffer: true });
if (!gl) { alert('WebGL 미지원 브라우저'); throw new Error('no webgl'); }

const VS_SRC = 'attribute vec2 a_pos; void main(){ gl_Position = vec4(a_pos, 0.0, 1.0); }';
const vs = gl.createShader(gl.VERTEX_SHADER);
gl.shaderSource(vs, VS_SRC); gl.compileShader(vs);

const quadBuf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);

let program = null;
let uniLocs = {};

function compileFrag(src) {
  const fs = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(fs, src); gl.compileShader(fs);
  if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
    console.error('FS error:', gl.getShaderInfoLog(fs));
    console.error(src);
    gl.deleteShader(fs); return null;
  }
  const p = gl.createProgram();
  gl.attachShader(p, vs); gl.attachShader(p, fs);
  gl.linkProgram(p);
  gl.deleteShader(fs);
  return gl.getProgramParameter(p, gl.LINK_STATUS) ? p : null;
}

function setupProgram(frag, preset) {
  if (program) gl.deleteProgram(program);
  program = compileFrag(frag);
  if (!program) return;
  gl.useProgram(program);
  const aPos = gl.getAttribLocation(program, 'a_pos');
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  uniLocs = {
    u_time: gl.getUniformLocation(program, 'u_time'),
    u_resolution: gl.getUniformLocation(program, 'u_resolution'),
    u_bass: gl.getUniformLocation(program, 'u_bass'),
    u_mid: gl.getUniformLocation(program, 'u_mid'),
    u_treble: gl.getUniformLocation(program, 'u_treble'),
    u_beat: gl.getUniformLocation(program, 'u_beat'),
    u_colorA: gl.getUniformLocation(program, 'u_colorA'),
    u_colorB: gl.getUniformLocation(program, 'u_colorB'),
    u_colorC: gl.getUniformLocation(program, 'u_colorC'),
    u_paletteMix: gl.getUniformLocation(program, 'u_paletteMix'),
  };
  Object.keys(preset.params).forEach(k => {
    uniLocs['u_' + k] = gl.getUniformLocation(program, 'u_' + k);
  });
}

// ────────────────────────────────────────────────────
// Render loop
// ────────────────────────────────────────────────────
const t0 = performance.now();
function frame() {
  const t = (performance.now() - t0) / 1000;
  updateAudioMetrics();

  gl.viewport(0, 0, canvas.width, canvas.height);
  if (!S.current || !program) {
    gl.clearColor(0.04, 0.04, 0.06, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  } else {
    gl.useProgram(program);
    const pal = currentPalette();
    if (uniLocs.u_time)       gl.uniform1f(uniLocs.u_time, t);
    if (uniLocs.u_resolution) gl.uniform2f(uniLocs.u_resolution, canvas.width, canvas.height);
    if (uniLocs.u_bass)       gl.uniform1f(uniLocs.u_bass, S.bass);
    if (uniLocs.u_mid)        gl.uniform1f(uniLocs.u_mid, S.mid);
    if (uniLocs.u_treble)     gl.uniform1f(uniLocs.u_treble, S.treble);
    // Effective beat = raw beat × (beatMove on ? 1 : 0) boosted by beatGlow
    const effBeat = (S.beatMove ? S.beat : 0) * (1 + S.beatGlow * 2);
    if (uniLocs.u_beat)       gl.uniform1f(uniLocs.u_beat, effBeat);
    if (uniLocs.u_colorA)     gl.uniform3fv(uniLocs.u_colorA, pal.a);
    if (uniLocs.u_colorB)     gl.uniform3fv(uniLocs.u_colorB, pal.b);
    if (uniLocs.u_colorC)     gl.uniform3fv(uniLocs.u_colorC, pal.c);
    if (uniLocs.u_paletteMix) gl.uniform1f(uniLocs.u_paletteMix, S.paletteMix);

    Object.keys(S.current.params).forEach(k => {
      const loc = uniLocs['u_' + k];
      if (!loc) return;
      let v = S.paramValues[k];
      const src = S.audioMap[k];
      if (S.beatMove) {
        if (src === 'bass')   v *= 1.0 + S.bass * 0.5;
        else if (src === 'mid')    v *= 1.0 + S.mid * 0.5;
        else if (src === 'treble') v *= 1.0 + S.treble * 0.5;
      }
      gl.uniform1f(loc, v);
    });
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  S.beat = Math.max(0, S.beat - 0.045);
  document.getElementById('meterBass').style.height   = (S.bass   * 100).toFixed(1) + '%';
  document.getElementById('meterMid').style.height    = (S.mid    * 100).toFixed(1) + '%';
  document.getElementById('meterTreble').style.height = (S.treble * 100).toFixed(1) + '%';

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ────────────────────────────────────────────────────
// Audio — Media element mode
// ────────────────────────────────────────────────────
function ensureAudioCtx() {
  if (!S.audioCtx) S.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (S.audioCtx.state === 'suspended') S.audioCtx.resume();
}

function setupAudioElement(src) {
  ensureAudioCtx();
  disconnectCurrentSource();
  if (S.audio) { try { S.audio.pause(); } catch (_) {} }
  const a = new Audio();
  a.crossOrigin = 'anonymous';
  a.src = src;
  a.preload = 'auto';
  a.loop = S.loop;
  S.audio = a;

  const node = S.audioCtx.createMediaElementSource(a);
  const analyser = S.audioCtx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.55;
  node.connect(analyser);
  analyser.connect(S.audioCtx.destination);
  S.sourceNode = node;
  S.analyser = analyser;
  S.freqData = new Uint8Array(analyser.frequencyBinCount);
  S.inputMode = 'track';

  a.addEventListener('timeupdate', onTime);
  a.addEventListener('loadedmetadata', onTime);
  a.addEventListener('ended', () => {
    if (!S.loop) { S.playing = false; updatePlayUI(); }
  });
}

function disconnectCurrentSource() {
  try { if (S.sourceNode) S.sourceNode.disconnect(); } catch (_) {}
  try { if (S.analyser) S.analyser.disconnect(); } catch (_) {}
  S.sourceNode = null; S.analyser = null;
}

async function enableLiveInput() {
  ensureAudioCtx();
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    disconnectCurrentSource();
    if (S.audio) { try { S.audio.pause(); } catch (_) {} }
    S.playing = false;
    updatePlayUI();
    const node = S.audioCtx.createMediaStreamSource(stream);
    const analyser = S.audioCtx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.55;
    node.connect(analyser);
    // NOTE: don't pipe mic to destination → avoids feedback
    S.sourceNode = node;
    S.analyser = analyser;
    S.freqData = new Uint8Array(analyser.frequencyBinCount);
    S.inputMode = 'live';
    document.getElementById('currentTrackName').textContent = '🎙 LIVE INPUT';
    document.getElementById('previewOverlay').classList.add('hide');
    document.getElementById('renderBtn').disabled = true; // no render in live mode
    document.getElementById('playBtn').disabled = true;
    document.getElementById('importAudioBtn').classList.remove('on');
    document.getElementById('liveInputBtn').classList.add('on');
  } catch (e) {
    alert('마이크 접근 실패: ' + (e.message || e));
  }
}

function updateAudioMetrics() {
  if (!S.analyser) return;
  S.analyser.getByteFrequencyData(S.freqData);
  const n = S.freqData.length;
  const bEnd = Math.max(1, Math.floor(n * 0.08));
  const mEnd = Math.max(bEnd + 1, Math.floor(n * 0.35));
  let bass = 0, mid = 0, treble = 0;
  for (let i = 0; i < bEnd; i++) bass += S.freqData[i];
  for (let i = bEnd; i < mEnd; i++) mid += S.freqData[i];
  for (let i = mEnd; i < n; i++) treble += S.freqData[i];
  bass = bass / bEnd / 255;
  mid = mid / (mEnd - bEnd) / 255;
  treble = treble / (n - mEnd) / 255;
  S.bass   = S.bass   * 0.55 + bass   * 0.45;
  S.mid    = S.mid    * 0.55 + mid    * 0.45;
  S.treble = S.treble * 0.55 + treble * 0.45;
  if (bass - S.lastBass > S.beatSensitivity && bass > 0.32) S.beat = 1.0;
  S.lastBass = bass;
}

// ────────────────────────────────────────────────────
// Palettes
// ────────────────────────────────────────────────────
function hexToRgbArr(h) {
  const r = parseInt(h.slice(1,3), 16) / 255;
  const g = parseInt(h.slice(3,5), 16) / 255;
  const b = parseInt(h.slice(5,7), 16) / 255;
  return [r, g, b];
}
function currentPalette() {
  const pal = S.palettes.find(p => p.id === S.paletteId) || S.palettes[0];
  return { a: hexToRgbArr(pal.a), b: hexToRgbArr(pal.b), c: hexToRgbArr(pal.c) };
}

// ────────────────────────────────────────────────────
// Init
// ────────────────────────────────────────────────────
async function init() {
  const [presetsRes, palettesRes] = await Promise.all([
    fetch('/api/presets').then(r => r.json()),
    fetch('/api/palettes').then(r => r.json()),
  ]);
  S.presets = presetsRes;
  S.palettes = palettesRes;

  loadUserPresets();
  renderPresetGrid();
  await selectPreset(S.presets[0].id);

  // Supabase client
  if (window.supabase) {
    SB = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    loadCategories();
  } else {
    document.getElementById('trackList').innerHTML =
      '<div class="empty">Supabase SDK 로드 실패</div>';
  }

  // Left tabs
  document.querySelectorAll('.ltab').forEach(b => {
    b.addEventListener('click', () => {
      const name = b.dataset.tab;
      document.querySelectorAll('.ltab').forEach(x => x.classList.toggle('on', x === b));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.toggle('on', p.dataset.tab === name));
    });
  });

  // Media sub-tabs
  document.querySelectorAll('.sub-tabs .tab').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.sub-tabs .tab').forEach(t => t.classList.remove('on'));
      b.classList.add('on');
      const s = b.dataset.source;
      document.getElementById('supabasePane').style.display = s === 'supabase' ? '' : 'none';
      document.getElementById('uploadPane').style.display   = s === 'upload'   ? '' : 'none';
    });
  });

  // Upload — push to server so Puppeteer can fetch the same URL
  const uploadBtn = document.getElementById('uploadBtn');
  const uploadInput = document.getElementById('uploadInput');
  uploadBtn.addEventListener('click', () => uploadInput.click());
  uploadInput.addEventListener('change', async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    await uploadLocalAudio(f);
  });

  // Transport
  document.getElementById('playBtn').addEventListener('click', togglePlay);
  document.getElementById('seekBar').addEventListener('input', (e) => {
    if (S.audio && isFinite(S.audio.duration)) {
      S.audio.currentTime = (e.target.value / 100) * S.audio.duration;
    }
  });
  document.getElementById('loopBtn').addEventListener('click', toggleLoop);
  document.getElementById('recordBtn').addEventListener('click', toggleRecord);
  document.getElementById('fullscreenBtn').addEventListener('click', toggleFullscreen);

  // Audio source
  document.getElementById('importAudioBtn').addEventListener('click', () => {
    document.querySelectorAll('.ltab').forEach(x => x.classList.toggle('on', x.dataset.tab === 'media'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.toggle('on', p.dataset.tab === 'media'));
  });
  document.getElementById('liveInputBtn').addEventListener('click', () => {
    if (S.inputMode === 'live') return;
    enableLiveInput();
  });

  // User Presets
  document.getElementById('savePresetBtn').addEventListener('click', saveCurrentAsPreset);
  document.getElementById('presetSearch').addEventListener('input', (e) => renderUserPresets(e.target.value));

  // Render — server-side Puppeteer + ffmpeg
  document.getElementById('renderBtn').addEventListener('click', startServerRender);
  document.getElementById('ytBtn').addEventListener('click', () => {
    alert('YouTube 업로드는 Step 6에서 구현됩니다.');
  });

  renderUserPresets();
}
init();

// ────────────────────────────────────────────────────
// Preset grid + param rendering
// ────────────────────────────────────────────────────
function renderPresetGrid() {
  const grid = document.getElementById('presetGrid');
  grid.innerHTML = '';
  S.presets.forEach(p => {
    const card = document.createElement('div');
    card.className = 'preset-card';
    card.dataset.id = p.id;
    card.innerHTML = '<div class="preset-card-name">' + p.name + '</div>';
    card.addEventListener('click', () => selectPreset(p.id));
    grid.appendChild(card);
  });
}

async function selectPreset(id) {
  const preset = S.presets.find(p => p.id === id);
  if (!preset) return;
  S.current = preset;
  document.querySelectorAll('.preset-card').forEach(c => c.classList.toggle('on', c.dataset.id === id));
  document.getElementById('presetDesc').textContent = preset.description;
  const r = await fetch('/shaders/' + preset.shader);
  const frag = await r.text();
  setupProgram(frag, preset);
  S.paramValues = {};
  S.audioMap = preset.audioMap || {};
  Object.keys(preset.params).forEach(k => { S.paramValues[k] = preset.params[k].default; });
  renderParamSections();
}

function renderParamSections() {
  const mount = document.getElementById('paramSections');
  mount.innerHTML = '';
  const p = S.current;
  const groups = { general: [], shape: [], color: [] };
  Object.keys(p.params).forEach(k => {
    const def = p.params[k];
    const sec = def.section || 'general';
    (groups[sec] || groups.general).push([k, def]);
  });

  // GENERAL / PARAMETERS section
  mount.appendChild(makeParamSection('PARAMETERS', groups.general, true));
  // AUDIO REACTIVE section (global toggles)
  mount.appendChild(makeAudioSection());
  // SHAPE section
  if (groups.shape.length) mount.appendChild(makeParamSection('SHAPE', groups.shape));
  // COLOR section (global palette + per-preset color params)
  mount.appendChild(makeColorSection(groups.color));
}

function makeParamSection(title, entries, addShuffleReset) {
  const sec = document.createElement('div');
  sec.className = 'param-section';
  sec.innerHTML =
    '<div class="param-section-head">' +
      '<div class="param-section-title">' + title + '</div>' +
      '<div class="section-icons">' +
        (addShuffleReset ? iconBtnHTML('shuffle', 'Randomize') + iconBtnHTML('reset', 'Reset') : '') +
      '</div>' +
    '</div>';
  entries.forEach(([k, def]) => sec.appendChild(makeParamRow(k, def)));
  // Shuffle/reset handlers
  sec.querySelectorAll('.icon-mini[data-action=shuffle]').forEach(b =>
    b.addEventListener('click', () => randomizeParams(entries))
  );
  sec.querySelectorAll('.icon-mini[data-action=reset]').forEach(b =>
    b.addEventListener('click', () => resetParams(entries))
  );
  return sec;
}

function makeAudioSection() {
  const sec = document.createElement('div');
  sec.className = 'param-section';
  sec.innerHTML =
    '<div class="param-section-head">' +
      '<div class="param-section-title">AUDIO REACTIVE</div>' +
    '</div>' +
    '<div class="param-toggle">' +
      '<span class="param-label">Beat Move</span>' +
      '<div class="toggle' + (S.beatMove ? ' on' : '') + '" id="beatMoveToggle"></div>' +
    '</div>' +
    '<div class="param-row">' +
      '<div class="param-head"><span class="param-label">Beat Glow</span>' +
      '<span class="param-value" id="pv-beatGlow">' + S.beatGlow.toFixed(2) + '</span></div>' +
      '<input type="range" class="param-slider" id="ps-beatGlow" min="0" max="1.5" step="0.01" value="' + S.beatGlow + '">' +
    '</div>' +
    '<div class="param-row">' +
      '<div class="param-head"><span class="param-label">Beat Sensitivity</span>' +
      '<span class="param-value" id="pv-beatSens">' + S.beatSensitivity.toFixed(2) + '</span></div>' +
      '<input type="range" class="param-slider" id="ps-beatSens" min="0.04" max="0.30" step="0.01" value="' + S.beatSensitivity + '">' +
    '</div>';
  sec.querySelector('#beatMoveToggle').addEventListener('click', (e) => {
    S.beatMove = !S.beatMove;
    e.currentTarget.classList.toggle('on', S.beatMove);
    saveLastState();
  });
  sec.querySelector('#ps-beatGlow').addEventListener('input', (e) => {
    S.beatGlow = parseFloat(e.target.value);
    sec.querySelector('#pv-beatGlow').textContent = S.beatGlow.toFixed(2);
    saveLastState();
  });
  sec.querySelector('#ps-beatSens').addEventListener('input', (e) => {
    S.beatSensitivity = parseFloat(e.target.value);
    sec.querySelector('#pv-beatSens').textContent = S.beatSensitivity.toFixed(2);
    saveLastState();
  });
  return sec;
}

function makeColorSection(entries) {
  const sec = document.createElement('div');
  sec.className = 'param-section';
  const paletteOpts = S.palettes.map(p =>
    '<option value="' + p.id + '"' + (p.id === S.paletteId ? ' selected' : '') + '>' + p.name + '</option>'
  ).join('');
  sec.innerHTML =
    '<div class="param-section-head">' +
      '<div class="param-section-title">COLOR</div>' +
      '<div class="section-icons">' + iconBtnHTML('shuffle', 'Random palette') + '</div>' +
    '</div>' +
    '<div class="param-row">' +
      '<div class="param-head"><span class="param-label">Palette</span></div>' +
      '<select class="param-select" id="paletteSelect">' + paletteOpts + '</select>' +
      '<div class="palette-strip" id="paletteStrip"></div>' +
    '</div>' +
    '<div class="param-row">' +
      '<div class="param-head"><span class="param-label">Palette Mix</span>' +
      '<span class="param-value" id="pv-paletteMix">' + S.paletteMix.toFixed(2) + '</span></div>' +
      '<input type="range" class="param-slider" id="ps-paletteMix" min="0" max="1" step="0.01" value="' + S.paletteMix + '">' +
    '</div>';
  entries.forEach(([k, def]) => sec.appendChild(makeParamRow(k, def)));

  sec.querySelector('#paletteSelect').addEventListener('change', (e) => {
    S.paletteId = e.target.value;
    renderPaletteStrip(sec.querySelector('#paletteStrip'));
    saveLastState();
  });
  sec.querySelector('#ps-paletteMix').addEventListener('input', (e) => {
    S.paletteMix = parseFloat(e.target.value);
    sec.querySelector('#pv-paletteMix').textContent = S.paletteMix.toFixed(2);
    saveLastState();
  });
  sec.querySelector('.icon-mini[data-action=shuffle]').addEventListener('click', () => {
    const idx = Math.floor(Math.random() * S.palettes.length);
    S.paletteId = S.palettes[idx].id;
    sec.querySelector('#paletteSelect').value = S.paletteId;
    renderPaletteStrip(sec.querySelector('#paletteStrip'));
    saveLastState();
  });
  renderPaletteStrip(sec.querySelector('#paletteStrip'));
  return sec;
}

function renderPaletteStrip(strip) {
  const pal = S.palettes.find(p => p.id === S.paletteId) || S.palettes[0];
  strip.innerHTML =
    '<div style="background:' + pal.a + '"></div>' +
    '<div style="background:' + pal.b + '"></div>' +
    '<div style="background:' + pal.c + '"></div>';
}

function makeParamRow(k, def) {
  const v = S.paramValues[k];
  const aSrc = S.audioMap[k];
  const audioTag = aSrc && aSrc !== 'none'
    ? '<span class="audio-tag">↳ ' + aSrc + '</span>' : '';
  const row = document.createElement('div');
  row.className = 'param-row';
  const isInt = def.type === 'int';
  const step = isInt ? 1 : 0.01;
  row.innerHTML =
    '<div class="param-head">' +
      '<span class="param-label">' + (def.label || k) + audioTag + '</span>' +
      '<span class="param-value" id="pv-' + k + '">' + fmtVal(v, isInt) + '</span>' +
    '</div>' +
    '<input type="range" class="param-slider" min="' + def.min + '" max="' + def.max +
      '" step="' + step + '" value="' + v + '" id="ps-' + k + '">';
  row.querySelector('input').addEventListener('input', (e) => {
    const nv = parseFloat(e.target.value);
    S.paramValues[k] = nv;
    document.getElementById('pv-' + k).textContent = fmtVal(nv, isInt);
    saveLastState();
  });
  return row;
}

function iconBtnHTML(action, title) {
  const icons = {
    shuffle: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>',
    reset:   '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>',
  };
  return '<button class="icon-mini" data-action="' + action + '" title="' + title + '">' + (icons[action] || '') + '</button>';
}

function randomizeParams(entries) {
  entries.forEach(([k, def]) => {
    const r = Math.random();
    const v = def.type === 'int'
      ? Math.round(def.min + r * (def.max - def.min))
      : def.min + r * (def.max - def.min);
    S.paramValues[k] = v;
    const el = document.getElementById('ps-' + k);
    if (el) el.value = v;
    const pv = document.getElementById('pv-' + k);
    if (pv) pv.textContent = fmtVal(v, def.type === 'int');
  });
  saveLastState();
}

function resetParams(entries) {
  entries.forEach(([k, def]) => {
    S.paramValues[k] = def.default;
    const el = document.getElementById('ps-' + k);
    if (el) el.value = def.default;
    const pv = document.getElementById('pv-' + k);
    if (pv) pv.textContent = fmtVal(def.default, def.type === 'int');
  });
  saveLastState();
}

function fmtVal(v, isInt) {
  return isInt ? String(Math.round(v)) : v.toFixed(2);
}

// ────────────────────────────────────────────────────
// User preset library (localStorage)
// ────────────────────────────────────────────────────
function loadUserPresets() {
  try {
    const raw = localStorage.getItem(LS_USER_PRESETS);
    S.userPresets = raw ? JSON.parse(raw) : [];
  } catch (_) { S.userPresets = []; }
}

function saveUserPresets() {
  localStorage.setItem(LS_USER_PRESETS, JSON.stringify(S.userPresets));
}

function saveCurrentAsPreset() {
  const input = document.getElementById('presetNameInput');
  const name = (input.value || '').trim();
  if (!name) { input.focus(); return; }
  const entry = {
    id: 'up-' + Date.now(),
    name,
    shaderId: S.current.id,
    params: JSON.parse(JSON.stringify(S.paramValues)),
    paletteId: S.paletteId,
    paletteMix: S.paletteMix,
    beatMove: S.beatMove,
    beatGlow: S.beatGlow,
    beatSensitivity: S.beatSensitivity,
    fav: false,
    createdAt: Date.now(),
  };
  S.userPresets.unshift(entry);
  saveUserPresets();
  input.value = '';
  renderUserPresets();
}

function renderUserPresets(filter) {
  const list = document.getElementById('userPresetsList');
  const q = (filter || '').toLowerCase().trim();
  const rows = S.userPresets.filter(p => !q || p.name.toLowerCase().includes(q));
  // Favorites first
  rows.sort((a, b) => (b.fav ? 1 : 0) - (a.fav ? 1 : 0));
  if (!rows.length) {
    list.innerHTML = '<div class="empty">' + (q ? '일치하는 프리셋 없음' : '저장된 프리셋이 없어요') + '</div>';
    return;
  }
  list.innerHTML = '';
  rows.forEach(p => {
    const shaderName = (S.presets.find(x => x.id === p.shaderId) || {}).name || p.shaderId;
    const paletteName = (S.palettes.find(x => x.id === p.paletteId) || {}).name || '';
    const row = document.createElement('div');
    row.className = 'userpreset-item';
    row.innerHTML =
      '<div class="userpreset-info">' +
        '<div class="userpreset-name">' + escapeHtml(p.name) + '</div>' +
        '<div class="userpreset-meta">' + shaderName + ' · ' + paletteName + '</div>' +
      '</div>' +
      '<div class="userpreset-actions">' +
        '<button class="star-btn' + (p.fav ? ' on' : '') + '" title="즐겨찾기">★</button>' +
        '<button class="del-btn" title="삭제">✕</button>' +
      '</div>';
    row.querySelector('.star-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      p.fav = !p.fav;
      saveUserPresets();
      renderUserPresets(document.getElementById('presetSearch').value);
    });
    row.querySelector('.del-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      if (!confirm('Delete "' + p.name + '"?')) return;
      S.userPresets = S.userPresets.filter(x => x.id !== p.id);
      saveUserPresets();
      renderUserPresets(document.getElementById('presetSearch').value);
    });
    row.addEventListener('click', (ev) => {
      document.querySelectorAll('.userpreset-item').forEach(el => el.classList.remove('on'));
      row.classList.add('on');
      applyUserPreset(p);
    });
    list.appendChild(row);
  });
}

async function applyUserPreset(p) {
  if (p.shaderId !== (S.current && S.current.id)) {
    await selectPreset(p.shaderId);
  }
  Object.keys(p.params || {}).forEach(k => {
    if (k in S.paramValues) {
      S.paramValues[k] = p.params[k];
      const el = document.getElementById('ps-' + k);
      if (el) el.value = p.params[k];
      const pv = document.getElementById('pv-' + k);
      if (pv) {
        const def = S.current.params[k];
        pv.textContent = fmtVal(p.params[k], def && def.type === 'int');
      }
    }
  });
  if (p.paletteId) S.paletteId = p.paletteId;
  if (typeof p.paletteMix === 'number') S.paletteMix = p.paletteMix;
  if (typeof p.beatMove === 'boolean') S.beatMove = p.beatMove;
  if (typeof p.beatGlow === 'number') S.beatGlow = p.beatGlow;
  if (typeof p.beatSensitivity === 'number') S.beatSensitivity = p.beatSensitivity;
  renderParamSections(); // rebuild with new values
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function saveLastState() {
  try {
    const snap = {
      shaderId: S.current && S.current.id,
      params: S.paramValues,
      paletteId: S.paletteId,
      paletteMix: S.paletteMix,
      beatMove: S.beatMove,
      beatGlow: S.beatGlow,
      beatSensitivity: S.beatSensitivity,
    };
    localStorage.setItem(LS_LAST_STATE, JSON.stringify(snap));
  } catch (_) {}
}

// ────────────────────────────────────────────────────
// Supabase library browser
// ────────────────────────────────────────────────────
async function loadCategories() {
  const list = document.getElementById('trackList');
  if (S.lib.categories) { renderCategories(); return; }
  list.innerHTML = '<div class="empty">카테고리 로드 중…</div>';
  try {
    const { data, error } = await SB.storage.from(BUCKET).list('', { limit: 200 });
    if (error) throw error;
    const folders = (data || [])
      .filter(it => it.id === null && !it.name.startsWith('_') && !it.name.startsWith('.'))
      .map(f => f.name)
      .sort((a, b) => a.localeCompare(b));
    S.lib.categories = folders;
    renderCategories();
  } catch (e) {
    list.innerHTML = '<div class="empty">로드 실패: ' + (e.message || e) + '</div>';
  }
}

function renderCategories() {
  S.lib.level = 'categories';
  const list = document.getElementById('trackList');
  list.innerHTML = '';
  (S.lib.categories || []).forEach(c => {
    const item = document.createElement('div');
    item.className = 'track-item';
    item.innerHTML = '<div>📁 ' + prettyName(c) + '</div><div class="track-cat">CATEGORY</div>';
    item.addEventListener('click', () => loadTracks(c));
    list.appendChild(item);
  });
}

async function loadTracks(category) {
  S.lib.level = 'tracks';
  const list = document.getElementById('trackList');
  if (S.lib.tracks[category]) { renderTracks(category, S.lib.tracks[category]); return; }
  list.innerHTML = '<div class="empty">트랙 로드 중…</div>';
  try {
    const all = [];
    let page = 0, more = true;
    while (more) {
      const { data, error } = await SB.storage.from(BUCKET).list(category, { limit: 100, offset: page * 100 });
      if (error) throw error;
      for (const it of (data || [])) {
        if (/\.(mp3|m4a|aac|wav|flac|ogg)$/i.test(it.name) && !/_qtx\./i.test(it.name)) all.push(it.name);
      }
      more = (data || []).length === 100;
      page++;
    }
    all.sort((a, b) => a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' }));
    S.lib.tracks[category] = all;
    renderTracks(category, all);
  } catch (e) {
    list.innerHTML = '<div class="empty">로드 실패: ' + (e.message || e) + '</div>';
  }
}

function renderTracks(category, tracks) {
  const list = document.getElementById('trackList');
  list.innerHTML = '';
  const back = document.createElement('div');
  back.className = 'track-item';
  back.style.color = 'var(--text-tertiary)';
  back.innerHTML = '← 카테고리 목록';
  back.addEventListener('click', () => renderCategories());
  list.appendChild(back);
  if (!tracks.length) {
    list.innerHTML += '<div class="empty">이 카테고리에 트랙이 없어요</div>';
    return;
  }
  tracks.forEach(filename => {
    const item = document.createElement('div');
    item.className = 'track-item';
    const pretty = filename.replace(/\.(mp3|m4a|aac|wav|flac|ogg)$/i, '');
    item.innerHTML =
      '<div>' + pretty + '</div>' +
      '<div class="track-cat">' + prettyName(category) + '</div>';
    item.addEventListener('click', () => {
      const url = MEDIA_BASE + '/' + encodeURIComponent(category) + '/' + encodeURIComponent(filename);
      setTrack({ name: pretty, src: url, source: 'supabase', category, filename });
      document.querySelectorAll('#trackList .track-item').forEach(i => i.classList.remove('on'));
      item.classList.add('on');
    });
    list.appendChild(item);
  });
}

function prettyName(s) { return s.replace(/_/g, ' '); }

// ────────────────────────────────────────────────────
// Track / Transport
// ────────────────────────────────────────────────────
function setTrack(t) {
  // t = { name, src (playable URL), source: 'supabase'|'local'|'uploaded', renderUrl?, ... }
  // renderUrl = URL reachable from Puppeteer (http/https, NOT blob:).
  // For Supabase tracks src is already public URL — reused as renderUrl.
  // For uploaded files caller sets renderUrl = `/uploads/...`.
  if (!t.renderUrl) {
    if (t.source === 'supabase') t.renderUrl = t.src;
    // For 'local' without upload, renderUrl stays undefined → render button disabled below
  }
  S.track = t;
  document.getElementById('currentTrackName').textContent = t.name;
  document.getElementById('playBtn').disabled = false;
  document.getElementById('renderBtn').disabled = !t.renderUrl;
  document.getElementById('previewOverlay').classList.add('hide');
  document.getElementById('importAudioBtn').classList.add('on');
  document.getElementById('liveInputBtn').classList.remove('on');
  setupAudioElement(t.src);
}

// ────────────────────────────────────────────────────
// Local upload → server (so Puppeteer can fetch for render)
// ────────────────────────────────────────────────────
async function uploadLocalAudio(file) {
  const btnTextEl = document.querySelector('#uploadBtn span');
  const origText = btnTextEl ? btnTextEl.textContent : '';
  const btn = document.getElementById('uploadBtn');
  btn.disabled = true;
  if (btnTextEl) btnTextEl.textContent = '업로드 중… 0%';

  try {
    const formData = new FormData();
    formData.append('audio', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload');
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && btnTextEl) {
        const pct = Math.round((e.loaded / e.total) * 100);
        btnTextEl.textContent = '업로드 중… ' + pct + '%';
      }
    });
    const res = await new Promise((resolve, reject) => {
      xhr.onload = () => xhr.status < 400
        ? resolve(JSON.parse(xhr.responseText))
        : reject(new Error('업로드 실패 (' + xhr.status + ')'));
      xhr.onerror = () => reject(new Error('네트워크 오류'));
      xhr.send(formData);
    });

    // Build absolute URL that Puppeteer (same machine) can open
    const absoluteUrl = window.location.origin + res.url;
    setTrack({
      name: res.originalName || file.name,
      src: res.url,          // same-origin, browser plays it
      renderUrl: absoluteUrl,// absolute so headless Chrome can fetch via localhost
      source: 'uploaded',
      filename: res.filename,
      size: res.size,
    });
    if (btnTextEl) btnTextEl.textContent = origText || '오디오 파일 선택';
  } catch (e) {
    alert('업로드 실패: ' + e.message);
    if (btnTextEl) btnTextEl.textContent = origText || '오디오 파일 선택';
  } finally {
    btn.disabled = false;
    // Allow selecting the same file again
    document.getElementById('uploadInput').value = '';
  }
}

function togglePlay() {
  if (!S.audio) return;
  ensureAudioCtx();
  if (S.audio.paused) {
    S.audio.play().then(() => { S.playing = true; updatePlayUI(); }).catch(console.error);
  } else {
    S.audio.pause();
    S.playing = false;
    updatePlayUI();
  }
}

function updatePlayUI() {
  const btn = document.getElementById('playBtn');
  btn.innerHTML = S.playing
    ? '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>'
    : '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
}

function onTime() {
  if (!S.audio) return;
  const c = S.audio.currentTime || 0;
  const d = S.audio.duration || 0;
  document.getElementById('timeLabel').textContent = fmtTime(c) + ' / ' + fmtTime(d);
  if (d > 0) document.getElementById('seekBar').value = (c / d) * 100;
}

function fmtTime(s) {
  if (!isFinite(s)) return '00:00';
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
}

function toggleLoop() {
  S.loop = !S.loop;
  document.getElementById('loopBtn').classList.toggle('on', S.loop);
  if (S.audio) S.audio.loop = S.loop;
}

function toggleFullscreen() {
  const el = document.querySelector('.preview-wrap');
  if (!document.fullscreenElement) el.requestFullscreen().catch(() => {});
  else document.exitFullscreen();
}

// ────────────────────────────────────────────────────
// MediaRecorder — in-browser WebM capture (Stage A bonus)
// ────────────────────────────────────────────────────
function toggleRecord() {
  if (S.recording) stopRecord();
  else startRecord();
}

function startRecord() {
  try {
    ensureAudioCtx();
    const canvasStream = canvas.captureStream(60);
    let combined = canvasStream;
    // If playing a track, merge audio into the video stream
    if (S.audio && S.audioCtx && S.sourceNode) {
      const dest = S.audioCtx.createMediaStreamDestination();
      try { S.sourceNode.connect(dest); } catch (_) {}
      const audioTracks = dest.stream.getAudioTracks();
      if (audioTracks.length) {
        combined = new MediaStream([
          ...canvasStream.getVideoTracks(),
          ...audioTracks,
        ]);
      }
    }
    const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
      ? 'video/webm;codecs=vp9,opus'
      : 'video/webm';
    const mr = new MediaRecorder(combined, { mimeType: mime, videoBitsPerSecond: 12_000_000 });
    const chunks = [];
    mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    mr.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const trackName = (S.track && S.track.name) || 'capture';
      a.download = 'karleido-' + sanitize(trackName) + '-' + Date.now() + '.webm';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    };
    mr.start(500);
    S.recorder = mr;
    S.recording = true;
    document.getElementById('recordBtn').classList.add('rec-on');
    document.getElementById('recIndicator').classList.add('on');
  } catch (e) {
    alert('녹화 시작 실패: ' + e.message);
  }
}

function stopRecord() {
  try { S.recorder && S.recorder.stop(); } catch (_) {}
  S.recording = false;
  S.recorder = null;
  document.getElementById('recordBtn').classList.remove('rec-on');
  document.getElementById('recIndicator').classList.remove('on');
}

function sanitize(s) {
  return (s || '').replace(/[^\w가-힣一-龥\-]+/g, '_').slice(0, 40);
}

// ────────────────────────────────────────────────────
// Server-side render (Step 5)
// ────────────────────────────────────────────────────
let currentRenderJob = null;

async function startServerRender() {
  if (!S.track) { alert('트랙을 먼저 선택해주세요.'); return; }
  if (!S.track.renderUrl) {
    alert('이 트랙은 서버 렌더를 지원하지 않아요.\n(Supabase 또는 업로드된 트랙이어야 합니다.)');
    return;
  }
  if (currentRenderJob && currentRenderJob.polling) {
    alert('이미 진행 중인 렌더 작업이 있어요.');
    return;
  }

  const resolution = document.getElementById('resSelect').value;
  const fps = parseInt(document.getElementById('fpsSelect').value, 10);
  const crf = parseInt(document.getElementById('qualitySelect').value, 10);
  const watermark = document.getElementById('watermarkChk').checked;

  const body = {
    shaderId: S.current.id,
    params: S.paramValues,
    paletteId: S.paletteId,
    paletteMix: S.paletteMix,
    beatMove: S.beatMove,
    beatGlow: S.beatGlow,
    beatSensitivity: S.beatSensitivity,
    trackUrl: S.track.renderUrl,
    trackName: S.track.name,
    resolution, fps, crf,
    watermark,
  };

  showRenderModal();
  setRenderPhase('queued', 0, 'Submitting job…');

  try {
    const res = await fetch('/api/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await res.text());
    const { jobId } = await res.json();
    currentRenderJob = { jobId, polling: true };
    pollRenderStatus(jobId);
  } catch (e) {
    setRenderPhase('error', 0, '시작 실패: ' + e.message);
    currentRenderJob = null;
  }
}

async function pollRenderStatus(jobId) {
  while (currentRenderJob && currentRenderJob.jobId === jobId && currentRenderJob.polling) {
    try {
      const res = await fetch('/api/render/' + jobId + '/status');
      const j = await res.json();
      setRenderPhase(j.status, j.progress, phaseLabel(j.phase), j.error);
      if (j.status === 'complete') {
        currentRenderJob.polling = false;
        showRenderDownload(jobId, j.downloadUrl);
        break;
      }
      if (j.status === 'error') {
        currentRenderJob.polling = false;
        break;
      }
    } catch (e) {
      console.warn('poll error:', e);
    }
    await new Promise(r => setTimeout(r, 1000));
  }
}

function phaseLabel(p) {
  return ({
    'queued': '대기 중',
    'starting': '헤드리스 브라우저 시작',
    'launching-chrome': 'Chrome 실행 중',
    'opening-page': '렌더 페이지 로드',
    'recording': '녹화 중',
    'encoding-mp4': 'MP4 인코딩 (ffmpeg)',
    'done': '완료',
  })[p] || p;
}

function showRenderModal() {
  let m = document.getElementById('renderModal');
  if (m) return;
  m = document.createElement('div');
  m.id = 'renderModal';
  m.className = 'render-modal';
  m.innerHTML =
    '<div class="render-modal-card">' +
      '<div class="render-modal-head">' +
        '<div class="render-modal-title">Rendering</div>' +
        '<button class="render-modal-close" id="renderModalClose">✕</button>' +
      '</div>' +
      '<div class="render-modal-phase" id="renderPhase">대기 중</div>' +
      '<div class="render-progress-bar"><div class="render-progress-fill" id="renderFill"></div></div>' +
      '<div class="render-progress-text" id="renderPct">0%</div>' +
      '<div class="render-modal-actions" id="renderActions"></div>' +
    '</div>';
  document.body.appendChild(m);
  document.getElementById('renderModalClose').addEventListener('click', () => {
    if (currentRenderJob && currentRenderJob.polling) {
      if (!confirm('진행 중인 렌더가 있어요. 모달만 닫고 백그라운드로 계속 할까요?')) return;
    }
    m.remove();
    if (currentRenderJob && !currentRenderJob.polling) currentRenderJob = null;
  });
}

function setRenderPhase(status, progress, phase, error) {
  const fill = document.getElementById('renderFill');
  const pct  = document.getElementById('renderPct');
  const ph   = document.getElementById('renderPhase');
  if (!fill) return;
  fill.style.width = (progress || 0) + '%';
  pct.textContent = Math.round(progress || 0) + '%';
  if (status === 'error') {
    ph.textContent = '⚠ ' + (error || '오류');
    ph.style.color = 'var(--error)';
  } else if (status === 'complete') {
    ph.textContent = '✓ 완료';
    ph.style.color = 'var(--success)';
  } else {
    ph.textContent = phase || status;
    ph.style.color = 'var(--text-secondary)';
  }
}

function showRenderDownload(jobId, downloadUrl) {
  const actions = document.getElementById('renderActions');
  if (!actions) return;
  actions.innerHTML =
    '<a href="' + downloadUrl + '" download class="btn-secondary">' +
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>' +
      '<span>MP4 다운로드</span>' +
    '</a>' +
    '<button class="btn-primary" id="ytUploadBtn">' +
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="#fff"><path d="M23 6.5s-.2-1.6-.9-2.3c-.8-.9-1.7-.9-2.1-1-3-.2-7.5-.2-7.5-.2s-4.5 0-7.5.2c-.4.1-1.3.1-2.1 1-.7.7-.9 2.3-.9 2.3S1.8 8.5 1.8 10.5v1.9c0 2 .2 4 .2 4s.2 1.6.9 2.3c.8.9 1.9.9 2.3 1 1.7.2 7.3.2 7.3.2s4.5 0 7.5-.2c.4-.1 1.3-.1 2.1-1 .7-.7.9-2.3.9-2.3s.2-2 .2-4v-1.9c0-2-.2-4-.2-4zM9.8 14.6V7.9l5.8 3.4-5.8 3.3z"/></svg>' +
      '<span>YouTube 업로드</span>' +
    '</button>';
  document.getElementById('ytUploadBtn').addEventListener('click', () => openYoutubeDialog(jobId));
}

// ────────────────────────────────────────────────────
// YouTube upload (Step 6)
// ────────────────────────────────────────────────────
async function openYoutubeDialog(jobId) {
  // First check auth status
  let authStatus;
  try {
    authStatus = await fetch('/api/youtube/auth/status').then(r => r.json());
  } catch (e) { authStatus = { connected: false, error: e.message }; }

  if (!authStatus.connected) {
    showYoutubeAuthPrompt();
    return;
  }

  showYoutubeUploadDialog(jobId, authStatus.channel);
}

function showYoutubeAuthPrompt() {
  const m = document.createElement('div');
  m.className = 'yt-modal';
  m.id = 'ytModal';
  m.innerHTML =
    '<div class="yt-card">' +
      '<div class="yt-head">' +
        '<div class="yt-title">YouTube 연결 필요</div>' +
        '<button class="yt-close" data-close>✕</button>' +
      '</div>' +
      '<div class="yt-text">' +
        '아직 YouTube 계정이 연결되어 있지 않아요.<br>' +
        'Google 계정으로 로그인해서 Karleido Studio가 영상을 업로드할 수 있게 권한을 허용해 주세요.' +
        '<br><br>' +
        '<div class="yt-hint">' +
          '1. 아래 "연결하기" 클릭 → Google 로그인 화면<br>' +
          '2. YouTube 채널 권한 승인<br>' +
          '3. 이 창으로 돌아와서 다시 업로드 시도' +
        '</div>' +
        '<div class="yt-hint" style="margin-top:10px;color:var(--accent-warm)">' +
          '⚠ OAuth credentials이 <code>studio/.env</code> 에 설정되어 있어야 합니다.' +
        '</div>' +
      '</div>' +
      '<div class="yt-actions">' +
        '<button class="btn-secondary" data-close>취소</button>' +
        '<a href="/api/youtube/auth/start" target="_blank" class="btn-primary">Google 연결하기</a>' +
      '</div>' +
    '</div>';
  document.body.appendChild(m);
  m.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => m.remove()));
}

function showYoutubeUploadDialog(jobId, channel) {
  const defaultTitle = (S.track && S.track.name) || 'Karleido Render';
  const channelInfo = channel ? ('채널: ' + channel.title) : '';
  const m = document.createElement('div');
  m.className = 'yt-modal';
  m.id = 'ytModal';
  m.innerHTML =
    '<div class="yt-card yt-card-wide">' +
      '<div class="yt-head">' +
        '<div class="yt-title">YouTube 업로드</div>' +
        '<button class="yt-close" data-close>✕</button>' +
      '</div>' +
      (channel ? '<div class="yt-channel">' +
        (channel.thumbnail ? '<img src="' + channel.thumbnail + '" alt="">' : '') +
        '<span>' + escapeHtml(channel.title) + '</span>' +
      '</div>' : '') +
      '<div class="yt-field">' +
        '<label>제목 *</label>' +
        '<input type="text" id="ytTitle" maxlength="100" value="' + escapeHtml(defaultTitle) + '">' +
      '</div>' +
      '<div class="yt-field">' +
        '<label>설명</label>' +
        '<textarea id="ytDesc" rows="4" maxlength="5000" placeholder="트랙 설명, 크레딧, 링크 등…"></textarea>' +
      '</div>' +
      '<div class="yt-field">' +
        '<label>태그 (쉼표로 구분)</label>' +
        '<input type="text" id="ytTags" placeholder="healing, meditation, frequency, 5d healing">' +
      '</div>' +
      '<div class="yt-field-row">' +
        '<div class="yt-field yt-field-half">' +
          '<label>공개 범위</label>' +
          '<select id="ytPrivacy">' +
            '<option value="private" selected>비공개 (Private)</option>' +
            '<option value="unlisted">일부 공개 (Unlisted)</option>' +
            '<option value="public">공개 (Public)</option>' +
          '</select>' +
        '</div>' +
        '<div class="yt-field yt-field-half">' +
          '<label>카테고리</label>' +
          '<select id="ytCategory">' +
            '<option value="10" selected>Music</option>' +
            '<option value="22">People &amp; Blogs</option>' +
            '<option value="26">Howto &amp; Style</option>' +
            '<option value="28">Science &amp; Technology</option>' +
          '</select>' +
        '</div>' +
      '</div>' +
      '<div class="yt-field-row">' +
        '<label class="yt-checkbox">' +
          '<input type="checkbox" id="ytKids">' +
          '<span>어린이용 (Made for kids)</span>' +
        '</label>' +
      '</div>' +
      '<div class="yt-progress hidden" id="ytProgress">' +
        '<div class="yt-progress-label" id="ytProgressLabel">Preparing…</div>' +
        '<div class="yt-progress-bar"><div class="yt-progress-fill" id="ytProgressFill"></div></div>' +
      '</div>' +
      '<div class="yt-result hidden" id="ytResult"></div>' +
      '<div class="yt-actions" id="ytDialogActions">' +
        '<button class="btn-secondary" data-close>취소</button>' +
        '<button class="btn-primary" id="ytSubmit">업로드 시작</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(m);
  m.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => m.remove()));
  document.getElementById('ytSubmit').addEventListener('click', () => submitYoutubeUpload(jobId, m));
}

async function submitYoutubeUpload(jobId, modal) {
  const title   = document.getElementById('ytTitle').value.trim();
  const desc    = document.getElementById('ytDesc').value;
  const tags    = document.getElementById('ytTags').value;
  const privacy = document.getElementById('ytPrivacy').value;
  const category = document.getElementById('ytCategory').value;
  const kids    = document.getElementById('ytKids').checked;
  if (!title) { alert('제목을 입력해주세요.'); return; }

  document.getElementById('ytSubmit').disabled = true;
  document.getElementById('ytProgress').classList.remove('hidden');
  document.getElementById('ytProgressLabel').textContent = '업로드 시작 중…';

  try {
    const res = await fetch('/api/youtube/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jobId, title, description: desc, tags,
        privacyStatus: privacy, categoryId: category, madeForKids: kids,
      }),
    });
    if (!res.ok) throw new Error(await res.text());
    pollYoutubeStatus(jobId, modal);
  } catch (e) {
    document.getElementById('ytProgressLabel').textContent = '⚠ 시작 실패: ' + e.message;
    document.getElementById('ytSubmit').disabled = false;
  }
}

async function pollYoutubeStatus(jobId, modal) {
  let done = false;
  while (!done && modal.isConnected) {
    try {
      const res = await fetch('/api/youtube/upload/' + jobId + '/status');
      const j = await res.json();
      const pct = j.progress || 0;
      const fill = document.getElementById('ytProgressFill');
      const lbl  = document.getElementById('ytProgressLabel');
      if (fill) fill.style.width = pct + '%';
      if (lbl) {
        if (j.status === 'uploading') lbl.textContent = '업로드 중… ' + pct + '% (' + fmtMB(j.bytesRead) + ' / ' + fmtMB(j.fileSize) + ')';
        else if (j.status === 'complete') lbl.textContent = '✓ 업로드 완료';
        else if (j.status === 'error')    lbl.textContent = '⚠ 오류: ' + (j.error || 'unknown');
        else lbl.textContent = j.status;
      }
      if (j.status === 'complete') {
        showYoutubeResult(j.videoId, j.videoUrl);
        done = true; break;
      }
      if (j.status === 'error') { done = true; break; }
    } catch (e) {
      console.warn('yt poll error:', e);
    }
    await new Promise(r => setTimeout(r, 1500));
  }
}

function showYoutubeResult(videoId, videoUrl) {
  const resultEl = document.getElementById('ytResult');
  resultEl.classList.remove('hidden');
  resultEl.innerHTML =
    '<div class="yt-result-title">✓ YouTube 업로드 완료</div>' +
    '<div class="yt-result-link"><a href="' + videoUrl + '" target="_blank" rel="noopener">' + videoUrl + '</a></div>' +
    '<div class="yt-result-hint">YouTube Studio에서 썸네일·세부 정보를 추가로 편집할 수 있어요.</div>';
  const actions = document.getElementById('ytDialogActions');
  if (actions) {
    actions.innerHTML =
      '<a href="' + videoUrl + '" target="_blank" class="btn-primary">YouTube에서 열기</a>' +
      '<button class="btn-secondary" data-close>닫기</button>';
    actions.querySelectorAll('[data-close]').forEach(b =>
      b.addEventListener('click', () => document.getElementById('ytModal')?.remove()));
  }
}

function fmtMB(bytes) {
  return ((bytes || 0) / 1024 / 1024).toFixed(1) + ' MB';
}
