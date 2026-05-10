import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dequantizeFrame, sampleAtTime, proceduralFrame } from '../public/js/cymatics-loader.js';

test('dequantizeFrame: maps 0..255 → 0..1 Float32Array', () => {
  const out = dequantizeFrame([0, 128, 255]);
  assert.ok(out instanceof Float32Array);
  assert.equal(out[0], 0);
  assert.ok(Math.abs(out[1] - 128 / 255) < 1e-6);
  assert.equal(out[2], 1);
});

test('sampleAtTime: returns first frame at t=0', () => {
  const sidecar = {
    fps: 30,
    bins: 4,
    duration: 1,
    frames: [[10, 20, 30, 40], [50, 60, 70, 80]]
  };
  const out = sampleAtTime(sidecar, 0);
  assert.ok(Math.abs(out[0] - 10/255) < 1e-6);
});

test('sampleAtTime: linearly interpolates between adjacent frames', () => {
  const sidecar = {
    fps: 30,
    bins: 4,
    duration: 1,
    frames: [[0,0,0,0], [255,255,255,255]]
  };
  const out = sampleAtTime(sidecar, 0.5 / 30);
  assert.ok(Math.abs(out[0] - 0.5) < 0.01, `expected ~0.5 got ${out[0]}`);
});

test('sampleAtTime: clamps to last frame when t exceeds duration', () => {
  const sidecar = {
    fps: 30,
    bins: 4,
    duration: 0.1,
    frames: [[10, 10, 10, 10], [20, 20, 20, 20]]
  };
  const out = sampleAtTime(sidecar, 5);
  assert.ok(Math.abs(out[0] - 20/255) < 1e-6);
});

test('sampleAtTime: returns zeros for empty sidecar', () => {
  const sidecar = { fps: 30, bins: 4, duration: 0, frames: [] };
  const out = sampleAtTime(sidecar, 0);
  for (const v of out) assert.equal(v, 0);
});

test('proceduralFrame: returns Float32Array of length bins', () => {
  const out = proceduralFrame({ timeSec: 0, duration: 60, bins: 32 });
  assert.equal(out.length, 32);
  assert.ok(out instanceof Float32Array);
});

test('proceduralFrame: values stay in 0..1', () => {
  for (let t = 0; t < 60; t += 0.13) {
    const out = proceduralFrame({ timeSec: t, duration: 60, bins: 32 });
    for (const v of out) {
      assert.ok(v >= 0 && v <= 1, `out of range ${v} at t=${t}`);
    }
  }
});

test('proceduralFrame: changes over time (not constant)', () => {
  const a = proceduralFrame({ timeSec: 0, duration: 60, bins: 32 });
  const b = proceduralFrame({ timeSec: 1.5, duration: 60, bins: 32 });
  let differs = false;
  for (let i = 0; i < 32; i++) if (Math.abs(a[i] - b[i]) > 0.01) { differs = true; break; }
  assert.ok(differs, 'procedural sim is not animating');
});
