// public/js/torus-viz.js
// Quantum Torus (Hopf-fibration) visualizer — extracted from the standalone
// reference and wrapped as an injectable module for the app's Cymatics "Torus"
// style. Self-contained WebGL2; the app feeds it a normalized 32-bin
// Float32Array (same shape as cymatics-loader) so it reacts to the playing
// track's audio. No DOM/audio UI of its own.
//
// API: const t = initTorus(canvas, getBins); t.start(); t.stop(); t.resize(); t.destroy();
/* eslint-disable */

const BINS = 32;
/* ── js/torus-hopf.js ── */
// public/js/torus-hopf.js
//
// Hopf-fibration geometry engine for the Quantum Torus visualizer.
//
// The base surface is the stereographic projection of the Clifford torus in S³.
// With holeRatio h = (√2−1)² the projection collapses to R = √2, r = 1, whose
// outer radius is exactly the silver ratio 1+√2 — that constant is the natural
// bounding scale for the whole construction, not a decoration.
//
//   P(u,v) = C · (cos u, sin u, cos v) / (K − sin v)
//   K = (1+h)/(1−h)          major/minor ratio
//   C = SILVER · (K − 1)     overall scale
//
// Hopf fibers project to Villarceau circles, which appear on this surface as the
// two families u − v = const (chirality +1) and u + v = const (chirality −1).
// Every fiber is a perfect circle in 3-space; circleThrough() recovers its
// center/normal/radius from three sampled points, which is both the cheapest and
// the most numerically honest way to get them.
//
// Recursion: a +chirality fiber and a −chirality fiber meet at exactly two
// points. Placing a child torus at each meeting point of the *half-offset*
// lattice (the interstitial lattice, sitting midway between the drawn fibers)
// gives 2m² children per node, each sized to just touch its nearest fiber. The
// packing is therefore self-limiting — no manual scale tuning per level.
//
// Pure math, no WebGL, no DOM: importable under `node --test`.

const SILVER = 1 + Math.SQRT2;
const TAU = Math.PI * 2;

/** holeRatio that reproduces the Clifford torus (R = √2, r = 1). */
const CLIFFORD_HOLE_RATIO = (Math.SQRT2 - 1) * (Math.SQRT2 - 1);

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/**
 * Derived torus quantities for a given hole ratio.
 *   K, C     — the two shader uniforms (uC, uGeom)
 *   major    — center-line radius of the tube
 *   minor    — radial semi-axis of the tube cross-section
 *   axial    — axial semi-axis (equals `minor` only at the Clifford ratio)
 */
function torusParams(holeRatio = CLIFFORD_HOLE_RATIO) {
  const h = clamp(Number.isFinite(holeRatio) ? holeRatio : CLIFFORD_HOLE_RATIO, 0.005, 0.9);
  const K = (1 + h) / (1 - h);
  const C = SILVER * (K - 1);
  const major = (SILVER * (1 + h)) / 2;
  const minor = (SILVER * (1 - h)) / 2;
  const axial = minor * ((2 * Math.sqrt(h)) / (1 - h));
  return { h, K, C, major, minor, axial };
}

/** P(u,v) on the projected torus. Writes into `out` (length ≥ 3). */
function torusPoint(u, v, K, C, out) {
  const d = K - Math.sin(v);
  const n = C / d;
  out[0] = Math.cos(u) * n;
  out[1] = Math.sin(u) * n;
  out[2] = Math.cos(v) * n;
  return out;
}

/** ∂P/∂u, unnormalized (the C/(K−sin v) factor is dropped; callers normalize). */
function dPdu(u, v, K, out) {
  const d = K - Math.sin(v);
  out[0] = -Math.sin(u) / d;
  out[1] = Math.cos(u) / d;
  out[2] = 0;
  return out;
}

/** ∂P/∂v, unnormalized. z-term simplifies to (1 − K·sin v)/d². */
function dPdv(u, v, K, out) {
  const d = K - Math.sin(v);
  const d2 = d * d;
  const cv = Math.cos(v);
  out[0] = (Math.cos(u) * cv) / d2;
  out[1] = (Math.sin(u) * cv) / d2;
  out[2] = (1 - K * Math.sin(v)) / d2;
  return out;
}

function cross(a, b, out) {
  const x = a[1] * b[2] - a[2] * b[1];
  const y = a[2] * b[0] - a[0] * b[2];
  const z = a[0] * b[1] - a[1] * b[0];
  out[0] = x; out[1] = y; out[2] = z;
  return out;
}

function normalize(v) {
  const L = Math.hypot(v[0], v[1], v[2]);
  if (L > 1e-12) { v[0] /= L; v[1] /= L; v[2] /= L; }
  return v;
}

/**
 * Circumscribed circle of three points in 3-space.
 * Returns {cx,cy,cz, nx,ny,nz, r} or null when the points are collinear.
 *
 * Used to prove-and-capture the fiber circles: if the three samples did not lie
 * on a common circle the construction would be wrong, and a degenerate normal is
 * the signal that the parameters left the valid range.
 */
function circleThrough(p0, p1, p2) {
  const a = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
  const b = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
  const n = cross(a, b, [0, 0, 0]);
  const nn = n[0] * n[0] + n[1] * n[1] + n[2] * n[2];
  if (nn < 1e-24) return null;

  const aa = a[0] * a[0] + a[1] * a[1] + a[2] * a[2];
  const bb = b[0] * b[0] + b[1] * b[1] + b[2] * b[2];
  const t1 = cross(b, n, [0, 0, 0]);
  const t2 = cross(n, a, [0, 0, 0]);
  const k = 1 / (2 * nn);
  const cx = p0[0] + (t1[0] * aa + t2[0] * bb) * k;
  const cy = p0[1] + (t1[1] * aa + t2[1] * bb) * k;
  const cz = p0[2] + (t1[2] * aa + t2[2] * bb) * k;

  normalize(n);
  return {
    cx, cy, cz,
    nx: n[0], ny: n[1], nz: n[2],
    r: Math.hypot(cx - p0[0], cy - p0[1], cz - p0[2])
  };
}

/** Shortest distance from a point to a circle {c, n, r}. */
function distanceToCircle(px, py, pz, c) {
  const dx = px - c.cx, dy = py - c.cy, dz = pz - c.cz;
  const axial = dx * c.nx + dy * c.ny + dz * c.nz;
  const rx = dx - c.nx * axial;
  const ry = dy - c.ny * axial;
  const rz = dz - c.nz * axial;
  const radial = Math.hypot(rx, ry, rz) - c.r;
  return Math.hypot(radial, axial);
}

/**
 * The 2m fiber circles at a given recursion depth, already advanced by `alpha`.
 *
 * The two chiralities counter-rotate about Z — that opposition *is* the Hopf
 * flow, and it is why the animation reads as two interlocked currents rather
 * than one spinning object. `delta` twists successive depths apart so nested
 * tori do not phase-lock into a visually flat stack.
 */
function fiberCircles({ m, K, C, delta, depth, alpha }) {
  const out = [];
  const plusOff = depth * delta;
  const minusOff = -depth * delta;
  const p0 = [0, 0, 0], p1 = [0, 0, 0], p2 = [0, 0, 0];

  for (let s = 0; s < m; s++) {
    const off = (TAU * s) / m + plusOff + alpha;
    // u − v = off
    torusPoint(0 + off, 0, K, C, p0);
    torusPoint(TAU / 3 + off, TAU / 3, K, C, p1);
    torusPoint((2 * TAU) / 3 + off, (2 * TAU) / 3, K, C, p2);
    const c = circleThrough(p0, p1, p2);
    if (!c) continue;
    c.chir = 1; c.index = s;
    out.push(c);
  }
  for (let s = 0; s < m; s++) {
    const off = (TAU * s) / m + minusOff - alpha;
    // u + v = off
    torusPoint(off - 0, 0, K, C, p0);
    torusPoint(off - TAU / 3, TAU / 3, K, C, p1);
    torusPoint(off - (2 * TAU) / 3, (2 * TAU) / 3, K, C, p2);
    const c = circleThrough(p0, p1, p2);
    if (!c) continue;
    c.chir = -1; c.index = s;
    out.push(c);
  }
  return out;
}

function quatFromBasis(tx, ty, tz, bx, by, bz, nx, ny, nz, out, o) {
  // Column-major basis [T B N]; standard matrix → quaternion with the usual
  // largest-diagonal branch for numerical stability.
  const tr = tx + by + nz;
  let x, y, z, w;
  if (tr > 0) {
    const s = Math.sqrt(tr + 1) * 2;
    w = 0.25 * s; x = (bz - ny) / s; y = (nx - tz) / s; z = (ty - bx) / s;
  } else if (tx > by && tx > nz) {
    const s = Math.sqrt(1 + tx - by - nz) * 2;
    w = (bz - ny) / s; x = 0.25 * s; y = (bx + ty) / s; z = (nx + tz) / s;
  } else if (by > nz) {
    const s = Math.sqrt(1 + by - tx - nz) * 2;
    w = (nx - tz) / s; x = (bx + ty) / s; y = 0.25 * s; z = (ny + bz) / s;
  } else {
    const s = Math.sqrt(1 + nz - tx - by) * 2;
    w = (ty - bx) / s; x = (nx + tz) / s; y = (ny + bz) / s; z = 0.25 * s;
  }
  out[o] = x; out[o + 1] = y; out[o + 2] = z; out[o + 3] = w;
}

/**
 * Local child layout for one recursion depth: 2m² frames on the parent surface.
 *
 * Children sit on the *half-offset* lattice — (i+0.5) rather than i — so they
 * land in the interstices between the drawn fibers instead of on top of them.
 * That offset is what makes `gap` (distance to the nearest fiber) nonzero and
 * turns the sizing rule into a real packing constraint.
 */
function childFrames({ m, K, C, delta, depth, alpha, aFill, out = null }) {
  const circles = fiberCircles({ m, K, C, delta, depth, alpha });
  const n = 2 * m * m;
  // The layout is recomputed every frame while alpha advances, so reuse the
  // buffers when the caller supplies them — allocating here would hand the GC
  // a few hundred kilobytes per second for no reason.
  const reuse = out && out.count === n;
  const pos = reuse ? out.pos : new Float32Array(n * 3);
  const quat = reuse ? out.quat : new Float32Array(n * 4);
  const gap = reuse ? out.gap : new Float32Array(n);

  const plusOff = depth * delta;
  const minusOff = -depth * delta;
  const P = [0, 0, 0], T = [0, 0, 0], V = [0, 0, 0], N = [0, 0, 0], B = [0, 0, 0];
  let extent = SILVER;
  let w = 0;

  for (let i = 0; i < m; i++) {
    const hOff = (TAU * (i + 0.5)) / m + plusOff;
    for (let j = 0; j < m; j++) {
      const gOff = (TAU * (j + 0.5)) / m + minusOff;
      for (let branch = 0; branch < 2; branch++) {
        // Intersection of (u − v = hOff+α) and (u + v = gOff−α); the two circles
        // of opposite chirality meet twice, half a turn apart.
        const u = 0.5 * (hOff + gOff) + branch * Math.PI;
        const v = 0.5 * (gOff - hOff) + branch * Math.PI - alpha;

        torusPoint(u, v, K, C, P);
        dPdu(u, v, K, T); normalize(T);
        dPdv(u, v, K, V);
        cross(T, V, N); normalize(N);
        cross(N, T, B); normalize(B);

        pos[w * 3] = P[0]; pos[w * 3 + 1] = P[1]; pos[w * 3 + 2] = P[2];
        quatFromBasis(T[0], T[1], T[2], B[0], B[1], B[2], N[0], N[1], N[2], quat, w * 4);

        let best = Infinity;
        for (let k = 0; k < circles.length; k++) {
          const d = distanceToCircle(P[0], P[1], P[2], circles[k]);
          if (d < best) best = d;
        }
        gap[w] = best;

        const reach = Math.hypot(P[0], P[1], P[2]) + aFill * best;
        if (reach > extent) extent = reach;
        w++;
      }
    }
  }
  return { pos, quat, gap, count: n, extent };
}

/** Rotate v by unit quaternion q (xyzw), writing into out[o..o+2]. */
function qrot(qx, qy, qz, qw, vx, vy, vz, out) {
  // v + 2q_v × (q_v × v + w·v)
  const tx = qy * vz - qz * vy + qw * vx;
  const ty = qz * vx - qx * vz + qw * vy;
  const tz = qx * vy - qy * vx + qw * vz;
  out[0] = vx + 2 * (qy * tz - qz * ty);
  out[1] = vy + 2 * (qz * tx - qx * tz);
  out[2] = vz + 2 * (qx * ty - qy * tx);
}

/** Hamilton product q = a ⊗ b, both xyzw. */
function qmul(ax, ay, az, aw, bx, by, bz, bw, out, o) {
  out[o] = aw * bx + ax * bw + ay * bz - az * by;
  out[o + 1] = aw * by - ax * bz + ay * bw + az * bx;
  out[o + 2] = aw * bz + ax * by - ay * bx + az * bw;
  out[o + 3] = aw * bw - ax * bx - ay * by - az * bz;
}

/**
 * Expand the recursion into flat instance buffers.
 *
 * Returns typed arrays laid out for direct upload as instanced attributes:
 *   posScale — xyz position + uniform scale, 4 floats per node
 *   quat     — orientation, 4 floats per node
 *   depth    — recursion level, 1 float per node
 *   ranges   — [start, end) per level, so each level can be drawn with its own
 *              segment count (deep levels are small on screen and need far
 *              fewer samples)
 *
 * `nodeBudget` truncates breadth-first, so lowering it degrades density rather
 * than lopping off a whole level and changing the silhouette.
 */
function buildNodes({
  m = 6,
  levels = 2,
  delta = 0.04,
  aFill = 0.84,
  holeRatio = CLIFFORD_HOLE_RATIO,
  alpha = 0,
  nodeBudget = 1400,
  state = null
} = {}) {
  const { K, C } = torusParams(holeRatio);
  const mm = Math.max(2, Math.round(m));
  const L = Math.max(0, Math.round(levels));

  // Local layout per depth, computed once; every node at a depth shares it.
  const frames = state && state.frames ? state.frames : [];
  for (let d = 0; d <= L; d++) {
    frames[d] = childFrames({ m: mm, K, C, delta, depth: d, alpha, aFill, out: frames[d] });
  }
  frames.length = L + 1;

  const cap = Math.max(1, Math.floor(nodeBudget));
  const fits = state && state.posScale && state.posScale.length === cap * 4;
  const posScale = fits ? state.posScale : new Float32Array(cap * 4);
  const quat = fits ? state.quat : new Float32Array(cap * 4);
  const depth = fits ? state.depth : new Float32Array(cap);
  if (state) {
    state.frames = frames;
    state.posScale = posScale;
    state.quat = quat;
    state.depth = depth;
  }

  // Root node: identity transform at unit scale. Written explicitly rather than
  // assumed zero, because the buffers may be carried over from a prior frame.
  posScale[0] = 0; posScale[1] = 0; posScale[2] = 0; posScale[3] = 1;
  quat[0] = 0; quat[1] = 0; quat[2] = 0; quat[3] = 1;
  depth[0] = 0;
  let count = 1;

  const ranges = [[0, 1]];
  let rowStart = 0;
  let rowEnd = 1;
  const rotated = [0, 0, 0];

  for (let level = 0; level < L && count < cap; level++) {
    const nextStart = count;
    for (let p = rowStart; p < rowEnd && count < cap; p++) {
      const pd = depth[p] | 0;
      const f = frames[pd];
      if (!f) continue;
      // Normalizing by the child level's own extent makes `aFill · gap` bound
      // the child's entire subtree, not just its root ring.
      const childExtent = pd + 1 <= L ? frames[pd + 1].extent : SILVER;

      const px = posScale[p * 4], py = posScale[p * 4 + 1], pz = posScale[p * 4 + 2];
      const ps = posScale[p * 4 + 3];
      const qx = quat[p * 4], qy = quat[p * 4 + 1], qz = quat[p * 4 + 2], qw = quat[p * 4 + 3];

      for (let i = 0; i < f.count && count < cap; i++) {
        const g = f.gap[i];
        if (!(g > 1e-12)) continue;

        qrot(qx, qy, qz, qw,
          f.pos[i * 3] * ps, f.pos[i * 3 + 1] * ps, f.pos[i * 3 + 2] * ps, rotated);

        const o = count * 4;
        posScale[o] = px + rotated[0];
        posScale[o + 1] = py + rotated[1];
        posScale[o + 2] = pz + rotated[2];
        posScale[o + 3] = ps * ((aFill * g) / childExtent);

        qmul(qx, qy, qz, qw,
          f.quat[i * 4], f.quat[i * 4 + 1], f.quat[i * 4 + 2], f.quat[i * 4 + 3],
          quat, o);

        depth[count] = pd + 1;
        count++;
      }
    }
    ranges.push([nextStart, count]);
    rowStart = nextStart;
    rowEnd = count;
    if (rowEnd <= rowStart) break;
  }

  return { posScale, quat, depth, ranges, count, K, C, truncated: count >= cap };
}

/**
 * Bounding extents of a built node set, for tightening the camera frustum.
 * Near/far planes hugging the actual content is what keeps millions of
 * overlapping translucent line fragments from z-fighting.
 */
function nodeBounds(nodes, profile = 1) {
  let radial = SILVER;
  let axial = SILVER;
  const s = Math.max(SILVER, profile);
  for (let i = 0; i < nodes.count; i++) {
    const o = i * 4;
    const r = nodes.posScale[o + 3] * s;
    const rr = Math.hypot(nodes.posScale[o], nodes.posScale[o + 1]) + r;
    const aa = Math.abs(nodes.posScale[o + 2]) + r;
    if (rr > radial) radial = rr;
    if (aa > axial) axial = aa;
  }
  return { radial, axial, bounding: Math.max(radial, axial) * 1.15 };
}

/**
 * Frame-loop wrapper around buildNodes.
 *
 * Owns its buffers so a per-frame rebuild allocates nothing, and additionally
 * derives `light` — the key light direction rotated into each node's local
 * frame. The fiber shader needs that vector to shade the tangent highlight, and
 * it is constant per instance, so rotating it once per node here saves the same
 * quaternion rotation on every one of the node's vertices.
 */
function createNodeBuilder(config = {}) {
  const cfg = {
    m: 6,
    levels: 2,
    delta: 0.04,
    aFill: 0.84,
    holeRatio: CLIFFORD_HOLE_RATIO,
    nodeBudget: 1400,
    ...config
  };
  const state = {};
  let light = new Float32Array(0);
  let lightDir = [0.52, 0.66, 0.54];
  {
    const L = Math.hypot(...lightDir);
    lightDir = lightDir.map((v) => v / L);
  }
  const tmp = [0, 0, 0];

  return {
    get config() { return { ...cfg }; },

    /** Change parameters; buffers resize on the next update. */
    configure(patch) {
      Object.assign(cfg, patch);
    },

    setLightDir(x, y, z) {
      const L = Math.hypot(x, y, z) || 1;
      lightDir = [x / L, y / L, z / L];
    },

    /** Rebuild the whole recursion at the given Hopf phase. */
    update(alpha) {
      const nodes = buildNodes({ ...cfg, alpha, state });
      if (light.length !== nodes.count * 3) light = new Float32Array(nodes.count * 3);
      for (let i = 0; i < nodes.count; i++) {
        const o = i * 4;
        // Inverse rotation: conjugate quaternion applied to the world light.
        qrot(-nodes.quat[o], -nodes.quat[o + 1], -nodes.quat[o + 2], nodes.quat[o + 3],
          lightDir[0], lightDir[1], lightDir[2], tmp);
        light[i * 3] = tmp[0];
        light[i * 3 + 1] = tmp[1];
        light[i * 3 + 2] = tmp[2];
      }
      nodes.light = light;
      return nodes;
    }
  };
}

/**
 * Phase wrap for the Hopf flow.
 *
 * The configuration is m-fold symmetric, so advancing alpha by exactly 2π/m
 * maps it onto itself. Wrapping there gives a seamless loop with no crossfade
 * and no drift — worth preserving whenever alpha is stored or restored.
 */
function wrapAlpha(alpha, m) {
  const period = TAU / Math.max(2, Math.round(m));
  return ((alpha % period) + period) % period;
}

/* ── js/torus-shaders.js ── */
// public/js/torus-shaders.js
//
// GLSL ES 3.00 sources for the Quantum Torus visualizer.
//
// Design note: no vertex positions are ever uploaded for the fibers or the
// particles. Each vertex carries two floats — a curve parameter and a fiber
// index — and evaluates P(u,v) itself. The CPU only touches 9 floats per node
// (position+scale, orientation, depth), so the recursion can grow by orders of
// magnitude without the per-frame upload growing with it.

const TAU_GLSL = '6.283185307179586';

/** Shared helpers: quaternion rotation and the projected-torus parametrization. */
const COMMON = `
#define TAU ${TAU_GLSL}
// Outer radius of the unit construction (1 + √2). Doubles as the on-screen
// size estimate for a node, which is what the particle gate measures against.
#define SILVER 2.414213562373095

vec3 qrot(vec4 q, vec3 v) {
  return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v);
}

// P(u,v) = geom * (cos u, sin u, cos v) / (C - sin v)
vec3 torPoint(float u, float v, float C, float geom) {
  return geom * vec3(cos(u), sin(u), cos(v)) / (C - sin(v));
}

// Which family a fiber index belongs to, and its phase within that family.
float chirOf(float f, float m)  { return f < m ? 1.0 : -1.0; }
float indexOf(float f, float m) { return f < m ? f : f - m; }

// The two chiralities counter-rotate: +alpha for one family, -alpha for the
// other. Advancing both by the same amount would merely spin the object.
float basePhase(float f, float m, float depth, float delta, float alpha) {
  float chir = chirOf(f, m);
  return TAU * indexOf(f, m) / m + chir * (depth * delta + alpha);
}

// Axial profile scale, applied in each node's own local frame so that a global
// squash never shears a rotated child.
vec3 deform(vec3 p, float profileZ) {
  p.z *= profileZ;
  return p;
}
`;

// ─── Fibers: instanced line segments ─────────────────────────────────────────

const FIBER_VERT = `#version 300 es
precision highp float;
${COMMON}

in float aT;              // curve parameter for this vertex
in float aF;              // fiber index, [0, m) = +chirality, [m, 2m) = -
in vec4  iPosScale;       // per node: xyz position, w uniform scale
in vec4  iQuat;           // per node: orientation
in float iDepth;          // per node: recursion level
in vec3  iLight;          // per node: key light pre-rotated into node space

uniform mat4  u_viewProj;
uniform float u_m, u_delta, u_alpha, u_C, u_geom, u_profile;
uniform float u_sheenStrength, u_sheenSharpness;
uniform vec3  u_sheenColor;
uniform vec3  u_plusByDepth[4];
uniform vec3  u_minusByDepth[4];
uniform float u_audioSheen;   // treble lifts the specular streak
uniform float u_audioGlow;    // overall level lifts base brightness

out vec3 vColor;

void main() {
  float chir = chirOf(aF, u_m);
  float u = chir * aT + basePhase(aF, u_m, iDepth, u_delta, u_alpha);
  float v = aT;

  // One trig evaluation each; this shader runs on hundreds of thousands of
  // vertices per frame and recomputing sin/cos here is measurable.
  float su = sin(u), cu = cos(u), sv = sin(v), cv = cos(v);
  float d  = u_C - sv;
  vec3 local = u_geom * vec3(cu, su, cv) / d;

  // Analytic tangent dP/dt with du/dt = chir, dv/dt = 1, pre-multiplied by d*d
  // so both divisions cancel. normalize() removes the common factor, and d > 0
  // because u_C > 1 >= sin v for every valid hole ratio.
  vec3 T = normalize(chir * d * vec3(-su, cu, 0.0)
                     + vec3(cu * cv, su * cv, 1.0 - u_C * sv));

  // Lines have no normal, so the highlight comes off the tangent instead:
  // brightest where the curve runs perpendicular to the light.
  float sheen = (u_sheenStrength + u_audioSheen)
              * pow(max(1.0 - abs(dot(T, iLight)), 0.0), u_sheenSharpness);

  int di = int(clamp(iDepth, 0.0, 3.0));
  vec3 base = chir > 0.0 ? u_plusByDepth[di] : u_minusByDepth[di];
  vColor = mix(base * (1.0 + u_audioGlow), u_sheenColor, clamp(sheen, 0.0, 1.0));

  local = deform(local, u_profile);
  vec3 p = qrot(iQuat, local * iPosScale.w) + iPosScale.xyz;
  gl_Position = u_viewProj * vec4(p, 1.0);
}`;

const FIBER_FRAG = `#version 300 es
precision highp float;
uniform float u_opacity;
in vec3 vColor;
out vec4 outColor;
void main() { outColor = vec4(vColor, u_opacity); }`;

// ─── Particles: instanced points flowing along the fibers ────────────────────

const PARTICLE_VERT = `#version 300 es
precision highp float;
${COMMON}

in float aF, aPhase, aSpd, aSeed, aSize, aTail;
in vec4  iPosScale;
in vec4  iQuat;
in float iDepth;

uniform mat4  u_view, u_proj;
uniform float u_m, u_delta, u_alpha, u_C, u_geom, u_profile;
uniform float u_time, u_flowPhase, u_size, u_alphaMul;
uniform float u_resScale, u_focal, u_gateLo, u_gateHi, u_sizeGamma;
uniform vec3  u_plusByDepth[4];
uniform vec3  u_minusByDepth[4];
uniform float u_audioBright;

out vec3 vCol;
out float vA;

void main() {
  float chir = chirOf(aF, u_m);
  float ph   = basePhase(aF, u_m, iDepth, u_delta, u_alpha);

  // The particle's own parameter advances along the fiber — this is the flow.
  // The phase is integrated on the CPU rather than derived as time × speed:
  // multiplying elapsed time would retroactively rewrite every past position,
  // so changing speed (or reversing it) would teleport the whole train.
  float t = aPhase + u_flowPhase * aSpd;
  vec3 local = torPoint(chir * t + ph, t, u_C, u_geom);
  local = deform(local, u_profile);

  vec3 p = qrot(iQuat, local * iPosScale.w) + iPosScale.xyz;
  vec4 mv = u_view * vec4(p, 1.0);
  float depthEye = max(0.001, -mv.z);

  // A node only a few pixels across cannot show flow, so its particles collapse
  // to zero size and emit no fragments at all.
  float pxR  = iPosScale.w * SILVER * u_focal / depthEye;
  float gain = smoothstep(u_gateLo, u_gateHi, pxR);

  float tw = 0.82 + 0.18 * sin(u_time * 2.3 + aSeed * 628.318);
  int di = int(clamp(iDepth, 0.0, 3.0));
  vCol = (chir > 0.0 ? u_plusByDepth[di] : u_minusByDepth[di]) * (1.35 + u_audioBright);
  vA = u_alphaMul * aTail * tw * gain;

  // Node scale spans a couple of orders of magnitude across depths, so point
  // size follows a gamma rather than tracking scale linearly.
  float sizeScale = pow(max(iPosScale.w, 1e-5), u_sizeGamma);

  // u_resScale references the same fixed-height buffer the bloom uses, not
  // devicePixelRatio. A capped dpr keeps a point constant in CSS pixels while
  // the artwork keeps growing with the framebuffer, which makes particles look
  // proportionally tiny on tall or high-DPI displays.
  gl_PointSize = clamp(u_size * aSize * tw * u_resScale * sizeScale * (10.0 / depthEye),
                       0.0, 24.0 * u_resScale);
  if (gain <= 0.0) gl_PointSize = 0.0;
  gl_Position = u_proj * mv;
}`;

const PARTICLE_FRAG = `#version 300 es
precision highp float;
in vec3 vCol;
in float vA;
out vec4 outColor;
void main() {
  vec2 u = gl_PointCoord - 0.5;
  float r2 = dot(u, u);
  if (r2 > 0.25) discard;
  float g = exp(-r2 * 10.0) * (1.0 - r2 * 4.0);
  float a = g * vA;
  if (a <= 0.002) discard;
  outColor = vec4(vCol * a * 1.15, a);
}`;

// ─── Shell: the solid metallic ring ──────────────────────────────────────────

const SHELL_VERT = `#version 300 es
precision highp float;
${COMMON}

in vec3 aPos;
in vec3 aNormal;
in vec4 iPosScale;
in vec4 iQuat;
in float iDepth;

uniform mat4  u_viewProj;
uniform float u_profile;
uniform vec3  u_torusByDepth[4];

out vec3 vNormal;
out vec3 vWorld;
out vec3 vBase;

void main() {
  vec3 local = deform(aPos, u_profile);
  // The profile scale is non-uniform, so the normal takes the inverse
  // transpose — dividing z by the same factor the position multiplied by.
  vec3 n = vec3(aNormal.x, aNormal.y, aNormal.z / max(u_profile, 1e-5));

  vec3 p = qrot(iQuat, local * iPosScale.w) + iPosScale.xyz;
  vNormal = normalize(qrot(iQuat, n));
  vWorld = p;
  vBase = u_torusByDepth[int(clamp(iDepth, 0.0, 3.0))];
  gl_Position = u_viewProj * vec4(p, 1.0);
}`;

const SHELL_FRAG = `#version 300 es
precision highp float;

uniform vec3  u_camPos;
uniform vec3  u_lightDir;
uniform vec3  u_envLow, u_envMid, u_envHigh, u_envKey;
uniform vec3  u_emissiveColor;
uniform float u_metalness, u_roughness, u_envIntensity;
uniform float u_emissiveStrength, u_opacity, u_audioEmissive;

in vec3 vNormal;
in vec3 vWorld;
in vec3 vBase;
out vec4 outColor;

// Analytic stand-in for a prefiltered environment map: a vertical gradient plus
// two soft key lobes. Costs nothing to load and stays tunable from the palette,
// which matters more here than physical accuracy.
vec3 envColor(vec3 d) {
  float t = d.z * 0.5 + 0.5;
  vec3 c = mix(u_envLow, u_envMid, smoothstep(0.0, 0.55, t));
  c = mix(c, u_envHigh, smoothstep(0.5, 1.0, t));
  c += u_envKey * pow(max(dot(d, u_lightDir), 0.0), 8.0);
  return c;
}

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(u_camPos - vWorld);
  if (dot(N, V) < 0.0) N = -N;           // rings are viewed from both sides
  vec3 R = reflect(-V, N);
  float NdotV = max(dot(N, V), 1e-3);

  vec3 F0 = mix(vec3(0.04), vBase, u_metalness);
  vec3 F = F0 + (1.0 - F0) * pow(1.0 - NdotV, 5.0);

  // Roughness fades the mirror direction toward the normal direction, which is
  // the cheap approximation of widening the specular lobe.
  vec3 spec = mix(envColor(R), envColor(N), u_roughness) * F * u_envIntensity;
  vec3 diff = vBase * (1.0 - u_metalness) * envColor(N) * 0.35;
  vec3 emis = u_emissiveColor * (u_emissiveStrength + u_audioEmissive);

  outColor = vec4(spec + diff + emis, u_opacity);
}`;

// ─── Post-processing ─────────────────────────────────────────────────────────

const QUAD_VERT = `#version 300 es
precision highp float;
in vec2 a_pos;
out vec2 vUv;
void main() {
  vUv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const BRIGHT_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
uniform float u_threshold, u_knee;
in vec2 vUv;
out vec4 outColor;
void main() {
  vec3 c = texture(u_tex, vUv).rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  // A soft knee keeps the bloom from popping on as the level crosses threshold.
  float w = smoothstep(u_threshold, u_threshold + max(u_knee, 1e-4), l);
  outColor = vec4(c * w, 1.0);
}`;

const BLUR_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
uniform vec2 u_direction;    // texel-sized step, horizontal or vertical
in vec2 vUv;
out vec4 outColor;
void main() {
  // 9-tap gaussian collapsed to 5 bilinear fetches.
  float w0 = 0.2270270270;
  float w1 = 0.3162162162;
  float w2 = 0.0702702703;
  vec2 o1 = u_direction * 1.3846153846;
  vec2 o2 = u_direction * 3.2307692308;
  vec3 c = texture(u_tex, vUv).rgb * w0;
  c += texture(u_tex, vUv + o1).rgb * w1;
  c += texture(u_tex, vUv - o1).rgb * w1;
  c += texture(u_tex, vUv + o2).rgb * w2;
  c += texture(u_tex, vUv - o2).rgb * w2;
  outColor = vec4(c, 1.0);
}`;

const COMPOSITE_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_scene;
uniform sampler2D u_bloom;
uniform float u_bloomStrength, u_exposure, u_vignette;
in vec2 vUv;
out vec4 outColor;

// Narkowicz ACES approximation — the filmic shoulder is what stops the bright
// fiber cores from clipping to flat white where they cross.
vec3 aces(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

void main() {
  vec3 c = texture(u_scene, vUv).rgb + texture(u_bloom, vUv).rgb * u_bloomStrength;
  c = aces(c * u_exposure);
  vec2 q = (vUv - 0.5) * 2.0;
  float vig = 1.0 - u_vignette * dot(q, q) * 0.42;
  outColor = vec4(c * clamp(vig, 0.0, 1.0), 1.0);
}`;

/* ── js/torus-render.js ── */
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

/** Every params key that feeds the colour ramps. */
const COLOR_KEYS = Object.keys(PALETTE);

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

function createTorusRenderer(gl, opts = {}) {
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
    cameraDistance: 8.4,
    // Colours live in params rather than as module constants so a preset can
    // carry a whole look, not just a shape. Changing one rebuilds the depth
    // ramps; see `configure`.
    ...PALETTE
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
    holeRatio: params.holeRatio,
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
    if (loc < 0) return null;
    const buf = gl.createBuffer();
    ownedBuffers.push(buf);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    return buf;
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
    const posBuf = staticAttrib(programs.shell, 'aPos', mesh.pos, 3);
    const nrmBuf = staticAttrib(programs.shell, 'aNormal', mesh.nrm, 3);
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
      instances: ranges[Math.min(SHELL_MAX_DEPTH, ranges.length - 1)][1],
      posBuf, nrmBuf,
      segs: [isMobile ? 40 : 56, isMobile ? 12 : 16]
    };
  }

  /**
   * Refresh the ring mesh for a new aperture. The segment counts are unchanged,
   * so the existing buffers are overwritten rather than the whole VAO set being
   * torn down — which is what lets the aperture be dragged, or morphed between
   * presets, without rebuilding the world every frame.
   */
  function refreshShellMesh() {
    if (!shell || !shell.posBuf) return;
    const tp = torusParams(params.holeRatio);
    const mesh = torusMesh(tp.major, tp.minor, tp.axial, shell.segs[0], shell.segs[1]);
    gl.bindBuffer(gl.ARRAY_BUFFER, shell.posBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, mesh.pos);
    gl.bindBuffer(gl.ARRAY_BUFFER, shell.nrmBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, mesh.nrm);
  }

  rebuild();

  // ── colour ramps ──
  // Derived from the colour params; rebuilt whenever one of them changes.
  let plusRamp, minusRamp, shellRamp;
  let sheenRgb, emissiveRgb, bgRgb, envLow, envMid, envHigh, envKey;

  function rebuildPalette() {
    plusRamp = depthRamp(params.plus, params.levels, { hueStep: -0.0025, satFade: 0.015, lightFade: 0.16 });
    minusRamp = depthRamp(params.minus, params.levels, { hueStep: 0.0025, satFade: 0.015, lightFade: 0.16 });
    shellRamp = depthRamp(params.shell, params.levels, { hueStep: -0.0015, satFade: 0.01, lightFade: 0.12 });
    sheenRgb = hexToRgb(params.sheen);
    emissiveRgb = hexToRgb(params.emissive);
    bgRgb = hexToRgb(params.background);
    envLow = hexToRgb(params.envLow);
    envMid = hexToRgb(params.envMid);
    envHigh = hexToRgb(params.envHigh);
    envKey = hexToRgb(params.envKey);
  }
  rebuildPalette();

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

    // ── shells. Opaque and depth-written, they hide the far half of the
    //    structure, which is what makes the piece read as a solid object rather
    //    than a wireframe. The fibers lie exactly on this surface, so the rings
    //    are pushed back a touch in depth to let the fibers win the coplanar
    //    comparison instead of z-fighting with it.
    //
    //    Below full opacity the depth write is dropped as well, otherwise the
    //    ring would still occlude everything behind it and the transparency
    //    would be invisible — which is what shellOpacity used to do, since
    //    blending was off and the alpha it wrote went nowhere.
    const shellOpaque = params.shellOpacity >= 0.999;
    gl.depthMask(shellOpaque);
    if (shellOpaque) {
      gl.disable(gl.BLEND);
    } else {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    }
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
    gl.depthMask(true);
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

    /**
     * Apply a parameter patch.
     *
     * Only `m`, `levels` and `nodeBudget` change how many nodes and vertices
     * exist, so only those force the VAOs to be rebuilt. `delta`, `aFill` and
     * `holeRatio` merely feed the per-frame node builder — they used to trigger
     * a full rebuild too, which made them stutter under a slider and ruled out
     * morphing between presets.
     */
    configure(patch) {
      const changed = (k) => k in patch && patch[k] !== params[k];
      const needsRebuild = ['m', 'levels', 'nodeBudget'].some(changed);
      const needsShellMesh = changed('holeRatio');
      const needsBuilder = needsRebuild || ['delta', 'aFill', 'holeRatio'].some(changed);
      const needsPalette = needsRebuild || COLOR_KEYS.some((k) => k in patch);

      Object.assign(params, patch);

      if (needsBuilder) {
        builder.configure({
          m: params.m, levels: params.levels, delta: params.delta,
          aFill: params.aFill, holeRatio: params.holeRatio, nodeBudget: params.nodeBudget
        });
      }
      if (needsRebuild) rebuild();
      else if (needsShellMesh) refreshShellMesh();
      if (needsPalette) rebuildPalette();
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

/* ── torus/main.js ── */
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




// ─── App module wrapper ──────────────────────────────────────────────────────
export function initTorus(canvas, getBins) {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance' });
  if (!gl) throw new Error('torus: no webgl2');
  if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('torus: no float targets');
  const isMobile = matchMedia('(max-width: 780px)').matches;
  const renderer = createTorusRenderer(gl, { mobile: isMobile });

  let rafId = null;
  let last = performance.now();
  const fallback = new Float32Array(BINS);

  let resized = false;
  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; resized = true; }
  }
  let lastData = fallback;
  let frozenDrawn = false;
  function frame(now) {
    rafId = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (document.visibilityState !== 'visible') return;
    resize();
    // getBins() returning null means "not playing". The torus advances on dt alone
    // (audio only scales the rate), so we hand it dt = 0 to hold the current pose
    // instead of drifting at base speed while the track is paused. updateAudio's
    // smoothing is also dt-scaled, so the audio envelope freezes with it.
    let data = null;
    try { const b = getBins && getBins(); if (b && b.length >= BINS) data = b; } catch (_) {}
    const playing = data !== null;
    if (playing) lastData = data;
    // While frozen the output is identical every frame, so draw once and then idle
    // until playback resumes or the canvas is resized (fullscreen, rotation).
    if (!playing && frozenDrawn && !resized) return;
    resized = false;
    frozenDrawn = !playing;
    renderer.render(playing ? data : lastData, playing ? dt : 0, canvas.width, canvas.height);
  }
  return {
    // frozenDrawn resets so a re-shown canvas always repaints at least once —
    // the drawing buffer is not preserved across compositing.
    start() { frozenDrawn = false; if (rafId == null) { last = performance.now(); rafId = requestAnimationFrame(frame); } },
    stop()  { if (rafId != null) { cancelAnimationFrame(rafId); rafId = null; } },
    resize, renderer,
    destroy() { if (rafId != null) cancelAnimationFrame(rafId); rafId = null; },
  };
}
