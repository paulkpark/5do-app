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
  r_max:       f32,      // max interaction radius (normalized 0..1)
  friction:    f32,
  forceScale:  f32,
  audioBass:   f32,
  audioHigh:   f32,
  n:           u32,
  nTypes:      u32,
};

@group(0) @binding(0) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(1) var<storage, read>       matrix:    array<f32>;
@group(0) @binding(2) var<uniform>             params:    Params;

// force profile: repulse close (<0.3), attract farther (0.3..1.0)
fn force(r: f32, a: f32) -> f32 {
  let beta: f32 = 0.3;
  if (r < beta) {
    return r / beta - 1.0;
  } else if (r < 1.0) {
    return a * (1.0 - abs(2.0 * r - 1.0 - beta) / (1.0 - beta));
  }
  return 0.0;
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i: u32 = gid.x;
  if (i >= params.n) { return; }

  var p = particles[i];
  var totalForce = vec2<f32>(0.0, 0.0);

  // Accumulate force from all other particles (O(n²) — OK for n ≤ 8000)
  for (var j: u32 = 0u; j < params.n; j = j + 1u) {
    if (j == i) { continue; }
    let other = particles[j];
    var d = other.pos - p.pos;
    // Toroidal wrap (closest distance across seams)
    if (d.x > 0.5) { d.x = d.x - 1.0; } else if (d.x < -0.5) { d.x = d.x + 1.0; }
    if (d.y > 0.5) { d.y = d.y - 1.0; } else if (d.y < -0.5) { d.y = d.y + 1.0; }

    let r = length(d);
    if (r > 0.0 && r < params.r_max) {
      let a = matrix[p.kind * params.nTypes + other.kind];
      let f = force(r / params.r_max, a);
      totalForce = totalForce + (d / r) * f;
    }
  }

  // Audio bass amplifies attractive forces, high amplifies velocity
  let forceMul = params.forceScale * (1.0 + params.audioBass * 1.2);
  p.vel = p.vel + totalForce * params.r_max * forceMul * params.dt;
  p.vel = p.vel * (1.0 - params.friction * params.dt) * (1.0 + params.audioHigh * 0.3);
  p.pos = p.pos + p.vel * params.dt;

  // Toroidal wrap
  p.pos = fract(p.pos + vec2<f32>(1.0, 1.0));

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

  // Quad corners in clip space (triangle strip expanded to 6 verts)
  let offsets = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0), vec2<f32>( 1.0, -1.0), vec2<f32>(-1.0,  1.0),
    vec2<f32>( 1.0, -1.0), vec2<f32>( 1.0,  1.0), vec2<f32>(-1.0,  1.0),
  );
  let off = offsets[vid];
  // Convert particle pos (0..1) to clip space (-1..1); y flipped
  let clipPos = vec2<f32>(p.pos.x * 2.0 - 1.0, 1.0 - p.pos.y * 2.0);
  let sizeX = rp.pointSize;
  let sizeY = rp.pointSize * rp.aspect;
  let corner = clipPos + vec2<f32>(off.x * sizeX, off.y * sizeY);

  var out: VsOut;
  out.pos = vec4<f32>(corner, 0.0, 1.0);
  out.uv = off;
  out.color = col;
  return out;
}

@fragment
fn fs_main(in: VsOut) -> @location(0) vec4<f32> {
  let d = length(in.uv);
  if (d > 1.0) { discard; }
  // Soft radial falloff + bright core
  let alpha = pow(1.0 - d, 2.0);
  let glow = exp(-d * 2.5) * rp.brightness;
  let rgb = in.color * glow;
  return vec4<f32>(rgb, alpha);
}
`;

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

    // Random initial state
    const initData = new ArrayBuffer(particleStride * N);
    const fv = new Float32Array(initData);
    const uv = new Uint32Array(initData);
    for (let i = 0; i < N; i++) {
      const o = i * 6;
      fv[o + 0] = Math.random();              // pos.x
      fv[o + 1] = Math.random();              // pos.y
      fv[o + 2] = (Math.random() - 0.5) * 0.01; // vel.x
      fv[o + 3] = (Math.random() - 0.5) * 0.01; // vel.y
      uv[o + 4] = i % nTypes;                 // kind
      uv[o + 5] = 0;
    }
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

    // ─ Params uniform ─
    const simParamsBuf = device.createBuffer({
      size: 32,  // 8 × f32/u32
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

    // ─ State ─
    const state = {
      running: false,
      audioBass: 0, audioHigh: 0,
      audioCallback: null,
      destroyed: false,
      speed: opts.speed || 1.0,        // multiplier for force + velocity
    };

    function updateSimParams() {
      const buf = new ArrayBuffer(32);
      const f = new Float32Array(buf);
      const u = new Uint32Array(buf);
      f[0] = 0.016 * state.speed;      // dt (scaled by user's personal freq)
      f[1] = 0.12;                     // r_max (normalized)
      f[2] = 1.8;                      // friction
      f[3] = state.speed;              // forceScale
      f[4] = state.audioBass;          // audioBass (0..1)
      f[5] = state.audioHigh;          // audioHigh (0..1)
      u[6] = N;                        // n
      u[7] = nTypes;                   // nTypes
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

      // Pull audio data if callback provided
      if (state.audioCallback) {
        const a = state.audioCallback();
        state.audioBass = a.bass ?? 0;
        state.audioHigh = a.high ?? 0;
        updateSimParams();
      }

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

  window.ParticleLife = {
    isSupported, createEngine, defaultMatrix, CHAKRA_COLORS, N_TYPES,
    blueprintMatrix, blueprintPalette, frequencySpeed, STARSEED_PALETTES,
  };
})();
