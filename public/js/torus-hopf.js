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

export const SILVER = 1 + Math.SQRT2;
export const TAU = Math.PI * 2;

/** holeRatio that reproduces the Clifford torus (R = √2, r = 1). */
export const CLIFFORD_HOLE_RATIO = (Math.SQRT2 - 1) * (Math.SQRT2 - 1);

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/**
 * Derived torus quantities for a given hole ratio.
 *   K, C     — the two shader uniforms (uC, uGeom)
 *   major    — center-line radius of the tube
 *   minor    — radial semi-axis of the tube cross-section
 *   axial    — axial semi-axis (equals `minor` only at the Clifford ratio)
 */
export function torusParams(holeRatio = CLIFFORD_HOLE_RATIO) {
  const h = clamp(Number.isFinite(holeRatio) ? holeRatio : CLIFFORD_HOLE_RATIO, 0.005, 0.9);
  const K = (1 + h) / (1 - h);
  const C = SILVER * (K - 1);
  const major = (SILVER * (1 + h)) / 2;
  const minor = (SILVER * (1 - h)) / 2;
  const axial = minor * ((2 * Math.sqrt(h)) / (1 - h));
  return { h, K, C, major, minor, axial };
}

/** P(u,v) on the projected torus. Writes into `out` (length ≥ 3). */
export function torusPoint(u, v, K, C, out) {
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
export function circleThrough(p0, p1, p2) {
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
export function distanceToCircle(px, py, pz, c) {
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
export function fiberCircles({ m, K, C, delta, depth, alpha }) {
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
export function childFrames({ m, K, C, delta, depth, alpha, aFill, out = null }) {
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
export function buildNodes({
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
export function nodeBounds(nodes, profile = 1) {
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
export function createNodeBuilder(config = {}) {
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
export function wrapAlpha(alpha, m) {
  const period = TAU / Math.max(2, Math.round(m));
  return ((alpha % period) + period) % period;
}
