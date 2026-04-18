/* =============================================================================
   Particle Life — WebGPU particle simulation (5DO Visual Therapy)
   Phase 1 MVP: Core simulation with 7 chakra-colored particle types.
   Exposed as: window.ParticleLife = { isSupported, createEngine }
   ============================================================================= */

(function () {
  'use strict';

  // ─── Feature detection ────────────────────────────────────────────────────
  async function isSupported() {
    if (typeof navigator === 'undefined' || !navigator.gpu) return false;
    try {
      const adapter = await navigator.gpu.requestAdapter();
      return !!adapter;
    } catch { return false; }
  }

  // ─── 7 chakra colors (root → crown) ───────────────────────────────────────
  const CHAKRA_COLORS = [
    [1.00, 0.15, 0.25],  // root - red
    [1.00, 0.50, 0.10],  // sacral - orange
    [1.00, 0.85, 0.20],  // solar - yellow
    [0.25, 0.95, 0.35],  // heart - green
    [0.20, 0.65, 1.00],  // throat - blue
    [0.40, 0.25, 0.90],  // third eye - indigo
    [0.75, 0.35, 1.00],  // crown - violet
  ];

  const N_TYPES = 7;

  // Default interaction matrix: harmonious cyclic pattern
  // matrix[i * N + j] = force type i exerts on type j
  // Positive = attract, negative = repel
  function defaultMatrix() {
    const m = new Float32Array(N_TYPES * N_TYPES);
    for (let i = 0; i < N_TYPES; i++) {
      for (let j = 0; j < N_TYPES; j++) {
        if (i === j) m[i * N_TYPES + j] = 0.15;      // mild self-attraction (clustering)
        else if (j === (i + 1) % N_TYPES) m[i * N_TYPES + j] = 0.5;   // attract next chakra
        else if (j === (i + N_TYPES - 1) % N_TYPES) m[i * N_TYPES + j] = -0.3; // repel previous
        else if (j === (i + 3) % N_TYPES) m[i * N_TYPES + j] = 0.25;  // mild attract opposite
        else m[i * N_TYPES + j] = -0.1 + 0.2 * ((i * 7 + j * 3) % 5) / 5;   // deterministic noise
      }
    }
    return m;
  }

  // ─── WGSL Shaders ─────────────────────────────────────────────────────────
  const COMPUTE_WGSL = /* wgsl */`
struct Particle {
  pos:  vec2<f32>,
  vel:  vec2<f32>,
  kind: u32,
  _pad: u32,
};

struct Params {
  dt:          f32,
  r_max:       f32,      // max interaction radius (normalized 0..1) for particle life
  friction:    f32,
  forceScale:  f32,
  audioBass:   f32,
  audioHigh:   f32,
  n:           u32,
  nTypes:      u32,
  mode:        u32,      // 0=particle_life, 1=nebula, 2=cluster, 3=spiral, 4=binary
  centerX:     f32,      // Primary gravity center
  centerY:     f32,
  gravity:     f32,      // Central attractor strength
  center2X:    f32,      // Secondary center (binary)
  center2Y:    f32,
  swirl:       f32,      // Tangential velocity inducer (spiral)
  time:        f32,      // Global time for turbulence
};

@group(0) @binding(0) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(1) var<storage, read>       matrix:    array<f32>;
@group(0) @binding(2) var<uniform>             params:    Params;

// force profile: repulse close (<0.3), attract farther (0.3..1.0)
fn force_pl(r: f32, a: f32) -> f32 {
  let beta: f32 = 0.3;
  if (r < beta) {
    return r / beta - 1.0;
  } else if (r < 1.0) {
    return a * (1.0 - abs(2.0 * r - 1.0 - beta) / (1.0 - beta));
  }
  return 0.0;
}

// 2D hash for turbulence noise
fn hash2(p: vec2<f32>) -> vec2<f32> {
  let q = vec2<f32>(dot(p, vec2<f32>(127.1, 311.7)), dot(p, vec2<f32>(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(q) * 43758.5453);
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i: u32 = gid.x;
  if (i >= params.n) { return; }

  var p = particles[i];
  var totalForce = vec2<f32>(0.0, 0.0);

  if (params.mode == 0u) {
    // ── Particle Life (original) ──
    for (var j: u32 = 0u; j < params.n; j = j + 1u) {
      if (j == i) { continue; }
      let other = particles[j];
      var d = other.pos - p.pos;
      if (d.x > 0.5) { d.x = d.x - 1.0; } else if (d.x < -0.5) { d.x = d.x + 1.0; }
      if (d.y > 0.5) { d.y = d.y - 1.0; } else if (d.y < -0.5) { d.y = d.y + 1.0; }
      let r = length(d);
      if (r > 0.0 && r < params.r_max) {
        let a = matrix[p.kind * params.nTypes + other.kind];
        let f = force_pl(r / params.r_max, a);
        totalForce = totalForce + (d / r) * f;
      }
    }
  } else {
    // ── Cosmic modes: central gravity + swirl + optional turbulence ──
    let center = vec2<f32>(params.centerX, params.centerY);
    var dc = center - p.pos;
    let rc = length(dc) + 0.01;
    let dir = dc / rc;
    // Softened 1/r² gravity toward center
    let G = params.gravity / (rc * rc + 0.002);
    totalForce = totalForce + dir * G;
    // Perpendicular swirl (for spiral galaxies)
    let perp = vec2<f32>(-dir.y, dir.x);
    totalForce = totalForce + perp * params.swirl * (1.0 / (rc + 0.05));

    // Binary mode: second attractor
    if (params.mode == 4u) {
      let center2 = vec2<f32>(params.center2X, params.center2Y);
      let dc2 = center2 - p.pos;
      let rc2 = length(dc2) + 0.01;
      let G2 = params.gravity / (rc2 * rc2 + 0.002);
      totalForce = totalForce + (dc2 / rc2) * G2;
    }

    // Nebula mode: turbulence noise
    if (params.mode == 1u) {
      let t = params.time * 0.15;
      let noise = hash2(p.pos * 8.0 + vec2<f32>(t, t * 0.7));
      totalForce = totalForce + noise * 0.3;
    }
  }

  // Audio reactivity
  let forceMul = params.forceScale * (1.0 + params.audioBass * 1.2);
  p.vel = p.vel + totalForce * params.r_max * forceMul * params.dt;
  p.vel = p.vel * (1.0 - params.friction * params.dt) * (1.0 + params.audioHigh * 0.3);
  p.pos = p.pos + p.vel * params.dt;

  if (params.mode == 0u) {
    // Toroidal wrap for particle life
    p.pos = fract(p.pos + vec2<f32>(1.0, 1.0));
  } else {
    // Soft boundary for cosmic (no wrap): out-of-bounds = slow pull back
    if (p.pos.x < -0.2 || p.pos.x > 1.2 || p.pos.y < -0.2 || p.pos.y > 1.2) {
      let dir = vec2<f32>(params.centerX, params.centerY) - p.pos;
      p.vel = p.vel + normalize(dir) * 0.002;
    }
  }

  particles[i] = p;
}
`;

  const RENDER_WGSL = /* wgsl */`
struct Particle {
  pos:  vec2<f32>,
  vel:  vec2<f32>,
  kind: u32,
  _pad: u32,
};

struct RenderParams {
  aspect:   f32,
  pointSize: f32,
  brightness: f32,
  _pad: f32,
};

@group(0) @binding(0) var<storage, read> particles: array<Particle>;
@group(0) @binding(1) var<storage, read> palette:   array<vec4<f32>>;
@group(0) @binding(2) var<uniform>       rp:        RenderParams;

struct VsOut {
  @builtin(position) pos: vec4<f32>,
  @location(0)       uv:  vec2<f32>,
  @location(1)       color: vec3<f32>,
};

// 6 verts per particle (two triangles forming a quad)
@vertex
fn vs_main(@builtin(vertex_index) vid: u32, @builtin(instance_index) iid: u32) -> VsOut {
  let p = particles[iid];
  let col = palette[p.kind].xyz;
  // Speed-based size variation (fast particles = bigger halo, like stellar jets)
  let speed = length(p.vel);
  let sizeMul = 1.0 + min(speed * 8.0, 1.5);

  let offsets = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0), vec2<f32>( 1.0, -1.0), vec2<f32>(-1.0,  1.0),
    vec2<f32>( 1.0, -1.0), vec2<f32>( 1.0,  1.0), vec2<f32>(-1.0,  1.0),
  );
  let off = offsets[vid];
  let clipPos = vec2<f32>(p.pos.x * 2.0 - 1.0, 1.0 - p.pos.y * 2.0);
  let sizeX = rp.pointSize * sizeMul;
  let sizeY = rp.pointSize * rp.aspect * sizeMul;
  let corner = clipPos + vec2<f32>(off.x * sizeX, off.y * sizeY);

  var out: VsOut;
  out.pos = vec4<f32>(corner, 0.0, 1.0);
  out.uv = off;
  out.color = col * (1.0 + speed * 2.0); // brighter when moving fast
  return out;
}

@fragment
fn fs_main(in: VsOut) -> @location(0) vec4<f32> {
  let d = length(in.uv);
  if (d > 1.0) { discard; }
  // Bright core + wide soft halo (pseudo-bloom without post-process)
  let alpha = pow(1.0 - d, 1.6);
  let core = exp(-d * 3.0);
  let halo = exp(-d * 1.2) * 0.35;
  let glow = (core + halo) * rp.brightness;
  let rgb = in.color * glow;
  return vec4<f32>(rgb, alpha);
}
`;

  // ─── Initial state generators per mode ────────────────────────────────────
  // Each particle occupies 6 × 4 bytes: [posX, posY, velX, velY, kind, pad]
  function initParticles(N, nTypes, modeIdx, opts = {}) {
    const buf = new ArrayBuffer(N * 6 * 4);
    const fv = new Float32Array(buf);
    const uv = new Uint32Array(buf);
    const cx = (opts.center && opts.center[0]) || 0.5;
    const cy = (opts.center && opts.center[1]) || 0.5;

    if (modeIdx === 0) {
      // Particle Life — random uniform
      for (let i = 0; i < N; i++) {
        const o = i * 6;
        fv[o] = Math.random(); fv[o+1] = Math.random();
        fv[o+2] = (Math.random() - 0.5) * 0.01;
        fv[o+3] = (Math.random() - 0.5) * 0.01;
        uv[o+4] = i % nTypes; uv[o+5] = 0;
      }
    } else if (modeIdx === 1) {
      // Nebula — gas clouds with density pockets
      const hotspots = [[cx, cy], [cx + 0.15, cy - 0.1], [cx - 0.12, cy + 0.08]];
      for (let i = 0; i < N; i++) {
        const o = i * 6;
        const hs = hotspots[Math.floor(Math.random() * hotspots.length)];
        const angle = Math.random() * Math.PI * 2;
        const r = Math.pow(Math.random(), 0.6) * 0.3;
        fv[o]   = hs[0] + Math.cos(angle) * r;
        fv[o+1] = hs[1] + Math.sin(angle) * r;
        fv[o+2] = (Math.random() - 0.5) * 0.005;
        fv[o+3] = (Math.random() - 0.5) * 0.005;
        // Color by density: inner = hot (red/white), outer = cool (blue/purple)
        const tier = Math.min(nTypes - 1, Math.floor((1 - r / 0.3) * nTypes));
        uv[o+4] = tier; uv[o+5] = 0;
      }
    } else if (modeIdx === 2) {
      // Star Cluster (Pleiades-style) — 7 bright stars + diffuse halo
      const nBright = 7;
      const brightPositions = [];
      for (let k = 0; k < nBright; k++) {
        const a = (k / nBright) * Math.PI * 2 + Math.random() * 0.4;
        const r = 0.08 + Math.random() * 0.08;
        brightPositions.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
      }
      // 12% bright core particles clustered around 7 stars
      const nCore = Math.floor(N * 0.12);
      for (let i = 0; i < nCore; i++) {
        const o = i * 6;
        const bp = brightPositions[i % nBright];
        fv[o]   = bp[0] + (Math.random() - 0.5) * 0.02;
        fv[o+1] = bp[1] + (Math.random() - 0.5) * 0.02;
        fv[o+2] = (Math.random() - 0.5) * 0.008;
        fv[o+3] = (Math.random() - 0.5) * 0.008;
        uv[o+4] = (i % nBright) % nTypes; uv[o+5] = 0;
      }
      // 88% diffuse reflection nebula around the cluster
      for (let i = nCore; i < N; i++) {
        const o = i * 6;
        const a = Math.random() * Math.PI * 2;
        const r = 0.04 + Math.pow(Math.random(), 0.5) * 0.25;
        fv[o]   = cx + Math.cos(a) * r;
        fv[o+1] = cy + Math.sin(a) * r;
        fv[o+2] = (Math.random() - 0.5) * 0.004;
        fv[o+3] = (Math.random() - 0.5) * 0.004;
        uv[o+4] = 4 + (i % 3); // outer tiers (blue/indigo/violet-ish)
        if (uv[o+4] >= nTypes) uv[o+4] = nTypes - 1;
        uv[o+5] = 0;
      }
    } else if (modeIdx === 3) {
      // Spiral Galaxy — bulge (12%) + disk (80%) + halo (8%), with rotational velocity
      const nBulge = Math.floor(N * 0.12);
      const nHalo  = Math.floor(N * 0.08);
      const nDisk  = N - nBulge - nHalo;
      // Bulge: spherical dense center
      for (let i = 0; i < nBulge; i++) {
        const o = i * 6;
        const a = Math.random() * Math.PI * 2;
        const r = Math.pow(Math.random(), 2) * 0.05;
        fv[o]   = cx + Math.cos(a) * r;
        fv[o+1] = cy + Math.sin(a) * r;
        // Small rotational velocity (clockwise when viewed)
        const v = 0.03 * Math.sqrt(r / 0.05);
        fv[o+2] = -Math.sin(a) * v; fv[o+3] = Math.cos(a) * v;
        uv[o+4] = 0 + (i % 3); // inner = warm (red/orange/yellow)
        uv[o+5] = 0;
      }
      // Disk: elliptical with spiral arm density
      for (let i = 0; i < nDisk; i++) {
        const o = (nBulge + i) * 6;
        const r = 0.05 + Math.sqrt(Math.random()) * 0.35;
        // 2 spiral arms: log spiral
        const armBias = Math.random() < 0.6 ? 0 : Math.PI;
        const a = armBias + 3 * Math.log(r / 0.05) + (Math.random() - 0.5) * 0.6;
        fv[o]   = cx + Math.cos(a) * r;
        fv[o+1] = cy + Math.sin(a) * r;
        // Keplerian-ish rotation (normalized)
        const v = 0.06 / Math.sqrt(r + 0.1);
        fv[o+2] = -Math.sin(a) * v; fv[o+3] = Math.cos(a) * v;
        uv[o+4] = 3 + (i % 4); // disk = cool/blue-violet
        if (uv[o+4] >= nTypes) uv[o+4] = nTypes - 1;
        uv[o+5] = 0;
      }
      // Halo: sparse outer particles (old stellar population)
      for (let i = 0; i < nHalo; i++) {
        const o = (nBulge + nDisk + i) * 6;
        const a = Math.random() * Math.PI * 2;
        const r = 0.35 + Math.random() * 0.25;
        fv[o]   = cx + Math.cos(a) * r;
        fv[o+1] = cy + Math.sin(a) * r;
        const v = 0.015;
        fv[o+2] = -Math.sin(a) * v; fv[o+3] = Math.cos(a) * v;
        uv[o+4] = (i % 2) + 5; uv[o+5] = 0;
        if (uv[o+4] >= nTypes) uv[o+4] = nTypes - 1;
      }
    } else if (modeIdx === 4) {
      // Binary System — two attractors with Roche lobes
      const c1 = [cx + 0.12, cy];
      const c2 = [cx - 0.12, cy];
      for (let i = 0; i < N; i++) {
        const o = i * 6;
        const which = Math.random() < 0.5 ? c1 : c2;
        const a = Math.random() * Math.PI * 2;
        const r = 0.02 + Math.pow(Math.random(), 0.7) * 0.14;
        fv[o]   = which[0] + Math.cos(a) * r;
        fv[o+1] = which[1] + Math.sin(a) * r;
        // Orbital velocity
        const v = 0.05 / Math.sqrt(r + 0.05);
        fv[o+2] = -Math.sin(a) * v; fv[o+3] = Math.cos(a) * v;
        uv[o+4] = i % nTypes; uv[o+5] = 0;
      }
    }
    return buf;
  }

  // ─── Engine ───────────────────────────────────────────────────────────────
  async function createEngine(canvas, opts = {}) {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error('No WebGPU adapter');
    const device = await adapter.requestDevice();

    const ctx = canvas.getContext('webgpu');
    if (!ctx) throw new Error('No webgpu context');
    const format = navigator.gpu.getPreferredCanvasFormat();
    ctx.configure({ device, format, alphaMode: 'premultiplied' });

    const N = Math.max(1000, Math.min(opts.count || 5000, 10000));
    const nTypes = N_TYPES;

    // ─ Particle buffer (position + velocity + kind) ─
    const particleStride = 6 * 4; // vec2 pos + vec2 vel + u32 kind + u32 pad
    const particleBuf = device.createBuffer({
      size: particleStride * N,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    // Initial state — depends on mode
    const tempModeIdx = (typeof opts.mode === 'string')
      ? ({ particleLife: 0, nebula: 1, cluster: 2, spiral: 3, binary: 4 }[opts.mode] ?? 0)
      : (opts.mode || 0);
    const initData = initParticles(N, nTypes, tempModeIdx, opts);
    device.queue.writeBuffer(particleBuf, 0, initData);

    // ─ Matrix buffer ─
    const matrix = opts.matrix || defaultMatrix();
    const matrixBuf = device.createBuffer({
      size: matrix.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(matrixBuf, 0, matrix);

    // ─ Palette buffer (vec4 per type) ─
    const paletteData = new Float32Array(nTypes * 4);
    const colors = opts.palette || CHAKRA_COLORS;
    for (let i = 0; i < nTypes; i++) {
      const c = colors[i % colors.length];
      paletteData[i * 4 + 0] = c[0];
      paletteData[i * 4 + 1] = c[1];
      paletteData[i * 4 + 2] = c[2];
      paletteData[i * 4 + 3] = 1.0;
    }
    const paletteBuf = device.createBuffer({
      size: paletteData.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(paletteBuf, 0, paletteData);

    // ─ Params uniform (15 f32/u32 slots, aligned to 16 bytes = 64 bytes) ─
    const simParamsBuf = device.createBuffer({
      size: 64,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const renderParamsBuf = device.createBuffer({
      size: 16,  // 4 × f32
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // ─ Compute pipeline ─
    const computeModule = device.createShaderModule({ code: COMPUTE_WGSL });
    const computePipeline = device.createComputePipeline({
      layout: 'auto',
      compute: { module: computeModule, entryPoint: 'main' },
    });
    const computeBindGroup = device.createBindGroup({
      layout: computePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: particleBuf } },
        { binding: 1, resource: { buffer: matrixBuf } },
        { binding: 2, resource: { buffer: simParamsBuf } },
      ],
    });

    // ─ Render pipeline ─
    const renderModule = device.createShaderModule({ code: RENDER_WGSL });
    const renderPipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: renderModule, entryPoint: 'vs_main' },
      fragment: {
        module: renderModule, entryPoint: 'fs_main',
        targets: [{
          format,
          blend: {
            color: { srcFactor: 'src-alpha', dstFactor: 'one', operation: 'add' },  // additive glow
            alpha: { srcFactor: 'one',       dstFactor: 'one', operation: 'add' },
          },
        }],
      },
      primitive: { topology: 'triangle-list' },
    });
    const renderBindGroup = device.createBindGroup({
      layout: renderPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: particleBuf } },
        { binding: 1, resource: { buffer: paletteBuf } },
        { binding: 2, resource: { buffer: renderParamsBuf } },
      ],
    });

    // ─ Cosmic mode config (0=particle_life, 1=nebula, 2=cluster, 3=spiral, 4=binary) ─
    const modeNames = { particleLife: 0, nebula: 1, cluster: 2, spiral: 3, binary: 4 };
    const modeConfig = {
      0: { friction: 1.8,  gravity: 0,     swirl: 0,     r_max: 0.12 },
      1: { friction: 0.8,  gravity: 0.02,  swirl: 0,     r_max: 0.0 },
      2: { friction: 1.2,  gravity: 0.06,  swirl: 0.01,  r_max: 0.0 },
      3: { friction: 0.6,  gravity: 0.15,  swirl: 0.10,  r_max: 0.0 },
      4: { friction: 0.7,  gravity: 0.08,  swirl: 0,     r_max: 0.0 },
    };
    const modeIdx = (typeof opts.mode === 'string') ? (modeNames[opts.mode] ?? 0) : (opts.mode || 0);

    // ─ State ─
    const state = {
      running: false,
      audioBass: 0, audioHigh: 0,
      audioCallback: null,
      destroyed: false,
      speed: opts.speed || 1.0,
      mode: modeIdx,
      time: 0,
      center: opts.center || [0.5, 0.5],
      center2: opts.center2 || [0.35, 0.5],
    };

    function updateSimParams() {
      const buf = new ArrayBuffer(64);
      const f = new Float32Array(buf);
      const u = new Uint32Array(buf);
      const cfg = modeConfig[state.mode] || modeConfig[0];
      f[0] = 0.016 * state.speed;      // dt
      f[1] = cfg.r_max || 0.12;        // r_max
      f[2] = cfg.friction;              // friction
      f[3] = state.speed;               // forceScale
      f[4] = state.audioBass;
      f[5] = state.audioHigh;
      u[6] = N;
      u[7] = nTypes;
      u[8] = state.mode;
      f[9] = state.center[0];
      f[10] = state.center[1];
      f[11] = cfg.gravity;
      f[12] = state.center2[0];
      f[13] = state.center2[1];
      f[14] = cfg.swirl;
      f[15] = state.time;
      device.queue.writeBuffer(simParamsBuf, 0, buf);
    }

    function updateRenderParams() {
      const buf = new ArrayBuffer(16);
      const f = new Float32Array(buf);
      const aspect = canvas.width / canvas.height;
      f[0] = aspect;
      f[1] = 0.008;    // pointSize (normalized clip-space)
      f[2] = 1.4;      // brightness
      f[3] = 0;
      device.queue.writeBuffer(renderParamsBuf, 0, buf);
    }

    function resize() {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      updateRenderParams();
    }
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();
    updateSimParams();

    async function frame() {
      if (state.destroyed || !state.running) return;

      // Advance time
      state.time += 0.016 * state.speed;

      // Pull audio data if callback provided
      if (state.audioCallback) {
        const a = state.audioCallback();
        state.audioBass = a.bass ?? 0;
        state.audioHigh = a.high ?? 0;
      }
      updateSimParams();

      const enc = device.createCommandEncoder();
      // Compute pass
      const cpass = enc.beginComputePass();
      cpass.setPipeline(computePipeline);
      cpass.setBindGroup(0, computeBindGroup);
      cpass.dispatchWorkgroups(Math.ceil(N / 64));
      cpass.end();
      // Render pass
      const view = ctx.getCurrentTexture().createView();
      const rpass = enc.beginRenderPass({
        colorAttachments: [{
          view,
          clearValue: { r: 0.02, g: 0.01, b: 0.05, a: 1 },
          loadOp: 'clear', storeOp: 'store',
        }],
      });
      rpass.setPipeline(renderPipeline);
      rpass.setBindGroup(0, renderBindGroup);
      rpass.draw(6, N, 0, 0);
      rpass.end();
      device.queue.submit([enc.finish()]);

      requestAnimationFrame(frame);
    }

    return {
      start() { if (!state.running) { state.running = true; requestAnimationFrame(frame); } },
      stop()  { state.running = false; },
      setAudioCallback(cb) { state.audioCallback = cb; },
      setMatrix(newMatrix) {
        if (newMatrix?.length === N_TYPES * N_TYPES) {
          device.queue.writeBuffer(matrixBuf, 0, newMatrix);
        }
      },
      setSpeed(s) {
        state.speed = Math.max(0.2, Math.min(2.0, s || 1.0));
        updateSimParams();
      },
      setPalette(newColors) {
        const data = new Float32Array(nTypes * 4);
        for (let i = 0; i < nTypes; i++) {
          const c = newColors[i % newColors.length];
          data[i * 4 + 0] = c[0]; data[i * 4 + 1] = c[1]; data[i * 4 + 2] = c[2]; data[i * 4 + 3] = 1.0;
        }
        device.queue.writeBuffer(paletteBuf, 0, data);
      },
      destroy() {
        state.destroyed = true; state.running = false;
        ro.disconnect();
        try {
          particleBuf.destroy(); matrixBuf.destroy();
          paletteBuf.destroy(); simParamsBuf.destroy(); renderParamsBuf.destroy();
        } catch (_) {}
      },
    };
  }

  // ─── 5DO Blueprint-based personalization ──────────────────────────────────

  // Chakra indices: 0=root, 1=sacral, 2=solar, 3=heart, 4=throat, 5=third_eye, 6=crown
  const ELEMENT_CHAKRAS = {
    wood:  [3, 4],        // heart, throat
    fire:  [2],           // solar
    earth: [0, 1],        // root, sacral
    metal: [5, 6],        // third_eye, crown
    water: [1, 5],        // sacral, third_eye
  };

  // Five element cycles
  // Sheng (生, generation):  wood → fire → earth → metal → water → wood
  // Ke   (克, control):       wood → earth, fire → metal, earth → water, metal → wood, water → fire
  const SHENG_NEXT = { wood: 'fire', fire: 'earth', earth: 'metal', metal: 'water', water: 'wood' };
  const KE_NEXT    = { wood: 'earth', earth: 'water', water: 'fire', fire: 'metal', metal: 'wood' };

  // Generate a matrix tuned by user's saju profile
  function blueprintMatrix(blueprint) {
    const m = defaultMatrix();  // harmonious base
    if (!blueprint?.saju) return m;

    const saju = blueprint.saju;
    const dayMaster = saju.dayMasterElement || saju.dayMaster;
    const deficient = saju.deficient || [];
    const excess = saju.excess || [];

    const applyPair = (fromEl, toEl, delta) => {
      const from = ELEMENT_CHAKRAS[fromEl] || [];
      const to = ELEMENT_CHAKRAS[toEl] || [];
      from.forEach(i => to.forEach(j => {
        if (i === j) return;
        m[i * N_TYPES + j] = Math.max(-1, Math.min(1, m[i * N_TYPES + j] + delta));
      }));
    };

    // Sheng cycle — generation = attraction (+0.25)
    Object.keys(SHENG_NEXT).forEach(el => applyPair(el, SHENG_NEXT[el], 0.25));
    // Ke cycle — control = repulsion (-0.25)
    Object.keys(KE_NEXT).forEach(el => applyPair(el, KE_NEXT[el], -0.25));

    // Day master: slight self-attraction (rooting identity)
    if (dayMaster) {
      (ELEMENT_CHAKRAS[dayMaster] || []).forEach(i => {
        m[i * N_TYPES + i] = Math.min(1, (m[i * N_TYPES + i] || 0) + 0.2);
      });
    }

    // Deficient elements: pull inward (others attract deficient chakras strongly)
    deficient.forEach(el => {
      const targets = ELEMENT_CHAKRAS[el] || [];
      targets.forEach(j => {
        for (let i = 0; i < N_TYPES; i++) {
          if (i !== j) m[i * N_TYPES + j] = Math.min(1, m[i * N_TYPES + j] + 0.3);
        }
      });
    });

    // Excess elements: push outward (they repel others)
    excess.forEach(el => {
      const sources = ELEMENT_CHAKRAS[el] || [];
      sources.forEach(i => {
        for (let j = 0; j < N_TYPES; j++) {
          if (i !== j) m[i * N_TYPES + j] = Math.max(-1, m[i * N_TYPES + j] - 0.2);
        }
      });
    });

    return m;
  }

  // Starseed palette overrides (each → 7 chakra-aligned colors with family signature)
  const STARSEED_PALETTES = {
    Pleiadian:  [[1.0,0.85,0.95],[1.0,0.75,0.85],[1.0,0.95,0.65],[0.65,1.0,0.85],[0.75,0.9,1.0],[0.85,0.75,1.0],[1.0,0.85,1.0]],
    Sirian:     [[0.95,0.4,0.3],[1.0,0.6,0.15],[1.0,0.95,0.4],[0.4,0.95,0.65],[0.3,0.8,1.0],[0.6,0.4,0.95],[0.85,0.5,1.0]],
    Arcturian:  [[0.2,0.9,1.0],[0.3,1.0,0.85],[0.5,1.0,0.55],[0.9,1.0,0.3],[1.0,0.6,0.2],[0.9,0.3,0.8],[1.0,0.95,0.4]],
    Andromedan: [[0.5,0.2,0.7],[0.7,0.3,0.85],[0.85,0.4,1.0],[0.55,0.55,1.0],[0.3,0.7,1.0],[0.4,0.9,0.85],[0.7,1.0,0.7]],
    Orion:      [[0.95,0.1,0.1],[0.95,0.55,0.0],[1.0,0.85,0.0],[0.3,0.8,0.3],[0.1,0.5,0.85],[0.35,0.15,0.7],[0.6,0.25,1.0]],
  };

  function blueprintPalette(blueprint) {
    const top = blueprint?.starseed?.[0];
    const id = top?.id;
    if (id && STARSEED_PALETTES[id]) return STARSEED_PALETTES[id];
    return CHAKRA_COLORS;  // fallback to pure chakra rainbow
  }

  // Map personal frequency (Hz) to simulation speed multiplier (0.6–1.5)
  function frequencySpeed(hz) {
    if (!hz || hz < 50) return 1.0;
    // 174 (grounding) → 0.75; 432 (baseline) → 1.0; 528 (active) → 1.15; 963 (ascension) → 1.45
    const norm = Math.max(0.6, Math.min(1.5, 0.55 + hz / 1100));
    return norm;
  }

  // ─── Starseed → Cosmic Mode auto-mapping ──────────────────────────────────
  const STARSEED_MODES = {
    Pleiadian:  'cluster',   // Pleiades star cluster
    Sirian:     'binary',    // Sirius A + B binary
    Arcturian:  'nebula',    // Cosmic intelligence field
    Andromedan: 'spiral',    // Andromeda galaxy
    Orion:      'nebula',    // Orion Nebula (M42)
  };

  function blueprintMode(blueprint) {
    const id = blueprint?.starseed?.[0]?.id;
    return STARSEED_MODES[id] || 'cluster';  // default
  }

  // Cosmic-friendly palette presets (hot core → cool edges)
  const COSMIC_PALETTES = {
    // Andromeda: golden core + blue spiral arms
    spiral:  [[1.0,0.85,0.55],[1.0,0.65,0.35],[1.0,0.5,0.3],[0.55,0.7,1.0],[0.3,0.5,1.0],[0.45,0.35,0.85],[0.7,0.55,1.0]],
    // Pleiades: white-hot stars + blue reflection nebula
    cluster: [[1.0,1.0,1.0],[0.95,0.98,1.0],[0.85,0.92,1.0],[0.6,0.75,1.0],[0.4,0.6,1.0],[0.35,0.45,0.95],[0.55,0.45,1.0]],
    // Orion Nebula: hydrogen alpha red + greenish OIII + dust
    nebula:  [[1.0,0.3,0.35],[1.0,0.5,0.25],[1.0,0.8,0.4],[0.6,1.0,0.55],[0.4,0.9,0.8],[0.4,0.55,1.0],[0.75,0.4,1.0]],
    // Sirius binary: blue-white primary + fainter companion
    binary:  [[0.95,0.98,1.0],[1.0,0.9,0.85],[0.8,0.95,1.0],[0.6,0.8,1.0],[1.0,0.75,0.6],[0.5,0.7,1.0],[0.9,0.7,1.0]],
  };

  window.ParticleLife = {
    isSupported, createEngine, defaultMatrix, CHAKRA_COLORS, N_TYPES,
    blueprintMatrix, blueprintPalette, frequencySpeed, STARSEED_PALETTES,
    blueprintMode, COSMIC_PALETTES, STARSEED_MODES,
  };
})();
