import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hannWindow } from '../scripts/lib/fft-bake-core.mjs';

test('hannWindow: length matches input', () => {
  const w = hannWindow(8);
  assert.equal(w.length, 8);
});

test('hannWindow: edges are zero', () => {
  const w = hannWindow(16);
  assert.ok(Math.abs(w[0]) < 1e-9, `expected 0 at start, got ${w[0]}`);
  assert.ok(Math.abs(w[15]) < 1e-9, `expected 0 at end, got ${w[15]}`);
});

test('hannWindow: middle is approximately 1', () => {
  const w = hannWindow(16);
  assert.ok(w[8] > 0.98, `expected near 1 at middle, got ${w[8]}`);
});
