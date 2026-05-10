import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dequantizeFrame, sampleAtTime } from '../public/js/cymatics-loader.js';

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
