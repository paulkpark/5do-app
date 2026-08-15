import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SILVER,
  TAU,
  CLIFFORD_HOLE_RATIO,
  torusParams,
  torusPoint,
  circleThrough,
  distanceToCircle,
  fiberCircles,
  childFrames,
  buildNodes,
  nodeBounds,
  wrapAlpha
} from '../public/js/torus-hopf.js';

const near = (a, b, eps = 1e-9) =>
  assert.ok(Math.abs(a - b) < eps, `expected ${a} ≈ ${b} (Δ=${Math.abs(a - b)})`);

test('the default hole ratio reproduces the Clifford torus', () => {
  const p = torusParams(CLIFFORD_HOLE_RATIO);
  near(p.K, Math.SQRT2, 1e-12);
  near(p.C, 1, 1e-12);          // SILVER · (√2 − 1) = 1 exactly
  near(p.major, Math.SQRT2, 1e-12);
  near(p.minor, 1, 1e-12);
  near(p.axial, 1, 1e-12);      // circular cross-section only at this ratio
  near(p.major + p.minor, SILVER, 1e-12);
});

test('the tube stays between the inner and outer radii', () => {
  const { K, C, major, minor } = torusParams(CLIFFORD_HOLE_RATIO);
  const out = [0, 0, 0];
  for (let i = 0; i < 64; i++) {
    for (let j = 0; j < 64; j++) {
      torusPoint((TAU * i) / 64, (TAU * j) / 64, K, C, out);
      const rho = Math.hypot(out[0], out[1]);
      // distance from the tube center-line circle of radius `major`
      const d = Math.hypot(rho - major, out[2]);
      near(d, minor, 1e-9);
    }
  }
});

test('circleThrough recovers a known circle', () => {
  const c = circleThrough([2, 0, 5], [0, 2, 5], [-2, 0, 5]);
  near(c.cx, 0, 1e-12);
  near(c.cy, 0, 1e-12);
  near(c.cz, 5, 1e-12);
  near(c.r, 2, 1e-12);
  near(Math.abs(c.nz), 1, 1e-12);
});

test('circleThrough rejects collinear points', () => {
  assert.equal(circleThrough([0, 0, 0], [1, 1, 1], [2, 2, 2]), null);
});

test('fibers are exact circles — every sampled point lies on the fitted circle', () => {
  const m = 6;
  const { K, C } = torusParams(CLIFFORD_HOLE_RATIO);
  const circles = fiberCircles({ m, K, C, delta: 0.04, depth: 1, alpha: 0.31 });
  assert.equal(circles.length, 2 * m);

  const P = [0, 0, 0];
  for (const c of circles) {
    const off = c.chir > 0
      ? (TAU * c.index) / m + 1 * 0.04 + 0.31
      : (TAU * c.index) / m - 1 * 0.04 - 0.31;
    for (let s = 0; s < 32; s++) {
      const t = (TAU * s) / 32;
      if (c.chir > 0) torusPoint(t + off, t, K, C, P);
      else torusPoint(off - t, t, K, C, P);
      // Zero distance to the circle == the point is on it.
      near(distanceToCircle(P[0], P[1], P[2], c), 0, 1e-9);
    }
  }
});

test('fibers satisfy the two defining Villarceau properties', () => {
  const m = 6;
  const { K, C, major, minor } = torusParams(CLIFFORD_HOLE_RATIO);
  const circles = fiberCircles({ m, K, C, delta: 0, depth: 0, alpha: 0 });
  assert.equal(circles.filter((c) => c.chir > 0).length, m);
  assert.equal(circles.filter((c) => c.chir < 0).length, m);

  for (const c of circles) {
    // A Villarceau circle's radius equals the torus major radius…
    near(c.r, major, 1e-9);
    // …and its center sits at exactly the minor radius from the torus center.
    near(Math.hypot(c.cx, c.cy, c.cz), minor, 1e-9);
  }
});

test('the two chiralities are distinct, non-coincident families', () => {
  const m = 6;
  const { K, C } = torusParams(CLIFFORD_HOLE_RATIO);
  const circles = fiberCircles({ m, K, C, delta: 0, depth: 0, alpha: 0 });
  const seen = new Set();
  for (const c of circles) {
    // Orient each plane consistently so a circle and its mirror do not alias.
    const s = c.nz < 0 || (c.nz === 0 && c.nx < 0) ? -1 : 1;
    seen.add([c.cx, c.cy, c.cz, s * c.nx, s * c.ny, s * c.nz]
      .map((v) => v.toFixed(6)).join(','));
  }
  assert.equal(seen.size, 2 * m, 'every fiber must be a distinct circle');

  // The paired ± circles share a plane orientation but are offset apart, which
  // is precisely how counter-rotating them produces two interlocked currents.
  const plus0 = circles.find((c) => c.chir > 0 && c.index === 0);
  const minus0 = circles.find((c) => c.chir < 0 && c.index === 0);
  const dot = plus0.nx * minus0.nx + plus0.ny * minus0.ny + plus0.nz * minus0.nz;
  near(Math.abs(dot), 1, 1e-9);
  assert.ok(
    Math.hypot(plus0.cx - minus0.cx, plus0.cy - minus0.cy, plus0.cz - minus0.cz) > 1e-6,
    'the paired circles must not be coincident'
  );
});

test('child frames sit in the interstices, never on a fiber', () => {
  const m = 6;
  const { K, C } = torusParams(CLIFFORD_HOLE_RATIO);
  const f = childFrames({ m, K, C, delta: 0.04, depth: 0, alpha: 0.2, aFill: 0.84 });

  assert.equal(f.count, 2 * m * m);
  for (let i = 0; i < f.count; i++) {
    assert.ok(f.gap[i] > 1e-6, `gap[${i}] collapsed to ${f.gap[i]} — node landed on a fiber`);
  }
  // Orientation frames must be unit quaternions.
  for (let i = 0; i < f.count; i++) {
    const o = i * 4;
    near(Math.hypot(f.quat[o], f.quat[o + 1], f.quat[o + 2], f.quat[o + 3]), 1, 1e-6);
  }
});

test('child frames lie on the torus surface', () => {
  const m = 5;
  const { K, C, major, minor } = torusParams(CLIFFORD_HOLE_RATIO);
  const f = childFrames({ m, K, C, delta: 0, depth: 0, alpha: 0, aFill: 0.84 });
  for (let i = 0; i < f.count; i++) {
    const x = f.pos[i * 3], y = f.pos[i * 3 + 1], z = f.pos[i * 3 + 2];
    // Positions live in a Float32Array for direct GPU upload, so ~1e-7 is the
    // available precision here — this checks the geometry, not the storage.
    near(Math.hypot(Math.hypot(x, y) - major, z), minor, 1e-5);
  }
});

test('buildNodes expands 2m² children per level and keeps scales shrinking', () => {
  const m = 4;
  const nodes = buildNodes({ m, levels: 1, nodeBudget: 10_000 });
  assert.equal(nodes.count, 1 + 2 * m * m);
  assert.deepEqual(nodes.ranges[0], [0, 1]);
  assert.deepEqual(nodes.ranges[1], [1, nodes.count]);

  near(nodes.posScale[3], 1, 1e-12);
  for (let i = 1; i < nodes.count; i++) {
    const s = nodes.posScale[i * 4 + 3];
    assert.ok(s > 0 && s < 1, `child ${i} scale ${s} out of range`);
    assert.equal(nodes.depth[i], 1);
    const o = i * 4;
    near(Math.hypot(nodes.quat[o], nodes.quat[o + 1], nodes.quat[o + 2], nodes.quat[o + 3]), 1, 1e-5);
  }
});

test('children stay inside the parent bounding radius', () => {
  const nodes = buildNodes({ m: 6, levels: 2, nodeBudget: 4000 });
  const { bounding } = nodeBounds(nodes);
  for (let i = 0; i < nodes.count; i++) {
    const o = i * 4;
    const reach = Math.hypot(nodes.posScale[o], nodes.posScale[o + 1], nodes.posScale[o + 2])
      + nodes.posScale[o + 3] * SILVER;
    assert.ok(reach <= bounding + 1e-6, `node ${i} escapes the bounds (${reach} > ${bounding})`);
  }
});

test('nodeBudget truncates instead of overflowing', () => {
  const nodes = buildNodes({ m: 6, levels: 2, nodeBudget: 200 });
  assert.equal(nodes.count, 200);
  assert.equal(nodes.truncated, true);
  assert.equal(nodes.posScale.length, 200 * 4);
});

test('levels: 0 yields the root ring alone', () => {
  const nodes = buildNodes({ m: 6, levels: 0 });
  assert.equal(nodes.count, 1);
  assert.equal(nodes.ranges.length, 1);
});

test('alpha wraps at 2π/m so the flow loops seamlessly', () => {
  const m = 6;
  const period = TAU / m;
  near(wrapAlpha(period, m), 0, 1e-12);
  near(wrapAlpha(period * 3 + 0.25, m), 0.25, 1e-12);
  near(wrapAlpha(-0.1, m), period - 0.1, 1e-12);

  // The structure at alpha and alpha+period must be identical.
  const a = buildNodes({ m, levels: 1, alpha: 0.17, nodeBudget: 5000 });
  const b = buildNodes({ m, levels: 1, alpha: 0.17 + period, nodeBudget: 5000 });
  assert.equal(a.count, b.count);
  const sortKey = (buf, i) => `${buf[i * 4].toFixed(6)},${buf[i * 4 + 1].toFixed(6)},${buf[i * 4 + 2].toFixed(6)}`;
  const setA = new Set();
  const setB = new Set();
  for (let i = 0; i < a.count; i++) {
    setA.add(sortKey(a.posScale, i));
    setB.add(sortKey(b.posScale, i));
  }
  assert.deepEqual([...setA].sort(), [...setB].sort());
});

test('hole ratio drives the aperture monotonically', () => {
  const small = torusParams(0.05);
  const large = torusParams(0.6);
  const innerSmall = small.major - small.minor;
  const innerLarge = large.major - large.minor;
  assert.ok(innerLarge > innerSmall, 'a larger hole ratio must open the aperture');
  near(innerSmall / (small.major + small.minor), 0.05, 1e-12);
  near(innerLarge / (large.major + large.minor), 0.6, 1e-12);
});

test('createNodeBuilder reuses buffers across frames', async () => {
  const { createNodeBuilder } = await import('../public/js/torus-hopf.js');
  const b = createNodeBuilder({ m: 6, levels: 1, nodeBudget: 500 });

  const a = b.update(0.0);
  const posRef = a.posScale;
  const countRef = a.count;

  const c = b.update(0.3);
  assert.equal(c.posScale, posRef, 'position buffer must be reused, not reallocated');
  assert.equal(c.count, countRef);

  // The light vector must be unit length in every node's local frame.
  for (let i = 0; i < c.count; i++) {
    near(Math.hypot(c.light[i * 3], c.light[i * 3 + 1], c.light[i * 3 + 2]), 1, 1e-5);
  }

  // The root frame is the identity, so its local light equals the world light.
  b.setLightDir(0, 0, 2);
  const d = b.update(0.3);
  near(d.light[0], 0, 1e-6);
  near(d.light[1], 0, 1e-6);
  near(d.light[2], 1, 1e-6);
});

test('rebuilding at the same alpha is deterministic', async () => {
  const { createNodeBuilder } = await import('../public/js/torus-hopf.js');
  const b = createNodeBuilder({ m: 5, levels: 2, nodeBudget: 600 });
  const first = Float32Array.from(b.update(0.42).posScale);
  b.update(1.1);
  const again = b.update(0.42).posScale;
  assert.deepEqual(Array.from(again), Array.from(first));
});

test('negative alpha runs the flow backwards, not sideways', () => {
  const m = 6;
  const step = 0.01;
  const base = 0.4;

  const at = (a) => buildNodes({ m, levels: 1, alpha: a, nodeBudget: 5000 });
  const here = at(base);
  const ahead = at(base + step);
  const behind = at(base - step);

  assert.equal(here.count, ahead.count);
  assert.equal(here.count, behind.count);

  // For every node, stepping alpha forward and backward must displace it in
  // opposite directions. Reversal that merely reshuffled the structure — or
  // that moved nodes along some other axis — would fail this.
  let checked = 0;
  for (let i = 1; i < here.count; i++) {
    const o = i * 4;
    const f = [
      ahead.posScale[o] - here.posScale[o],
      ahead.posScale[o + 1] - here.posScale[o + 1],
      ahead.posScale[o + 2] - here.posScale[o + 2]
    ];
    const b = [
      behind.posScale[o] - here.posScale[o],
      behind.posScale[o + 1] - here.posScale[o + 1],
      behind.posScale[o + 2] - here.posScale[o + 2]
    ];
    const fl = Math.hypot(...f);
    const bl = Math.hypot(...b);
    if (fl < 1e-5 || bl < 1e-5) continue;      // a node momentarily at rest

    const cos = (f[0] * b[0] + f[1] * b[1] + f[2] * b[2]) / (fl * bl);
    assert.ok(cos < -0.98, `node ${i} does not reverse (cos = ${cos.toFixed(4)})`);
    checked++;
  }
  assert.ok(checked > 50, `only ${checked} nodes actually moved; the test proved nothing`);
});

test('negative alpha is a valid structure, not a degenerate one', () => {
  const nodes = buildNodes({ m: 6, levels: 2, alpha: -1.7, nodeBudget: 2000 });
  assert.ok(nodes.count > 1);
  for (let i = 0; i < nodes.count; i++) {
    const o = i * 4;
    for (let k = 0; k < 4; k++) {
      assert.ok(Number.isFinite(nodes.posScale[o + k]), `node ${i} component ${k} is not finite`);
    }
    assert.ok(nodes.posScale[o + 3] > 0, `node ${i} has non-positive scale`);
  }
});
