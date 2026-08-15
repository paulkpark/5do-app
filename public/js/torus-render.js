// public/js/torus-render.js
//
// WebGL2 renderer for the Quantum Torus visualizer.
//
// Four layers composited through an HDR buffer:
//   shells    — the solid metallic rings (instanced mesh, analytic GGX)
//   fibers    — Hopf fibers as instanced line segments, positions built in the
//               vertex shader from two floats per vertex
//   particles — points flowing along those same fibers, additively blended
//   post      — bright-pass → separable blur → ACES tone map + vignette
//
// The bloom runs at a fixed buffer height rather than the canvas height, so the
// glow stays the same fraction of the artwork on a phone, a laptop and a 4K
// fullscreen alike. The particle size references that same fixed height for the
// same reason.

import {
  createNodeBuilder, nodeBounds, wrapAlpha, torusParams,
  CLIFFORD_HOLE_RATIO, TAU
} from './torus-hopf.js';
import {
  FIBER_VERT, FIBER_FRAG,
  PARTICLE_VERT, PARTICLE_FRAG,
  SHELL_VERT, SHELL_FRAG,
  QUAD_VERT, BRIGHT_FRAG, BLUR_FRAG, COMPOSITE_FRAG
} from './torus-shaders.js';

const BLOOM_HEIGHT = 512;      // fixed: the whole point of resolution independence
const SHELL_MAX_DEPTH = 1;     // deeper rings are a few pixels across; fibers carry them

// The scene buffer is RGBA16F, so an uncapped 4K fullscreen canvas would ask for
// well over 100 MB and shade four times the fragments for it. Rendering the 3D
// passes at a bounded height and letting the composite upscale costs very little
// on a piece this soft, and keeps the memory flat across displays.
const MAX_SCENE_HEIGHT = 1600;

// ─── 5DO palette ─────────────────────────────────────────────────────────────
// Chirality is the primary read: the two counter-rotating currents take the
// brand's primary and secondary so the opposition is legible at a glance.
const PALETTE = {
  plus: '#9B7FFF',        // --primary-light
  minus: '#4FE3E3',       // --secondary, lifted to match
  sheen: '#FFF4D6',
  shell: '#12102A',
  emissive: '#7C5CFC',    // --primary
  background: '#0A0A0F',  // --bg
  // The environment is deliberately dim: the rings should read as dark metal
  // catching a highlight, not as light sources. All the brightness in the piece
  // belongs to the fibers and the particles.
  envLow: '#05050A',
  envMid: '#221C42',
  envHigh: '#4A3D8C',
  envKey: '#FFE9B8'
};

const QUALITY = {
  desktop: {
    levels: 2, nodeBudget: 1400,
    samples: [96, 34, 14],
    trains: [24, 8, 3], tails: [12, 6, 3]
  },
  mobile: {
    levels: 1, nodeBudget: 220,
    samples: [72, 26, 12],
    trains: [16, 6, 2], tails: [10, 4, 2]
  }
};

// ─── small helpers ───────────────────────────────────────────────────────────

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255
  ];
}

function rgbToHsl([r, g, b]) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h, s, l];
}

function hslToRgb([h, s, l]) {
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
}

/**
 * Per-depth colour ramp: deeper rings drift in hue and lose saturation and
 * lightness. Baking depth cueing into the instance colours costs nothing at
 * render time and reads better than distance fog on additive geometry.
 */
function depthRamp(hex, levels, { hueStep, satFade, lightFade }) {
  const hsl = rgbToHsl(hexToRgb(hex));
  const out = new Float32Array(4 * 3);
  for (let d = 0; d < 4; d++) {
    const k = Math.min(d, levels);
    const c = hslToRgb([
      (hsl[0] + hueStep * k + 1) % 1,
      Math.max(0, Math.min(1, hsl[1] - satFade * k)),
      Math.max(0.07, Math.min(0.96, hsl[2] - lightFade * k))
    ]);
    out[d * 3] = c[0]; out[d * 3 + 1] = c[1]; out[d * 3 + 2] = c[2];
  }
  return out;
}

// ─── mat4 ────────────────────────────────────────────────────────────────────

function perspective(out, fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2);
  out.fill(0);
  out[0] = f / aspect; out[5] = f;
  out[10] = (far + near) / (near - far); out[11] = -1;
  out[14] = (2 * far * near) / (near - far);
  return out;
}

function lookAt(out, eye, center, up) {
  let zx = eye[0] - center[0], zy = eye[1] - center[1], zz = eye[2] - center[2];
  let l = Math.hypot(zx, zy, zz) || 1;
  zx /= l; zy /= l; zz /= l;
  let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
  l = Math.hypot(xx, xy, xz) || 1;
  xx /= l; xy /= l; xz /= l;
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  out[0] = xx; out[1] = yx; out[2] = zx; out[3] = 0;
  out[4] = xy; out[5] = yy; out[6] = zy; out[7] = 0;
  out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0;
  out[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
  out[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
  out[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
  out[15] = 1;
  return out;
}

function multiply(out, a, b) {
  for (let c = 0; c < 4; c++) {
    const b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
    out[c * 4] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
    out[c * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
    out[c * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
    out[c * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
  }
  return out;
}

// ─── GL plumbing ─────────────────────────────────────────────────────────────

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error('torus shader compile failed: ' + log);
  }
  return sh;
}

function link(gl, vsSrc, fsSrc) {
  const vs = compile(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc);
  const p = gl.createProgram();
  gl.attachShader(p, vs); gl.attachShader(p, fs);
  gl.linkProgram(p);
  gl.deleteShader(vs); gl.deleteShader(fs);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(p);
    gl.deleteProgram(p);
    throw new Error('torus program link failed: ' + log);
  }
  return p;
}

/** Cache uniform locations once; getUniformLocation in a draw loop is a stall. */
function uniformMap(gl, prog) {
  const map = Object.create(null);
  const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(prog, i);
    const name = info.name.replace(/\[0\]$/, '');
    map[name] = gl.getUniformLocation(prog, info.name);
  }
  return map;
}

function makeTargetTexture(gl, w, h, internal, format, type) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

// ─── geometry builders ───────────────────────────────────────────────────────

/**
 * Per-vertex data for one node's fiber set: 2m polylines of `samples` segments.
 * Only the curve parameter and the fiber index — the shader does the rest.
 */
function fiberVertexData(m, samples) {
  const fibers = 2 * m;
  const n = fibers * samples * 2;
  const aT = new Float32Array(n);
  const aF = new Float32Array(n);
  let w = 0;
  for (let f = 0; f < fibers; f++) {
    for (let s = 0; s < samples; s++) {
      aT[w] = (TAU * s) / samples; aF[w] = f; w++;
      aT[w] = (TAU * (s + 1)) / samples; aF[w] = f; w++;
    }
  }
  return { aT, aF, count: n };
}

/**
 * Per-vertex data for one node's particles: `trains` evenly spaced groups per
 * fiber, each dragging a `tail` of progressively dimmer, smaller followers.
 */
function particleVertexData(m, trains, tail) {
  const fibers = 2 * m;
  const n = fibers * trains * tail;
  const aF = new Float32Array(n);
  const aPhase = new Float32Array(n);
  const aSpd = new Float32Array(n);
  const aSeed = new Float32Array(n);
  const aSize = new Float32Array(n);
  const aTail = new Float32Array(n);
  let w = 0;
  for (let f = 0; f < fibers; f++) {
    // Each fiber drifts at its own rate so the currents never lock into a
    // single rotating band.
    const speed = -(0.45 + 0.35 * Math.random());
    for (let t = 0; t < trains; t++) {
      const phase = ((t + 0.6 * Math.random()) / trains) * TAU;
      for (let k = 0; k < tail; k++) {
        aF[w] = f;
        aPhase[w] = phase + 0.022 * k;
        aSpd[w] = speed;
        aSeed[w] = Math.random();
        aSize[w] = (1.05 - 0.03 * k) * (0.6 + 0.4 * Math.random());
        aTail[w] = Math.pow(0.93, k);
        w++;
      }
    }
  }
  return { aF, aPhase, aSpd, aSeed, aSize, aTail, count: n };
}

/** Torus mesh with an elliptical cross-section (radial `minor`, axial `axial`). */
function torusMesh(major, minor, axial, majorSeg, minorSeg) {
  const verts = (majorSeg + 1) * (minorSeg + 1);
  const pos = new Float32Array(verts * 3);
  const nrm = new Float32Array(verts * 3);
  const idx = new Uint16Array(majorSeg * minorSeg * 6);
  let w = 0;
  for (let i = 0; i <= majorSeg; i++) {
    const u = (TAU * i) / majorSeg;
    const cu = Math.cos(u), su = Math.sin(u);
    for (let j = 0; j <= minorSeg; j++) {
      const v = (TAU * j) / minorSeg;
      const cv = Math.cos(v), sv = Math.sin(v);
      const ring = major + minor * cv;
      pos[w * 3] = ring * cu;
      pos[w * 3 + 1] = ring * su;
      pos[w * 3 + 2] = axial * sv;
      // n ∝ (a·cos v·cos u, a·cos v·sin u, r·sin v) for the scaled tube
      let nx = axial * cv * cu, ny = axial * cv * su, nz = minor * sv;
      const L = Math.hypot(nx, ny, nz) || 1;
      nrm[w * 3] = nx / L; nrm[w * 3 + 1] = ny / L; nrm[w * 3 + 2] = nz / L;
      w++;
    }
  }
  let k = 0;
  for (let i = 0; i < majorSeg; i++) {
    for (let j = 0; j < minorSeg; j++) {
      const a = i * (minorSeg + 1) + j;
      const b = a + minorSeg + 1;
      idx[k++] = a; idx[k++] = b; idx[k++] = a + 1;
      idx[k++] = b; idx[k++] = b + 1; idx[k++] = a + 1;
    }
  }
  return { pos, nrm, idx, indexCount: idx.length };
}

// ─── renderer ────────────────────────────────────────────────────────────────

export function createTorusRenderer(gl, opts = {}) {
  const isMobile = !!opts.mobile;
  const q = isMobile ? QUALITY.mobile : QUALITY.desktop;

  const params = {
    m: 6,
    levels: q.levels,
    delta: 0.04,
    aFill: 0.84,
    holeRatio: CLIFFORD_HOLE_RATIO,
    nodeBudget: q.nodeBudget,
    profile: 1,
    alphaSpeed: 0.16,
    flowSpeed: 1.0,
    fiberOpacity: 0.9,
    shellOpacity: 1.0,
    metalness: 0.9,
    roughness: 0.28,
    envIntensity: 0.7,
    emissiveStrength: 0.03,
    // Orbiting near the axis of an axially symmetric object shows almost no
    // motion, so the resting tilt sits well off-axis and the piece reads as a
    // solid that turns rather than a flat mandala.
    orbitSpeed: 0.1,
    tilt: 0.45,
    tiltWander: 0.12,
    sheenStrength: 0.42,
    sheenSharpness: 13,
    particleSize: 3.2,
    particleAlpha: 1.15,
    bloomStrength: 0.95,
    bloomThreshold: 0.34,
    bloomKnee: 0.35,
    exposure: 1.05,
    vignette: 0.62,
    cameraDistance: 8.4
  };

  const programs = {
    fiber: link(gl, FIBER_VERT, FIBER_FRAG),
    particle: link(gl, PARTICLE_VERT, PARTICLE_FRAG),
    shell: link(gl, SHELL_VERT, SHELL_FRAG),
    bright: link(gl, QUAD_VERT, BRIGHT_FRAG),
    blur: link(gl, QUAD_VERT, BLUR_FRAG),
    composite: link(gl, QUAD_VERT, COMPOSITE_FRAG)
  };
  const U = {};
  for (const k of Object.keys(programs)) U[k] = uniformMap(gl, programs[k]);

  const builder = createNodeBuilder({
    m: params.m,
    levels: params.levels,
    delta: params.delta,
    aFill: params.aFill,
    nodeBudget: params.nodeBudget
  });

  // ── instance buffers (one big VBO each; levels draw sub-ranges by offset) ──
  const instBuf = {
    posScale: gl.createBuffer(),
    quat: gl.createBuffer(),
    depth: gl.createBuffer(),
    light: gl.createBuffer()
  };
  let instCapacity = 0;

  // ── static per-vertex buffers, one set per level ──
  let levelData = [];      // { fiberVao, fiberCount, partVao, partCount, start, instances }
  let shell = null;        // { vao, indexCount }
  let nodes = null;
  let ranges = [];

  // ── fullscreen quad ──
  const quadVbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadVbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const quadVaos = {};
  for (const k of ['bright', 'blur', 'composite']) {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, quadVbo);
    const loc = gl.getAttribLocation(programs[k], 'a_pos');
    if (loc >= 0) {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    }
    quadVaos[k] = vao;
  }
  gl.bindVertexArray(null);

  // ── render targets ──
  let sceneFbo = null, sceneTex = null, sceneDepth = null, sceneW = 0, sceneH = 0;
  let bloomFbo = [null, null], bloomTex = [null, null], bloomW = 0, bloomH = 0;

  function releaseTargets() {
    if (sceneFbo) gl.deleteFramebuffer(sceneFbo);
    if (sceneTex) gl.deleteTexture(sceneTex);
    if (sceneDepth) gl.deleteRenderbuffer(sceneDepth);
    for (let i = 0; i < 2; i++) {
      if (bloomFbo[i]) gl.deleteFramebuffer(bloomFbo[i]);
      if (bloomTex[i]) gl.deleteTexture(bloomTex[i]);
    }
    sceneFbo = sceneTex = sceneDepth = null;
    bloomFbo = [null, null];
    bloomTex = [null, null];
  }

  function ensureTargets(w, h) {
    if (w === sceneW && h === sceneH && sceneFbo) return;
    releaseTargets();
    sceneW = w; sceneH = h;

    // Half-float keeps the fiber cores above 1.0 so the bright-pass has real
    // headroom to work with instead of clipped white.
    sceneTex = makeTargetTexture(gl, w, h, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT);
    sceneDepth = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, sceneDepth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
    sceneFbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, sceneTex, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, sceneDepth);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error('torus scene FBO incomplete');
    }

    bloomH = BLOOM_HEIGHT;
    bloomW = Math.max(8, Math.round((BLOOM_HEIGHT * w) / Math.max(1, h)));
    for (let i = 0; i < 2; i++) {
      bloomTex[i] = makeTargetTexture(gl, bloomW, bloomH, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT);
      bloomFbo[i] = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, bloomFbo[i]);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, bloomTex[i], 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        throw new Error('torus bloom FBO incomplete');
      }
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  // ── VAO construction ──

  function bindInstanceAttribs(prog, startNode) {
    // Byte offsets let every level share one instance VBO while drawing only
    // its own contiguous slice of the node list.
    const o4 = startNode * 16;
    const o1 = startNode * 4;
    const attach = (buf, name, size, offset) => {
      const loc = gl.getAttribLocation(prog, name);
      if (loc < 0) return;
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, offset);
      gl.vertexAttribDivisor(loc, 1);
    };
    attach(instBuf.posScale, 'iPosScale', 4, o4);
    attach(instBuf.quat, 'iQuat', 4, o4);
    attach(instBuf.depth, 'iDepth', 1, o1);
    attach(instBuf.light, 'iLight', 3, startNode * 12);
  }

  const ownedBuffers = [];

  function staticAttrib(prog, name, data, size) {
    const loc = gl.getAttribLocation(prog, name);
    if (loc < 0) return;
    const buf = gl.createBuffer();
    ownedBuffers.push(buf);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
  }

  /** Drops every VAO and static VBO built by rebuild(); instance VBOs persist. */
  function releaseLevels() {
    for (const l of levelData) {
      gl.deleteVertexArray(l.fiberVao);
      gl.deleteVertexArray(l.partVao);
    }
    levelData = [];
    if (shell) { gl.deleteVertexArray(shell.vao); shell = null; }
    for (const b of ownedBuffers.splice(0)) gl.deleteBuffer(b);
  }

  /** Rebuild static geometry and VAOs. Only needed when the topology changes. */
  function rebuild() {
    releaseLevels();
    nodes = builder.update(0);
    ranges = nodes.ranges;

    // Grow the instance VBOs to the full node count once.
    if (nodes.count > instCapacity) {
      instCapacity = nodes.count;
      gl.bindBuffer(gl.ARRAY_BUFFER, instBuf.posScale);
      gl.bufferData(gl.ARRAY_BUFFER, instCapacity * 16, gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, instBuf.quat);
      gl.bufferData(gl.ARRAY_BUFFER, instCapacity * 16, gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, instBuf.depth);
      gl.bufferData(gl.ARRAY_BUFFER, instCapacity * 4, gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, instBuf.light);
      gl.bufferData(gl.ARRAY_BUFFER, instCapacity * 12, gl.DYNAMIC_DRAW);
    }

    for (let d = 0; d < ranges.length; d++) {
      const [start, end] = ranges[d];
      const instances = end - start;
      if (instances <= 0) continue;

      const samples = q.samples[Math.min(d, q.samples.length - 1)];
      const fv = fiberVertexData(params.m, samples);
      const fiberVao = gl.createVertexArray();
      gl.bindVertexArray(fiberVao);
      staticAttrib(programs.fiber, 'aT', fv.aT, 1);
      staticAttrib(programs.fiber, 'aF', fv.aF, 1);
      bindInstanceAttribs(programs.fiber, start);

      const trains = q.trains[Math.min(d, q.trains.length - 1)];
      const tail = q.tails[Math.min(d, q.tails.length - 1)];
      const pv = particleVertexData(params.m, trains, tail);
      const partVao = gl.createVertexArray();
      gl.bindVertexArray(partVao);
      staticAttrib(programs.particle, 'aF', pv.aF, 1);
      staticAttrib(programs.particle, 'aPhase', pv.aPhase, 1);
      staticAttrib(programs.particle, 'aSpd', pv.aSpd, 1);
      staticAttrib(programs.particle, 'aSeed', pv.aSeed, 1);
      staticAttrib(programs.particle, 'aSize', pv.aSize, 1);
      staticAttrib(programs.particle, 'aTail', pv.aTail, 1);
      bindInstanceAttribs(programs.particle, start);

      levelData.push({
        depth: d, start, instances,
        fiberVao, fiberCount: fv.count,
        partVao, partCount: pv.count
      });
    }

    const tp = torusParams(params.holeRatio);
    const mesh = torusMesh(tp.major, tp.minor, tp.axial, isMobile ? 40 : 56, isMobile ? 12 : 16);
    const shellVao = gl.createVertexArray();
    gl.bindVertexArray(shellVao);
    staticAttrib(programs.shell, 'aPos', mesh.pos, 3);
    staticAttrib(programs.shell, 'aNormal', mesh.nrm, 3);
    bindInstanceAttribs(programs.shell, 0);
    const ibo = gl.createBuffer();
    ownedBuffers.push(ibo);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.idx, gl.STATIC_DRAW);
    gl.bindVertexArray(null);

    // Rings are drawn only for the shallow depths, and those nodes occupy the
    // head of the list, so one instance count covers all of them.
    shell = {
      vao: shellVao,
      indexCount: mesh.indexCount,
      instances: ranges[Math.min(SHELL_MAX_DEPTH, ranges.length - 1)][1]
    };
  }

  rebuild();

  // ── colour ramps ──
  let plusRamp = depthRamp(PALETTE.plus, params.levels, { hueStep: -0.0025, satFade: 0.015, lightFade: 0.16 });
  let minusRamp = depthRamp(PALETTE.minus, params.levels, { hueStep: 0.0025, satFade: 0.015, lightFade: 0.16 });
  let shellRamp = depthRamp(PALETTE.shell, params.levels, { hueStep: -0.0015, satFade: 0.01, lightFade: 0.12 });
  const sheenRgb = hexToRgb(PALETTE.sheen);
  const emissiveRgb = hexToRgb(PALETTE.emissive);
  const bgRgb = hexToRgb(PALETTE.background);
  const envLow = hexToRgb(PALETTE.envLow);
  const envMid = hexToRgb(PALETTE.envMid);
  const envHigh = hexToRgb(PALETTE.envHigh);
  const envKey = hexToRgb(PALETTE.envKey);

  // ── animation + audio state ──
  const view = new Float32Array(16);
  const proj = new Float32Array(16);
  const viewProj = new Float32Array(16);
  const eye = [0, 0, params.cameraDistance];
  const lightWorld = [0.52, 0.66, 0.54];

  let alpha = 0;
  let elapsed = 0;
  let autoOrbit = 0;
  let flowPhase = 0;

  // Manual view offsets, layered on top of the automatic drift so a drag never
  // fights the animation — releasing simply resumes from wherever you left it.
  let userAzimuth = 0;
  let userElevation = 0;
  let spinAz = 0;          // residual velocity after a flick
  let spinEl = 0;
  const audio = { bass: 0, lowMid: 0, highMid: 0, treble: 0, level: 0 };

  /**
   * Band energies with asymmetric smoothing: fast attack so transients land on
   * the beat, slow release so the structure glides instead of flickering.
   */
  function updateAudio(bins, dt) {
    const band = (lo, hi) => {
      let s = 0;
      for (let i = lo; i < hi; i++) s += bins[i] || 0;
      return s / Math.max(1, hi - lo);
    };
    const target = {
      bass: band(0, 4),
      lowMid: band(4, 10),
      highMid: band(10, 20),
      treble: band(20, 32),
      level: band(0, 32)
    };
    for (const k of Object.keys(audio)) {
      const t = target[k];
      const rate = t > audio[k] ? 22 : 4.5;
      audio[k] += (t - audio[k]) * Math.min(1, rate * dt);
    }
  }

  function drawScene(w, h) {
    const tp = torusParams(params.holeRatio);

    // Camera: face-on down the torus axis — the mandala read — with a slow
    // orbital drift and a gentle tilt so it never looks like a flat diagram.
    // Elevation is measured from the +Z axis. It is clamped away from the poles
    // because the view-up vector is +Z: exactly on the axis the two are
    // parallel and the look-at basis collapses.
    const elevation = Math.min(Math.PI - 0.06, Math.max(0.06,
      params.tilt + userElevation + params.tiltWander * Math.sin(elapsed * 0.11)));
    const azimuth = autoOrbit + userAzimuth;

    // The projection is driven by a vertical FOV, so a portrait viewport has a
    // narrower horizontal one and crops the sides off a wide, round subject.
    // Pulling the camera back by the aspect deficit fits the piece either way.
    const aspect = w / Math.max(1, h);
    // Exponent < 1 is a deliberate partial fit: a full correction would leave a
    // phone screen mostly empty, so the silhouette's outermost bumps are allowed
    // to graze the edge in exchange for the piece actually filling the frame.
    const fit = Math.pow(1 / Math.min(1, aspect), 0.75);
    const dist = params.cameraDistance * fit * (1 - 0.05 * audio.bass);
    eye[0] = Math.sin(azimuth) * Math.sin(elevation) * dist;
    eye[1] = Math.cos(azimuth) * Math.sin(elevation) * dist;
    eye[2] = Math.cos(elevation) * dist;

    const bounds = nodeBounds(nodes, params.profile);
    // Hug the content: with this many overlapping translucent fragments, a
    // loose depth range is the difference between clean crossings and z-fight.
    const near = Math.max(dist * 0.02, dist - bounds.bounding * 1.15);
    const far = dist + bounds.bounding * 2.5;
    perspective(proj, (48 * Math.PI) / 180, aspect, near, far);
    lookAt(view, eye, [0, 0, 0], [0, 0, 1]);
    multiply(viewProj, proj, view);

    gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFbo);
    gl.viewport(0, 0, w, h);
    gl.clearColor(bgRgb[0], bgRgb[1], bgRgb[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);

    // ── shells: opaque and depth-written so they hide the far half of the
    //    structure, which is what makes the piece read as a solid object rather
    //    than a wireframe. The fibers lie exactly on this surface, so the rings
    //    are pushed back a touch in depth to let the fibers win the coplanar
    //    comparison instead of z-fighting with it.
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(2, 2);
    gl.useProgram(programs.shell);
    let u = U.shell;
    gl.uniformMatrix4fv(u.u_viewProj, false, viewProj);
    gl.uniform1f(u.u_profile, params.profile);
    gl.uniform3fv(u.u_torusByDepth, shellRamp);
    gl.uniform3f(u.u_camPos, eye[0], eye[1], eye[2]);
    gl.uniform3fv(u.u_lightDir, lightWorld);
    gl.uniform3fv(u.u_envLow, envLow);
    gl.uniform3fv(u.u_envMid, envMid);
    gl.uniform3fv(u.u_envHigh, envHigh);
    gl.uniform3fv(u.u_envKey, envKey);
    gl.uniform3fv(u.u_emissiveColor, emissiveRgb);
    gl.uniform1f(u.u_metalness, params.metalness);
    gl.uniform1f(u.u_roughness, params.roughness);
    gl.uniform1f(u.u_envIntensity, params.envIntensity);
    gl.uniform1f(u.u_emissiveStrength, params.emissiveStrength);
    gl.uniform1f(u.u_opacity, params.shellOpacity);
    gl.uniform1f(u.u_audioEmissive, audio.bass * 0.1);
    gl.bindVertexArray(shell.vao);
    gl.drawElementsInstanced(gl.TRIANGLES, shell.indexCount, gl.UNSIGNED_SHORT, 0, shell.instances);

    // ── fibers: ordinary alpha blending with depth writes. Additive was the
    //    obvious choice and the wrong one — a thousand overlapping nodes
    //    saturate to flat white almost immediately, erasing the structure the
    //    whole piece is about. Occluding strands keeps the depth legible.
    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(programs.fiber);
    u = U.fiber;
    gl.uniformMatrix4fv(u.u_viewProj, false, viewProj);
    gl.uniform1f(u.u_m, params.m);
    gl.uniform1f(u.u_delta, params.delta);
    gl.uniform1f(u.u_alpha, alpha);
    gl.uniform1f(u.u_C, tp.K);
    gl.uniform1f(u.u_geom, tp.C);
    gl.uniform1f(u.u_profile, params.profile);
    gl.uniform1f(u.u_sheenStrength, params.sheenStrength);
    gl.uniform1f(u.u_sheenSharpness, params.sheenSharpness);
    gl.uniform3fv(u.u_sheenColor, sheenRgb);
    gl.uniform3fv(u.u_plusByDepth, plusRamp);
    gl.uniform3fv(u.u_minusByDepth, minusRamp);
    gl.uniform1f(u.u_opacity, params.fiberOpacity);
    gl.uniform1f(u.u_audioSheen, audio.treble * 0.8);
    gl.uniform1f(u.u_audioGlow, audio.level * 0.5);
    for (const l of levelData) {
      gl.bindVertexArray(l.fiberVao);
      gl.drawArraysInstanced(gl.LINES, 0, l.fiberCount, l.instances);
    }

    // ── particles: additive points riding the same fibers. Additive is right
    //    here — they are sparse, and stacking them is how a train reads as a
    //    bright head with a falling-off tail.
    gl.depthMask(false);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.useProgram(programs.particle);
    u = U.particle;
    gl.uniformMatrix4fv(u.u_view, false, view);
    gl.uniformMatrix4fv(u.u_proj, false, proj);
    gl.uniform1f(u.u_m, params.m);
    gl.uniform1f(u.u_delta, params.delta);
    gl.uniform1f(u.u_alpha, alpha);
    gl.uniform1f(u.u_C, tp.K);
    gl.uniform1f(u.u_geom, tp.C);
    gl.uniform1f(u.u_profile, params.profile);
    gl.uniform1f(u.u_time, elapsed);
    gl.uniform1f(u.u_flowPhase, flowPhase);
    gl.uniform1f(u.u_size, params.particleSize);
    gl.uniform1f(u.u_alphaMul, params.particleAlpha);
    gl.uniform1f(u.u_resScale, h / BLOOM_HEIGHT);
    gl.uniform1f(u.u_focal, h * 0.5 / Math.tan((48 * Math.PI) / 360));
    gl.uniform1f(u.u_gateLo, 1.2);
    gl.uniform1f(u.u_gateHi, 5.0);
    gl.uniform1f(u.u_sizeGamma, 0.45);
    gl.uniform3fv(u.u_plusByDepth, plusRamp);
    gl.uniform3fv(u.u_minusByDepth, minusRamp);
    gl.uniform1f(u.u_audioBright, audio.treble * 0.9);
    for (const l of levelData) {
      gl.bindVertexArray(l.partVao);
      gl.drawArraysInstanced(gl.POINTS, 0, l.partCount, l.instances);
    }

    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(true);
  }

  function drawPost(w, h) {
    gl.disable(gl.BLEND);

    // bright pass → bloom[0]
    gl.bindFramebuffer(gl.FRAMEBUFFER, bloomFbo[0]);
    gl.viewport(0, 0, bloomW, bloomH);
    gl.useProgram(programs.bright);
    gl.bindVertexArray(quadVaos.bright);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sceneTex);
    gl.uniform1i(U.bright.u_tex, 0);
    gl.uniform1f(U.bright.u_threshold, params.bloomThreshold);
    gl.uniform1f(U.bright.u_knee, params.bloomKnee);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // two separable passes at widening radii approximate a much larger kernel
    gl.useProgram(programs.blur);
    gl.bindVertexArray(quadVaos.blur);
    gl.uniform1i(U.blur.u_tex, 0);
    for (let pass = 0; pass < 2; pass++) {
      const spread = 1 + pass * 2;
      // horizontal: bloom[0] → bloom[1]
      gl.bindFramebuffer(gl.FRAMEBUFFER, bloomFbo[1]);
      gl.viewport(0, 0, bloomW, bloomH);
      gl.bindTexture(gl.TEXTURE_2D, bloomTex[0]);
      gl.uniform2f(U.blur.u_direction, spread / bloomW, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      // vertical: bloom[1] → bloom[0]
      gl.bindFramebuffer(gl.FRAMEBUFFER, bloomFbo[0]);
      gl.bindTexture(gl.TEXTURE_2D, bloomTex[1]);
      gl.uniform2f(U.blur.u_direction, 0, spread / bloomH);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    // composite → canvas
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.useProgram(programs.composite);
    gl.bindVertexArray(quadVaos.composite);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sceneTex);
    gl.uniform1i(U.composite.u_scene, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, bloomTex[0]);
    gl.uniform1i(U.composite.u_bloom, 1);
    gl.uniform1f(U.composite.u_bloomStrength, params.bloomStrength * (1 + audio.level * 0.7));
    gl.uniform1f(U.composite.u_exposure, params.exposure);
    gl.uniform1f(U.composite.u_vignette, params.vignette);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindVertexArray(null);
  }

  return {
    get params() { return params; },

    /** Turn the view by the given angles in radians (drag handlers call this). */
    orbitBy(dAzimuth, dElevation) {
      userAzimuth += dAzimuth;
      userElevation += dElevation;
      spinAz = 0;
      spinEl = 0;
    },

    /** Hand off a release velocity in radians/second so a flick keeps going. */
    flick(vAzimuth, vElevation) {
      spinAz = vAzimuth;
      spinEl = vElevation;
    },

    /** Return to the framing the piece opens on. */
    resetView() {
      userAzimuth = 0;
      userElevation = 0;
      spinAz = 0;
      spinEl = 0;
    },

    /** Apply a parameter patch; topology changes trigger a geometry rebuild. */
    configure(patch) {
      const topo = ['m', 'levels', 'nodeBudget', 'delta', 'aFill', 'holeRatio'];
      const needsRebuild = topo.some((k) => k in patch && patch[k] !== params[k]);
      Object.assign(params, patch);
      if (needsRebuild) {
        builder.configure({
          m: params.m, levels: params.levels, delta: params.delta,
          aFill: params.aFill, nodeBudget: params.nodeBudget
        });
        rebuild();
        plusRamp = depthRamp(PALETTE.plus, params.levels, { hueStep: -0.0025, satFade: 0.015, lightFade: 0.16 });
        minusRamp = depthRamp(PALETTE.minus, params.levels, { hueStep: 0.0025, satFade: 0.015, lightFade: 0.16 });
        shellRamp = depthRamp(PALETTE.shell, params.levels, { hueStep: -0.0015, satFade: 0.01, lightFade: 0.12 });
      }
    },

    /**
     * One frame.
     * @param {Float32Array} bins 32 normalized frequency magnitudes
     * @param {number} dt seconds since the previous frame
     */
    render(bins, dt, w, h) {
      // 3D passes render at a bounded size; only the final composite runs at the
      // canvas's true resolution.
      const scale = Math.min(1, MAX_SCENE_HEIGHT / Math.max(1, h));
      const sw = Math.max(8, Math.round(w * scale));
      const sh = Math.max(8, Math.round(h * scale));
      ensureTargets(sw, sh);

      const step = Math.min(0.05, Math.max(0, dt));
      elapsed += step;
      updateAudio(bins, step);

      // Low-mid energy drives the Hopf rotation; wrapping at 2π/m keeps the
      // loop seamless no matter how the speed varied along the way.
      // Audio scales the magnitude rather than adding to it, so a negative
      // speed stays negative however loud the track gets. Adding a positive
      // term would flip a reversed flow back the other way on every peak.
      const speed = params.alphaSpeed * (1 + audio.lowMid * 2.4);
      alpha = wrapAlpha(alpha + step * speed, params.m);
      flowPhase += step * params.flowSpeed * (1 + audio.highMid * 1.6);
      autoOrbit += step * params.orbitSpeed;

      // Flick momentum, decaying to rest over roughly a second.
      if (spinAz || spinEl) {
        userAzimuth += spinAz * step;
        userElevation += spinEl * step;
        const decay = Math.exp(-step * 4.5);
        spinAz *= decay;
        spinEl *= decay;
        if (Math.abs(spinAz) < 1e-4) spinAz = 0;
        if (Math.abs(spinEl) < 1e-4) spinEl = 0;
      }

      nodes = builder.update(alpha);

      gl.bindBuffer(gl.ARRAY_BUFFER, instBuf.posScale);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, nodes.posScale, 0, nodes.count * 4);
      gl.bindBuffer(gl.ARRAY_BUFFER, instBuf.quat);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, nodes.quat, 0, nodes.count * 4);
      gl.bindBuffer(gl.ARRAY_BUFFER, instBuf.depth);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, nodes.depth, 0, nodes.count);
      gl.bindBuffer(gl.ARRAY_BUFFER, instBuf.light);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, nodes.light, 0, nodes.count * 3);

      drawScene(sw, sh);
      drawPost(w, h);
    },

    dispose() {
      releaseLevels();
      releaseTargets();
      for (const k of Object.keys(quadVaos)) gl.deleteVertexArray(quadVaos[k]);
      for (const k of Object.keys(programs)) gl.deleteProgram(programs[k]);
      for (const k of Object.keys(instBuf)) gl.deleteBuffer(instBuf[k]);
      gl.deleteBuffer(quadVbo);
    }
  };
}
