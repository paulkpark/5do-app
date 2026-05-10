// public/js/cymatics.js
import { VERT_GLSL, FRAG_GLSL } from './cymatics-shaders.js';
import { PATTERNS, lookupPattern } from './cymatics-patterns.js';
import { buildSource } from './cymatics-loader.js';

const STATE = {
  canvas: null,
  gl: null,
  program: null,
  fftTex: null,
  uniforms: {},
  vao: null,
  rafId: null,
  audio: null,
  source: null,
  currentPattern: 'mandala',
  enabled: false,
  fullscreen: false,
  fpsAvg: 60,
  lastFrameTime: 0,
  prefs: { enabled: true, style: 'auto', last_used_fullscreen: false }
};

function _hexToRgb(hex) {
  const v = parseInt(hex.slice(1), 16);
  return [((v >> 16) & 0xff) / 255, ((v >> 8) & 0xff) / 255, (v & 0xff) / 255];
}

function _compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error('Shader compile failed: ' + log);
  }
  return sh;
}

function _link(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(p);
    gl.deleteProgram(p);
    throw new Error('Program link failed: ' + log);
  }
  return p;
}

function _initWebGL(canvas) {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, premultipliedAlpha: false });
  if (!gl) throw new Error('WebGL2 not available');
  const vs = _compile(gl, gl.VERTEX_SHADER, VERT_GLSL);
  const fs = _compile(gl, gl.FRAGMENT_SHADER, FRAG_GLSL);
  const program = _link(gl, vs, fs);
  const quad = new Float32Array([-1, -1,  1, -1, -1, 1,  1, 1]);
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(program, 'a_pos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
  const fftTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, fftTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG8, 32, 1, 0, gl.RG, gl.UNSIGNED_BYTE, new Uint8Array(64));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const uniforms = {
    fftTex: gl.getUniformLocation(program, 'u_fftTex'),
    time: gl.getUniformLocation(program, 'u_time'),
    resolution: gl.getUniformLocation(program, 'u_resolution'),
    mode: gl.getUniformLocation(program, 'u_mode'),
    palA: gl.getUniformLocation(program, 'u_palA'),
    palB: gl.getUniformLocation(program, 'u_palB'),
    palC: gl.getUniformLocation(program, 'u_palC'),
    hueOffset: gl.getUniformLocation(program, 'u_hueOffset')
  };
  return { gl, program, vao, fftTex, uniforms };
}

export function init(canvas) {
  const ctx = _initWebGL(canvas);
  STATE.canvas = canvas;
  STATE.gl = ctx.gl;
  STATE.program = ctx.program;
  STATE.vao = ctx.vao;
  STATE.fftTex = ctx.fftTex;
  STATE.uniforms = ctx.uniforms;
  try {
    const raw = localStorage.getItem('cymatics_prefs');
    if (raw) STATE.prefs = { ...STATE.prefs, ...JSON.parse(raw) };
  } catch {}
}

function _resize() {
  const canvas = STATE.canvas;
  if (!canvas) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2.0);
  const cssW = canvas.clientWidth || canvas.offsetWidth || 256;
  const cssH = canvas.clientHeight || canvas.offsetHeight || 256;
  const w = Math.round(cssW * dpr);
  const h = Math.round(cssH * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
}

function _render(now) {
  STATE.rafId = null;
  if (!STATE.enabled || !STATE.gl) return;
  if (document.visibilityState !== 'visible') return _scheduleRender();
  if (STATE.audio && STATE.audio.paused) return _scheduleRender();
  if (STATE.canvas.offsetParent === null && !STATE.fullscreen) return _scheduleRender();

  _resize();
  const gl = STATE.gl;
  const u = STATE.uniforms;
  const pat = PATTERNS[STATE.currentPattern];

  if (STATE.lastFrameTime > 0) {
    const dt = now - STATE.lastFrameTime;
    const fps = 1000 / Math.max(1, dt);
    STATE.fpsAvg = STATE.fpsAvg * 0.95 + fps * 0.05;
  }
  STATE.lastFrameTime = now;
  if (STATE.fpsAvg < 45 && now % 33 < 16) return _scheduleRender();

  let bins = new Float32Array(32);
  if (STATE.source) bins = STATE.source.sample();
  const buf = new Uint8Array(64);
  for (let i = 0; i < 32; i++) {
    buf[i * 2] = Math.min(255, Math.round(bins[i] * 255));
    buf[i * 2 + 1] = buf[i * 2];
  }
  gl.bindTexture(gl.TEXTURE_2D, STATE.fftTex);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 32, 1, gl.RG, gl.UNSIGNED_BYTE, buf);

  gl.viewport(0, 0, STATE.canvas.width, STATE.canvas.height);
  gl.clearColor(0.04, 0.04, 0.06, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.useProgram(STATE.program);
  gl.bindVertexArray(STATE.vao);
  gl.uniform1i(u.fftTex, 0);
  gl.uniform1f(u.time, now / 1000);
  gl.uniform2f(u.resolution, STATE.canvas.width, STATE.canvas.height);
  gl.uniform1i(u.mode, pat.modeIndex);
  gl.uniform3fv(u.palA, _hexToRgb(pat.palette[0]));
  gl.uniform3fv(u.palB, _hexToRgb(pat.palette[1]));
  gl.uniform3fv(u.palC, _hexToRgb(pat.palette[2 % pat.palette.length]));
  gl.uniform1f(u.hueOffset, (now / 1000) * (2 * Math.PI / 24));
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  _scheduleRender();
}

function _scheduleRender() {
  if (STATE.rafId == null) STATE.rafId = requestAnimationFrame(_render);
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && STATE.enabled) _scheduleRender();
  });
}

export function attach(audioElement) {
  STATE.audio = audioElement;
}

export async function loadTrack(trackInfo) {
  STATE.source = await buildSource({
    audio: STATE.audio,
    audioUrl: trackInfo.audioUrl,
    analyserFactory: trackInfo.analyserFactory
  });
  const name = lookupPattern({
    userOverride: STATE.prefs.style,
    trackPreset: trackInfo.trackPreset,
    categoryPreset: trackInfo.categoryPreset,
    category: trackInfo.category
  });
  STATE.currentPattern = name;
}

function _persistPrefs() {
  try { localStorage.setItem('cymatics_prefs', JSON.stringify(STATE.prefs)); } catch {}
}

export function setEnabled(on) {
  STATE.enabled = !!on;
  STATE.prefs.enabled = !!on;
  _persistPrefs();
  if (STATE.canvas) {
    STATE.canvas.style.display = on ? 'block' : 'none';
    const wrap = STATE.canvas.parentElement;
    if (wrap) wrap.classList.toggle('cymatics-active', on);
  }
  if (on) _scheduleRender();
}

export function setStyle(name) {
  STATE.prefs.style = name;
  _persistPrefs();
  if (STATE.source && name !== 'auto' && PATTERNS[name]) {
    STATE.currentPattern = name;
  }
}

export function getPrefs() {
  return { ...STATE.prefs };
}

export function isReady() {
  return !!STATE.gl;
}

let _fullscreenOverlay = null;
let _previousParent = null;

function _ensureOverlay() {
  if (_fullscreenOverlay) return _fullscreenOverlay;
  const div = document.createElement('div');
  div.className = 'cymatics-fullscreen-overlay';
  div.innerHTML = '<button class="cym-fs-exit" aria-label="Exit fullscreen">✕</button>';
  document.body.appendChild(div);
  div.querySelector('.cym-fs-exit').addEventListener('click', () => exitFullscreen());
  _fullscreenOverlay = div;
  return div;
}

export async function enterFullscreen() {
  if (!STATE.canvas) return;
  const overlay = _ensureOverlay();
  _previousParent = STATE.canvas.parentElement;
  overlay.appendChild(STATE.canvas);
  STATE.canvas.classList.add('cymatics-canvas-fullscreen');
  overlay.style.display = 'block';
  STATE.fullscreen = true;
  STATE.prefs.last_used_fullscreen = true;
  _persistPrefs();
  try {
    if (overlay.requestFullscreen) await overlay.requestFullscreen();
    else if (overlay.webkitRequestFullscreen) overlay.webkitRequestFullscreen();
  } catch {}
  _scheduleRender();
}

export async function exitFullscreen() {
  if (!STATE.fullscreen) return;
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (document.webkitFullscreenElement) document.webkitExitFullscreen();
  } catch {}
  if (_previousParent && STATE.canvas) {
    _previousParent.appendChild(STATE.canvas);
  }
  STATE.canvas.classList.remove('cymatics-canvas-fullscreen');
  if (_fullscreenOverlay) _fullscreenOverlay.style.display = 'none';
  STATE.fullscreen = false;
}

if (typeof document !== 'undefined') {
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && STATE.fullscreen) exitFullscreen();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && STATE.fullscreen) exitFullscreen();
  });
}
