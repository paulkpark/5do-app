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
