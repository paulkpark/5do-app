import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hannWindow, logBinEdges, binMagnitudes, normalizePeak, quantizeFrame } from '../scripts/lib/fft-bake-core.mjs';

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

test('logBinEdges: returns N+1 edges for N bins', () => {
  const edges = logBinEdges({ bins: 32, fMin: 20, fMax: 11025 });
  assert.equal(edges.length, 33);
});

test('logBinEdges: first edge equals fMin, last equals fMax', () => {
  const edges = logBinEdges({ bins: 32, fMin: 20, fMax: 11025 });
  assert.equal(edges[0], 20);
  assert.equal(edges[32], 11025);
});

test('logBinEdges: edges increase monotonically', () => {
  const edges = logBinEdges({ bins: 32, fMin: 20, fMax: 11025 });
  for (let i = 1; i < edges.length; i++) {
    assert.ok(edges[i] > edges[i - 1], `non-monotonic at index ${i}: ${edges[i-1]} -> ${edges[i]}`);
  }
});

test('logBinEdges: log-spaced (ratio between consecutive edges is constant)', () => {
  const edges = logBinEdges({ bins: 32, fMin: 20, fMax: 11025 });
  const ratio = edges[1] / edges[0];
  for (let i = 2; i < edges.length; i++) {
    const r = edges[i] / edges[i - 1];
    assert.ok(Math.abs(r - ratio) < 1e-6, `non-log-spaced at index ${i}: ratio ${r} vs ${ratio}`);
  }
});

test('binMagnitudes: assigns FFT bins to log buckets', () => {
  const sampleRate = 22050;
  const fftSize = 2048;
  const numFftBins = fftSize / 2;
  const magnitudes = new Float32Array(numFftBins);
  const targetIdx = Math.round((440 / sampleRate) * fftSize);
  magnitudes[targetIdx] = 1.0;

  const edges = logBinEdges({ bins: 32, fMin: 20, fMax: 11025 });
  const bins = binMagnitudes(magnitudes, edges, sampleRate, fftSize);

  assert.equal(bins.length, 32);
  let activeBin = -1;
  for (let i = 0; i < bins.length; i++) {
    if (bins[i] > 0.01) { activeBin = i; break; }
  }
  assert.ok(activeBin >= 0, 'no bin has nonzero magnitude');
  assert.ok(edges[activeBin] <= 440 && 440 <= edges[activeBin + 1],
    `440 Hz not in bin ${activeBin} (edges ${edges[activeBin]}..${edges[activeBin+1]})`);
});

test('binMagnitudes: empty input → all zeros', () => {
  const magnitudes = new Float32Array(1024);
  const edges = logBinEdges({ bins: 32, fMin: 20, fMax: 11025 });
  const bins = binMagnitudes(magnitudes, edges, 22050, 2048);
  for (const b of bins) assert.equal(b, 0);
});

test('normalizePeak: scales the largest value to 1.0', () => {
  const frames = [new Float32Array([0.2, 0.4, 0.8]), new Float32Array([0.1, 0.5, 0.3])];
  const peak = normalizePeak(frames);
  assert.ok(Math.abs(peak - 0.8) < 1e-6);
  assert.ok(Math.abs(frames[0][2] - 1.0) < 1e-6);
  assert.ok(Math.abs(frames[1][1] - (0.5 / 0.8)) < 1e-6);
});

test('normalizePeak: silent input returns 0 and leaves frames untouched', () => {
  const frames = [new Float32Array([0, 0, 0])];
  const peak = normalizePeak(frames);
  assert.equal(peak, 0);
  assert.equal(frames[0][0], 0);
});

test('quantizeFrame: maps 0..1 to 0..255 ints', () => {
  const frame = new Float32Array([0, 0.5, 1.0]);
  const q = quantizeFrame(frame);
  assert.equal(q[0], 0);
  assert.equal(q[1], 128);
  assert.equal(q[2], 255);
  assert.ok(q instanceof Uint8Array);
});

test('quantizeFrame: clamps out-of-range values', () => {
  const frame = new Float32Array([-0.5, 1.5]);
  const q = quantizeFrame(frame);
  assert.equal(q[0], 0);
  assert.equal(q[1], 255);
});
