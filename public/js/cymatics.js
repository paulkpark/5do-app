// public/js/cymatics.js
//
// Real N-body particle visualizer (WebGL2). Three GPU programs:
//   • initProg   — fills state texture A with random positions + zero vel
//   • updateProg — reads state A, runs O(N²) force integration, writes B
//   • renderProg — samples state, draws POINTS to canvas with additive blend
// Ping-pong each frame: src ↔ dst.

import {
  QUAD_VERT_GLSL,
  INIT_FRAG_GLSL,
  UPDATE_FRAG_GLSL,
  RENDER_VERT_GLSL,
  RENDER_FRAG_GLSL,
  PARTICLE_COUNT,
  PARTICLE_TEX_SIZE,
  N_TYPES,
  CHAKRA_COLORS,
  defaultForceMatrix
} from './cymatics-shaders.js';
import { buildSource } from './cymatics-loader.js';

const STATE = {
  canvas: null,
  gl: null,
  initProg: null,
  updateProg: null,
  renderProg: null,
  quadVao: null,
  pointsVao: null,
  texA: null,
  texB: null,
  fboA: null,
  fboB: null,
  src: 'A',                     // current source ('A' or 'B')
  initialized: false,
  fftTex: null,
  forceMatrix: null,
  rafId: null,
  audio: null,
  source: null,
  enabled: false,
  fullscreen: false,
  fpsAvg: 60,
  lastFrameTime: 0,
  prefs: { enabled: true, last_used_fullscreen: false }
};

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

function _link(gl, vsSrc, fsSrc) {
  const vs = _compile(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = _compile(gl, gl.FRAGMENT_SHADER, fsSrc);
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

function _makeStateTexture(gl) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(
    gl.TEXTURE_2D, 0, gl.RGBA32F,
    PARTICLE_TEX_SIZE, PARTICLE_TEX_SIZE, 0,
    gl.RGBA, gl.FLOAT, null
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

function _makeFbo(gl, tex) {
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
    throw new Error('FBO incomplete');
  }
  return fbo;
}

function _initWebGL(canvas) {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, premultipliedAlpha: false });
  if (!gl) throw new Error('WebGL2 not available');
  // Required to render to RGBA32F textures
  if (!gl.getExtension('EXT_color_buffer_float')) {
    throw new Error('EXT_color_buffer_float not supported');
  }

  const initProg   = _link(gl, QUAD_VERT_GLSL, INIT_FRAG_GLSL);
  const updateProg = _link(gl, QUAD_VERT_GLSL, UPDATE_FRAG_GLSL);
  const renderProg = _link(gl, RENDER_VERT_GLSL, RENDER_FRAG_GLSL);

  // Quad VAO for init/update fullscreen passes
  const quadVao = gl.createVertexArray();
  gl.bindVertexArray(quadVao);
  const quadBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
  // a_pos location can vary across programs; reuse via index 0 by attaching to both
  for (const prog of [initProg, updateProg]) {
    const loc = gl.getAttribLocation(prog, 'a_pos');
    if (loc >= 0) {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    }
  }

  // Empty VAO for points (gl_VertexID-driven)
  const pointsVao = gl.createVertexArray();

  // Two state textures + FBOs for ping-pong
  const texA = _makeStateTexture(gl);
  const texB = _makeStateTexture(gl);
  const fboA = _makeFbo(gl, texA);
  const fboB = _makeFbo(gl, texB);

  // FFT texture (32×1 RG8)
  const fftTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, fftTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG8, 32, 1, 0, gl.RG, gl.UNSIGNED_BYTE, new Uint8Array(64));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  return {
    gl, initProg, updateProg, renderProg,
    quadVao, pointsVao,
    texA, texB, fboA, fboB,
    fftTex
  };
}

function _runInitPass() {
  const gl = STATE.gl;
  gl.useProgram(STATE.initProg);
  gl.bindVertexArray(STATE.quadVao);
  const seedLoc = gl.getUniformLocation(STATE.initProg, 'u_seed');
  gl.uniform1f(seedLoc, Math.random() * 1000);
  gl.bindFramebuffer(gl.FRAMEBUFFER, STATE.fboA);
  gl.viewport(0, 0, PARTICLE_TEX_SIZE, PARTICLE_TEX_SIZE);
  gl.disable(gl.BLEND);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  STATE.src = 'A';
  STATE.initialized = true;
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

function _uploadFFT(bins) {
  const gl = STATE.gl;
  const buf = new Uint8Array(64);
  for (let i = 0; i < 32; i++) {
    buf[i * 2] = Math.min(255, Math.round(bins[i] * 255));
    buf[i * 2 + 1] = buf[i * 2];
  }
  gl.bindTexture(gl.TEXTURE_2D, STATE.fftTex);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 32, 1, gl.RG, gl.UNSIGNED_BYTE, buf);
}

function _render(now) {
  STATE.rafId = null;
  if (!STATE.enabled || !STATE.gl) return;
  if (document.visibilityState !== 'visible') return _scheduleRender();
  if (STATE.audio && STATE.audio.paused) return _scheduleRender();
  if (STATE.canvas.offsetParent === null && !STATE.fullscreen) return _scheduleRender();

  _resize();
  const gl = STATE.gl;

  if (STATE.lastFrameTime > 0) {
    const dt = now - STATE.lastFrameTime;
    const fps = 1000 / Math.max(1, dt);
    STATE.fpsAvg = STATE.fpsAvg * 0.95 + fps * 0.05;
  }
  STATE.lastFrameTime = now;
  if (STATE.fpsAvg < 45 && now % 33 < 16) return _scheduleRender();

  if (!STATE.initialized) _runInitPass();

  // Sample audio
  let bins = new Float32Array(32);
  if (STATE.source) bins = STATE.source.sample();
  _uploadFFT(bins);

  // ─── Update pass: read src, write dst ──────────────────────────────────
  const srcTex = STATE.src === 'A' ? STATE.texA : STATE.texB;
  const dstFbo = STATE.src === 'A' ? STATE.fboB : STATE.fboA;
  const dstTexLabel = STATE.src === 'A' ? 'B' : 'A';

  gl.useProgram(STATE.updateProg);
  gl.bindVertexArray(STATE.quadVao);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, srcTex);
  gl.uniform1i(gl.getUniformLocation(STATE.updateProg, 'u_state'), 0);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, STATE.fftTex);
  gl.uniform1i(gl.getUniformLocation(STATE.updateProg, 'u_fftTex'), 1);
  gl.uniform1fv(gl.getUniformLocation(STATE.updateProg, 'u_matrix'), STATE.forceMatrix);
  gl.uniform1f(gl.getUniformLocation(STATE.updateProg, 'u_dt'), 0.016);
  gl.bindFramebuffer(gl.FRAMEBUFFER, dstFbo);
  gl.viewport(0, 0, PARTICLE_TEX_SIZE, PARTICLE_TEX_SIZE);
  gl.disable(gl.BLEND);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  STATE.src = dstTexLabel;
  const newSrcTex = STATE.src === 'A' ? STATE.texA : STATE.texB;

  // ─── Render pass: draw POINTS to canvas ────────────────────────────────
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, STATE.canvas.width, STATE.canvas.height);
  gl.clearColor(0.04, 0.04, 0.06, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

  gl.useProgram(STATE.renderProg);
  gl.bindVertexArray(STATE.pointsVao);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, newSrcTex);
  gl.uniform1i(gl.getUniformLocation(STATE.renderProg, 'u_state'), 0);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, STATE.fftTex);
  gl.uniform1i(gl.getUniformLocation(STATE.renderProg, 'u_fftTex'), 1);
  gl.uniform2f(gl.getUniformLocation(STATE.renderProg, 'u_resolution'),
    STATE.canvas.width, STATE.canvas.height);
  gl.uniform3fv(gl.getUniformLocation(STATE.renderProg, 'u_colors'), CHAKRA_COLORS);
  gl.drawArrays(gl.POINTS, 0, PARTICLE_COUNT);

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

export function init(canvas) {
  const ctx = _initWebGL(canvas);
  STATE.canvas = canvas;
  STATE.gl = ctx.gl;
  STATE.initProg = ctx.initProg;
  STATE.updateProg = ctx.updateProg;
  STATE.renderProg = ctx.renderProg;
  STATE.quadVao = ctx.quadVao;
  STATE.pointsVao = ctx.pointsVao;
  STATE.texA = ctx.texA;
  STATE.texB = ctx.texB;
  STATE.fboA = ctx.fboA;
  STATE.fboB = ctx.fboB;
  STATE.fftTex = ctx.fftTex;
  STATE.forceMatrix = defaultForceMatrix();
  STATE.initialized = false;

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    STATE.enabled = false;
    if (STATE.rafId) cancelAnimationFrame(STATE.rafId);
    STATE.rafId = null;
    console.warn('[cymatics] WebGL context lost');
  });
  canvas.addEventListener('webglcontextrestored', () => {
    console.warn('[cymatics] WebGL context restored — recompiling');
    try {
      const ctx2 = _initWebGL(canvas);
      Object.assign(STATE, {
        gl: ctx2.gl,
        initProg: ctx2.initProg,
        updateProg: ctx2.updateProg,
        renderProg: ctx2.renderProg,
        quadVao: ctx2.quadVao,
        pointsVao: ctx2.pointsVao,
        texA: ctx2.texA,
        texB: ctx2.texB,
        fboA: ctx2.fboA,
        fboB: ctx2.fboB,
        fftTex: ctx2.fftTex,
        initialized: false
      });
      if (STATE.prefs.enabled) setEnabled(true);
    } catch (err) {
      console.error('[cymatics] failed to restore', err);
    }
  });

  try {
    const raw = localStorage.getItem('cymatics_prefs');
    if (raw) STATE.prefs = { ...STATE.prefs, ...JSON.parse(raw) };
  } catch {}
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
