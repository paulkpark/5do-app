# Cymatics WebGL Visualizer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a toggle-able WebGL Cymatics visualizer to the 5DO track player, driven by pre-baked FFT sidecars so iOS keeps native background playback.

**Architecture:** Single fragment shader with 4 pattern modes (Chladni / Mandala / Liquid / Particle). Client reads pre-baked `<track>.fft.json` sidecars per audio frame; falls back to real-time `AnalyserNode` (desktop/Android) or procedural simulation (iOS) when sidecar is absent. Bake pipeline is a standalone Node CLI run during track production. Small mode replaces thumbnail; fullscreen is paid-tier only.

**Tech Stack:** WebGL2 (WebGL1 fallback), GLSL ES 3.00, plain JS modules with `<script type="module">` (matches `package.json` `"type": "module"`), `fft.js` + `ffmpeg-static` (Node devDeps for bake script), built-in `node --test` runner, Supabase media bucket for sidecar hosting.

**Spec:** `docs/superpowers/specs/2026-05-10-cymatics-visualizer-design.md` (commit `d719f9f`)

---

## Project Conventions to Honor

- **No build step.** All client code is loaded as plain `<script>` or `<script type="module">` tags. Never introduce a bundler.
- **`5do.html` is a god file (~4400 LOC).** Keep additions minimal — push logic to new `public/js/cymatics-*.js` modules.
- **Existing pattern**: client-side modules attach to `window.*` globals (e.g., `window.SUB`). Cymatics modules will export ES6 modules instead — this is a measured departure justified by the size of the code (use `<script type="module">` so no bundler needed).
- **Never connect main `<audio>` to Web Audio.** This breaks iOS background playback. The existing side-spectrum's `_vizConnectAudio()` already skips iOS (`5do.html:1154`); preserve that.
- **Korean and English strings**: text-bearing UI must use `data-i18n` attribute and the `I18N` object in `i18n.js`. Add new keys.

## File Structure

### New files

| Path | Responsibility | Approx LOC |
|---|---|---|
| `scripts/lib/fft-bake-core.mjs` | Pure FFT bake algorithm (windowing, FFT, log-binning, quantization). Node-only. Pure functions only — no I/O. | ~100 |
| `scripts/bake-fft.js` | Node CLI wrapper. Decodes audio via ffmpeg-static, calls fft-bake-core, writes JSON. Single-file and batch modes. | ~140 |
| `tests/fft-bake-core.test.mjs` | Node test for fft-bake-core (deterministic, synthetic input). | ~80 |
| `tests/bake-fft-cli.test.mjs` | Node test for CLI (uses tiny WAV fixture). | ~60 |
| `tests/fixtures/sine_440_2s.wav` | Test fixture: 2-second 440Hz sine at 22050Hz mono. Generated once via Node script, committed. | binary |
| `public/js/cymatics-patterns.js` | ES module: pattern presets (4 entries), category→pattern default map, `lookupPattern()` precedence resolver. | ~110 |
| `public/js/cymatics-shaders.js` | ES module: vertex + fragment GLSL strings as exports. | ~280 |
| `public/js/cymatics-loader.js` | ES module: sidecar fetcher + sampler + fallback router (sidecar / AnalyserNode / procedural sim). | ~200 |
| `public/js/cymatics.js` | ES module: main API (`init`, `attach`, `loadTrack`, `setEnabled`, `setStyle`, `enterFullscreen`, `exitFullscreen`). RAF loop, WebGL setup, FFT texture upload, fullscreen orchestration. | ~450 |
| `tests/cymatics-patterns.test.mjs` | Node test: patterns module is pure ESM, importable directly. | ~80 |
| `tests/cymatics-loader.test.mjs` | Node test: pure logic (dequantize, sample interpolation) extracted to testable functions. | ~80 |
| `tests/manual/cymatics-smoke.html` | Standalone test page: mock player, all 4 patterns visible, sidecar URL switcher, fullscreen exerciser. | ~180 |

### Modified files

| Path | Change |
|---|---|
| `public/5do.html` | Add `<canvas id="cymatics">` inside `.thumb-viz-wrap`, toggle/style/fullscreen UI, `<script type="module">` boot wiring |
| `public/js/subscription.js` | Add `canUseCymaticsFullscreen()` |
| `public/css/player.css` | Cymatics canvas, `.cymatics-active`, `.cymatics-fullscreen-overlay`, toggle/chip styles |
| `public/js/i18n.js` | Add new keys for cymatics labels (toggle, style names, upgrade prompt) |
| `package.json` | Add `ffmpeg-static`, `fft.js` to devDependencies; add `bake-fft` and `test` scripts |
| `.gitignore` | Add `tests/fixtures/*.wav` if generated, and `coverage/` if produced |

### Optional Track 3 production additions

| Path | Change |
|---|---|
| `media/meta.json` | Optional `cymatics_preset` field per-track or per-folder |
| `media/<Folder>/<filename>.fft.json` | New sidecar file produced by bake-fft.js |

## Testing Strategy

The 5do-app has no test framework today and CLAUDE.md mandates "no build step." This plan uses:

- **Node built-in test runner (`node --test`)** for all logic that can run in Node:
  - `scripts/lib/fft-bake-core.mjs` — pure functions
  - `scripts/bake-fft.js` — CLI integration tests with WAV fixture
  - `public/js/cymatics-patterns.js` — pure data + pure lookup function
  - `public/js/cymatics-loader.js` — pure logic exported as testable named exports (dequantize, sample)
- **Manual smoke test page** (`tests/manual/cymatics-smoke.html`) for browser-only code: WebGL setup, shader rendering, fullscreen, RAF lifecycle. Loaded via the local dev server.
- **Real-device manual checks** at the end (iOS Safari background playback regression, Android, low-end iOS auto-degrade).

TDD applies wherever Node tests run. For browser-only WebGL code, "tests" are explicit checkpoints in the smoke page that the implementer must visually verify.

---

## Phase 0: Project Setup

### Task 0.1: Add devDependencies and npm scripts

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Read current `package.json` to confirm structure**

```bash
cat /Users/paulpark/5do-app/package.json
```

- [ ] **Step 2: Edit `package.json` to add devDependencies and scripts**

Add a `devDependencies` block and extend `scripts`:

```json
{
  "name": "5dio-app",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "node server.js",
    "dev": "NODE_ENV=development node server.js",
    "test": "node --test tests/",
    "bake-fft": "node scripts/bake-fft.js"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.45.0",
    "astronomy-engine": "^2.1.19",
    "compression": "^1.7.4",
    "express": "^4.19.2",
    "resend": "^6.11.0",
    "serve-static": "^1.15.0",
    "stripe": "^17.0.0"
  },
  "devDependencies": {
    "fft.js": "^4.0.4",
    "ffmpeg-static": "^5.2.0"
  }
}
```

- [ ] **Step 3: Install dependencies**

```bash
cd /Users/paulpark/5do-app && npm install
```

Expected: `added N packages` with no errors. `node_modules/fft.js` and `node_modules/ffmpeg-static` exist.

- [ ] **Step 4: Verify `npm test` runs (no tests yet — should succeed with "no tests found")**

```bash
cd /Users/paulpark/5do-app && npm test
```

Expected: exits 0 with `tests/` directory empty (no test files match yet). If it errors because `tests/` doesn't exist, create it: `mkdir -p tests`.

- [ ] **Step 5: Commit**

```bash
cd /Users/paulpark/5do-app && git add package.json package-lock.json && git commit -m "build: add fft.js and ffmpeg-static devDeps for cymatics bake script

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 1: FFT Bake Core (Pure Logic, Node-side TDD)

### Task 1.1: Test + implement Hann window function

**Files:**
- Create: `scripts/lib/fft-bake-core.mjs`
- Create: `tests/fft-bake-core.test.mjs`

- [ ] **Step 1: Create test file with failing test**

```javascript
// tests/fft-bake-core.test.mjs
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
  assert.ok(w[8] > 0.99, `expected near 1 at middle, got ${w[8]}`);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/paulpark/5do-app && npm test
```

Expected: FAIL — `Cannot find module '../scripts/lib/fft-bake-core.mjs'`

- [ ] **Step 3: Create implementation**

```javascript
// scripts/lib/fft-bake-core.mjs

export function hannWindow(n) {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
  }
  return w;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/paulpark/5do-app && npm test
```

Expected: PASS — 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/fft-bake-core.mjs tests/fft-bake-core.test.mjs
git commit -m "cymatics-bake: hann window function + tests

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 1.2: Test + implement log-spaced bin edges

**Files:**
- Modify: `scripts/lib/fft-bake-core.mjs`
- Modify: `tests/fft-bake-core.test.mjs`

- [ ] **Step 1: Add failing tests**

Append to `tests/fft-bake-core.test.mjs`:

```javascript
import { logBinEdges } from '../scripts/lib/fft-bake-core.mjs';

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
```

- [ ] **Step 2: Run tests, verify failures**

```bash
cd /Users/paulpark/5do-app && npm test
```

Expected: 4 new tests fail with `logBinEdges is not a function`.

- [ ] **Step 3: Add implementation**

Append to `scripts/lib/fft-bake-core.mjs`:

```javascript
export function logBinEdges({ bins, fMin, fMax }) {
  const edges = new Float32Array(bins + 1);
  const logMin = Math.log(fMin);
  const logMax = Math.log(fMax);
  const step = (logMax - logMin) / bins;
  for (let i = 0; i <= bins; i++) {
    edges[i] = Math.exp(logMin + step * i);
  }
  edges[0] = fMin;
  edges[bins] = fMax;
  return edges;
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd /Users/paulpark/5do-app && npm test
```

Expected: all 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/fft-bake-core.mjs tests/fft-bake-core.test.mjs
git commit -m "cymatics-bake: log-spaced bin edges + tests

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 1.3: Test + implement magnitude binning

**Files:**
- Modify: `scripts/lib/fft-bake-core.mjs`
- Modify: `tests/fft-bake-core.test.mjs`

- [ ] **Step 1: Add failing tests**

```javascript
import { binMagnitudes } from '../scripts/lib/fft-bake-core.mjs';

test('binMagnitudes: assigns FFT bins to log buckets', () => {
  // FFT: 1024 bins covering 0..11025 Hz at 22050 Hz sample rate (Nyquist = 11025)
  const sampleRate = 22050;
  const fftSize = 2048;
  const numFftBins = fftSize / 2;          // 1024
  const magnitudes = new Float32Array(numFftBins);
  // Synthesize: high magnitude at 440 Hz only
  const targetIdx = Math.round((440 / sampleRate) * fftSize);
  magnitudes[targetIdx] = 1.0;

  const edges = logBinEdges({ bins: 32, fMin: 20, fMax: 11025 });
  const bins = binMagnitudes(magnitudes, edges, sampleRate, fftSize);

  assert.equal(bins.length, 32);
  // The bin containing 440 Hz must be > 0
  let activeBin = -1;
  for (let i = 0; i < bins.length; i++) {
    if (bins[i] > 0.01) { activeBin = i; break; }
  }
  assert.ok(activeBin >= 0, 'no bin has nonzero magnitude');
  // Bin containing 440 must straddle edges[activeBin] and edges[activeBin+1]
  assert.ok(edges[activeBin] <= 440 && 440 <= edges[activeBin + 1],
    `440 Hz not in bin ${activeBin} (edges ${edges[activeBin]}..${edges[activeBin+1]})`);
});

test('binMagnitudes: empty input → all zeros', () => {
  const magnitudes = new Float32Array(1024);
  const edges = logBinEdges({ bins: 32, fMin: 20, fMax: 11025 });
  const bins = binMagnitudes(magnitudes, edges, 22050, 2048);
  for (const b of bins) assert.equal(b, 0);
});
```

- [ ] **Step 2: Run, verify failure**

```bash
npm test
```

Expected: 2 new failures with `binMagnitudes is not a function`.

- [ ] **Step 3: Implement**

Append to `scripts/lib/fft-bake-core.mjs`:

```javascript
/**
 * Average FFT magnitudes within each log bucket.
 * @param {Float32Array} magnitudes - FFT magnitude per bin (length fftSize/2)
 * @param {Float32Array} edges - bin edges (length bins+1)
 * @param {number} sampleRate
 * @param {number} fftSize
 * @returns {Float32Array} averaged magnitude per bucket (length bins)
 */
export function binMagnitudes(magnitudes, edges, sampleRate, fftSize) {
  const bins = edges.length - 1;
  const out = new Float32Array(bins);
  const counts = new Uint16Array(bins);
  const numFftBins = magnitudes.length;
  for (let i = 0; i < numFftBins; i++) {
    const freq = (i / fftSize) * sampleRate;
    if (freq < edges[0] || freq >= edges[bins]) continue;
    // Binary search the bucket
    let lo = 0, hi = bins;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (edges[mid + 1] <= freq) lo = mid + 1;
      else hi = mid;
    }
    out[lo] += magnitudes[i];
    counts[lo] += 1;
  }
  for (let i = 0; i < bins; i++) {
    if (counts[i] > 0) out[i] /= counts[i];
  }
  return out;
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
npm test
```

Expected: all 9 tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/fft-bake-core.mjs tests/fft-bake-core.test.mjs
git commit -m "cymatics-bake: log-bucket magnitude averaging + tests

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 1.4: Test + implement int8 quantization

**Files:**
- Modify: `scripts/lib/fft-bake-core.mjs`
- Modify: `tests/fft-bake-core.test.mjs`

- [ ] **Step 1: Add failing tests**

```javascript
import { quantizeFrame, normalizePeak } from '../scripts/lib/fft-bake-core.mjs';

test('normalizePeak: scales the largest value to 1.0', () => {
  const frames = [new Float32Array([0.2, 0.4, 0.8]), new Float32Array([0.1, 0.5, 0.3])];
  const peak = normalizePeak(frames);
  assert.equal(peak, 0.8);
  // After normalization, the call mutates frames in place
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
```

- [ ] **Step 2: Run, verify failure**

Expected: 4 new failures.

- [ ] **Step 3: Implement**

```javascript
export function normalizePeak(frames) {
  let peak = 0;
  for (const f of frames) for (const v of f) if (v > peak) peak = v;
  if (peak === 0) return 0;
  for (const f of frames) for (let i = 0; i < f.length; i++) f[i] /= peak;
  return peak;
}

export function quantizeFrame(frame) {
  const out = new Uint8Array(frame.length);
  for (let i = 0; i < frame.length; i++) {
    let v = frame[i];
    if (v < 0) v = 0;
    if (v > 1) v = 1;
    out[i] = Math.round(v * 255);
  }
  return out;
}
```

- [ ] **Step 4: Run, verify pass**

Expected: all 13 tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/fft-bake-core.mjs tests/fft-bake-core.test.mjs
git commit -m "cymatics-bake: peak normalization and int8 quantization + tests

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 1.5: Test + implement full frame builder

**Files:**
- Modify: `scripts/lib/fft-bake-core.mjs`
- Modify: `tests/fft-bake-core.test.mjs`

- [ ] **Step 1: Add failing test**

```javascript
import { buildFrames } from '../scripts/lib/fft-bake-core.mjs';

test('buildFrames: yields ceil(duration * fps) frames', () => {
  // Synthetic PCM: 22050 samples = 1 second at 22050 Hz
  const sampleRate = 22050;
  const pcm = new Float32Array(sampleRate);
  // Silence — quantized output should all be zero, but frame count is what matters
  const result = buildFrames({ pcm, sampleRate, fps: 30, fftSize: 2048, bins: 32 });
  assert.equal(result.frames.length, 30);  // 1 second × 30 fps
  assert.equal(result.frames[0].length, 32);
  assert.equal(result.peak, 0);
});

test('buildFrames: 440 Hz tone produces a non-silent bin', () => {
  const sampleRate = 22050;
  const duration = 1.0;
  const pcm = new Float32Array(sampleRate * duration);
  for (let i = 0; i < pcm.length; i++) {
    pcm[i] = Math.sin(2 * Math.PI * 440 * (i / sampleRate));
  }
  const result = buildFrames({ pcm, sampleRate, fps: 30, fftSize: 2048, bins: 32 });
  // At least one frame should have a nonzero quantized bin
  let hasSignal = false;
  for (const f of result.frames) for (const b of f) if (b > 0) { hasSignal = true; break; }
  assert.ok(hasSignal, 'no signal detected after baking 440 Hz tone');
  assert.ok(result.peak > 0);
});
```

- [ ] **Step 2: Run, verify failure**

Expected: 2 new failures.

- [ ] **Step 3: Implement**

Add at the bottom of `scripts/lib/fft-bake-core.mjs`:

```javascript
import FFT from 'fft.js';

/**
 * Bake the full set of FFT frames from PCM.
 * Returns { frames: Uint8Array[], peak: number, fps, bins }.
 */
export function buildFrames({ pcm, sampleRate, fps = 30, fftSize = 2048, bins = 32, fMin = 20, fMax = null }) {
  const fmax = fMax ?? sampleRate / 2;
  const hop = Math.round(sampleRate / fps);
  const numFrames = Math.ceil(pcm.length / hop);
  const window = hannWindow(fftSize);
  const fft = new FFT(fftSize);
  const fftBuffer = fft.createComplexArray();
  const inputBuffer = new Float32Array(fftSize);
  const magnitudes = new Float32Array(fftSize / 2);
  const edges = logBinEdges({ bins, fMin, fMax: fmax });
  const rawFrames = [];

  for (let f = 0; f < numFrames; f++) {
    const start = f * hop;
    // Center the FFT window on this frame
    const winStart = start - Math.floor(fftSize / 2);
    for (let i = 0; i < fftSize; i++) {
      const src = winStart + i;
      inputBuffer[i] = (src >= 0 && src < pcm.length) ? pcm[src] * window[i] : 0;
    }
    fft.realTransform(fftBuffer, inputBuffer);
    fft.completeSpectrum(fftBuffer);
    for (let i = 0; i < magnitudes.length; i++) {
      const re = fftBuffer[2 * i];
      const im = fftBuffer[2 * i + 1];
      magnitudes[i] = Math.sqrt(re * re + im * im);
    }
    rawFrames.push(binMagnitudes(magnitudes, edges, sampleRate, fftSize));
  }

  const peak = normalizePeak(rawFrames);
  const frames = rawFrames.map(quantizeFrame);
  return { frames, peak, fps, bins };
}
```

- [ ] **Step 4: Run, verify pass**

```bash
npm test
```

Expected: all 15 tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/fft-bake-core.mjs tests/fft-bake-core.test.mjs
git commit -m "cymatics-bake: complete frame builder with FFT + windowing + tests

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 2: bake-fft.js CLI

### Task 2.1: Generate test fixture WAV

**Files:**
- Create: `tests/fixtures/sine_440_2s.wav`
- Create: `tests/generate-fixture.mjs` (one-shot helper)

- [ ] **Step 1: Create fixture-generation script**

```javascript
// tests/generate-fixture.mjs
// Run once to produce tests/fixtures/sine_440_2s.wav (committed afterward).
import fs from 'node:fs';

const sampleRate = 22050;
const duration = 2;
const numSamples = sampleRate * duration;
const samples = new Int16Array(numSamples);
for (let i = 0; i < numSamples; i++) {
  samples[i] = Math.round(Math.sin(2 * Math.PI * 440 * (i / sampleRate)) * 32767 * 0.8);
}

// Minimal 16-bit mono WAV header
function writeWav(samples, sampleRate) {
  const dataSize = samples.length * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);              // PCM
  buf.writeUInt16LE(1, 22);              // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28); // byte rate
  buf.writeUInt16LE(2, 32);              // block align
  buf.writeUInt16LE(16, 34);             // bits per sample
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples.length; i++) buf.writeInt16LE(samples[i], 44 + i * 2);
  return buf;
}

fs.mkdirSync('tests/fixtures', { recursive: true });
fs.writeFileSync('tests/fixtures/sine_440_2s.wav', writeWav(samples, sampleRate));
console.log('wrote tests/fixtures/sine_440_2s.wav');
```

- [ ] **Step 2: Run the generator**

```bash
cd /Users/paulpark/5do-app && node tests/generate-fixture.mjs
```

Expected: creates `tests/fixtures/sine_440_2s.wav` (~88KB).

- [ ] **Step 3: Verify the fixture exists and has reasonable size**

```bash
ls -l tests/fixtures/sine_440_2s.wav
```

Expected: ~88044 bytes.

- [ ] **Step 4: Commit fixture and generator**

```bash
git add tests/fixtures/sine_440_2s.wav tests/generate-fixture.mjs
git commit -m "test: 440 Hz / 2s WAV fixture for bake-fft tests

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 2.2: Test + implement single-file bake CLI

**Files:**
- Create: `scripts/bake-fft.js`
- Create: `tests/bake-fft-cli.test.mjs`

- [ ] **Step 1: Create failing test**

```javascript
// tests/bake-fft-cli.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const execFileAsync = promisify(execFile);
const FIXTURE = 'tests/fixtures/sine_440_2s.wav';

test('bake-fft.js: produces sidecar JSON with expected schema for 440 Hz fixture', async () => {
  const out = path.join(os.tmpdir(), `cym-test-${Date.now()}.fft.json`);
  await execFileAsync('node', ['scripts/bake-fft.js', FIXTURE, out]);
  const json = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.equal(json.version, 1);
  assert.equal(json.fps, 30);
  assert.equal(json.bins, 32);
  assert.ok(Math.abs(json.duration - 2.0) < 0.05, `duration ~2.0, got ${json.duration}`);
  assert.ok(Array.isArray(json.frames));
  assert.equal(json.frames.length, 60); // 2 seconds × 30 fps
  assert.equal(json.frames[0].length, 32);
  // Some frame should have non-zero values (it's a 440 Hz tone)
  let hasSignal = false;
  for (const f of json.frames) for (const v of f) if (v > 0) { hasSignal = true; break; }
  assert.ok(hasSignal, 'no signal detected in baked sidecar');
  fs.unlinkSync(out);
});

test('bake-fft.js: defaults output path to <input>.fft.json when omitted', async () => {
  const tmpIn = path.join(os.tmpdir(), `cym-test-input-${Date.now()}.wav`);
  fs.copyFileSync(FIXTURE, tmpIn);
  await execFileAsync('node', ['scripts/bake-fft.js', tmpIn]);
  const expectedOut = tmpIn.replace(/\.wav$/, '.fft.json');
  assert.ok(fs.existsSync(expectedOut), `expected ${expectedOut}`);
  fs.unlinkSync(tmpIn);
  fs.unlinkSync(expectedOut);
});
```

- [ ] **Step 2: Run, verify failure**

```bash
npm test
```

Expected: 2 failures with `Cannot find module scripts/bake-fft.js` (or non-zero exit).

- [ ] **Step 3: Implement CLI**

```javascript
// scripts/bake-fft.js
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';
import { buildFrames } from './lib/fft-bake-core.mjs';

const FPS = 30;
const FFT_SIZE = 2048;
const BINS = 32;
const TARGET_RATE = 22050;

/**
 * Decode any audio file to mono Float32Array PCM at TARGET_RATE via ffmpeg.
 */
function decodeToPCM(inputPath) {
  return new Promise((resolve, reject) => {
    const args = [
      '-i', inputPath,
      '-f', 'f32le',
      '-acodec', 'pcm_f32le',
      '-ac', '1',
      '-ar', String(TARGET_RATE),
      '-loglevel', 'error',
      'pipe:1'
    ];
    const proc = spawn(ffmpegPath, args);
    const chunks = [];
    proc.stdout.on('data', (c) => chunks.push(c));
    let stderr = '';
    proc.stderr.on('data', (c) => stderr += c.toString());
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error(`ffmpeg exit ${code}: ${stderr}`));
      const buf = Buffer.concat(chunks);
      // Reinterpret as Float32Array
      const pcm = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
      resolve(pcm);
    });
  });
}

async function bakeOne(inputPath, outputPath) {
  const pcm = await decodeToPCM(inputPath);
  const duration = pcm.length / TARGET_RATE;
  const { frames } = buildFrames({
    pcm,
    sampleRate: TARGET_RATE,
    fps: FPS,
    fftSize: FFT_SIZE,
    bins: BINS
  });
  const json = {
    version: 1,
    fps: FPS,
    bins: BINS,
    duration: Number(duration.toFixed(3)),
    frames: frames.map((f) => Array.from(f))
  };
  fs.writeFileSync(outputPath, JSON.stringify(json));
  return { duration, numFrames: frames.length, outputPath };
}

function defaultOutPath(inputPath) {
  const ext = path.extname(inputPath);
  return inputPath.slice(0, -ext.length) + '.fft.json';
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === '--help') {
    console.log('Usage: bake-fft.js <input.mp3|wav> [output.fft.json]');
    console.log('       bake-fft.js --batch <directory>');
    process.exit(args.length === 0 ? 1 : 0);
  }
  if (args[0] === '--batch') {
    const dir = args[1];
    if (!dir) { console.error('--batch requires a directory'); process.exit(1); }
    const entries = fs.readdirSync(dir, { recursive: true });
    const audio = entries.filter((p) => /\.(mp3|wav|flac)$/i.test(p) && !p.includes('_qtx'));
    let n = 0;
    for (const rel of audio) {
      const inPath = path.join(dir, rel);
      const outPath = defaultOutPath(inPath);
      try {
        const res = await bakeOne(inPath, outPath);
        console.log(`✓ ${rel} → ${path.basename(outPath)} (${res.duration.toFixed(1)}s, ${res.numFrames} frames)`);
        n++;
      } catch (e) {
        console.error(`✗ ${rel}: ${e.message}`);
      }
    }
    console.log(`\nbaked ${n}/${audio.length} files`);
    return;
  }
  const inPath = args[0];
  const outPath = args[1] || defaultOutPath(inPath);
  const res = await bakeOne(inPath, outPath);
  console.log(`✓ ${inPath} → ${outPath} (${res.duration.toFixed(1)}s, ${res.numFrames} frames)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 4: Run tests, verify pass**

```bash
npm test
```

Expected: all 17 tests pass. (15 from Phase 1 + 2 here.)

- [ ] **Step 5: Manually bake the fixture and inspect**

```bash
node scripts/bake-fft.js tests/fixtures/sine_440_2s.wav /tmp/sine_440.fft.json
ls -l /tmp/sine_440.fft.json
head -c 200 /tmp/sine_440.fft.json
rm /tmp/sine_440.fft.json
```

Expected: file ~5-10KB. JSON shows version/fps/bins/duration/frames.

- [ ] **Step 6: Commit**

```bash
git add scripts/bake-fft.js tests/bake-fft-cli.test.mjs
git commit -m "cymatics-bake: CLI for single-file and batch FFT sidecar baking

Decodes any audio via ffmpeg-static to 22050 Hz mono Float32 PCM, runs
buildFrames, writes <input>.fft.json. Supports --batch <dir> for library
backfill.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 3: Pattern Catalog (browser-side, Node-tested ESM)

### Task 3.1: Test + implement pattern presets and category mapping

**Files:**
- Create: `public/js/cymatics-patterns.js`
- Create: `tests/cymatics-patterns.test.mjs`

- [ ] **Step 1: Create failing test**

```javascript
// tests/cymatics-patterns.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PATTERNS, CATEGORY_DEFAULTS, lookupPattern } from '../public/js/cymatics-patterns.js';

test('PATTERNS: 4 patterns with required fields', () => {
  const names = Object.keys(PATTERNS);
  assert.deepEqual(names.sort(), ['chladni', 'liquid', 'mandala', 'particle']);
  for (const name of names) {
    const p = PATTERNS[name];
    assert.equal(typeof p.modeIndex, 'number', `${name}.modeIndex`);
    assert.ok(Array.isArray(p.palette) && p.palette.length >= 2, `${name}.palette`);
    for (const stop of p.palette) {
      assert.match(stop, /^#[0-9a-fA-F]{6}$/, `${name} palette stop ${stop}`);
    }
  }
});

test('CATEGORY_DEFAULTS: maps known categories to valid pattern names', () => {
  for (const [cat, pat] of Object.entries(CATEGORY_DEFAULTS)) {
    assert.ok(PATTERNS[pat], `category ${cat} → unknown pattern ${pat}`);
  }
  assert.equal(CATEGORY_DEFAULTS['Divine_Tunes'], 'mandala');
  assert.equal(CATEGORY_DEFAULTS['Akashic_Gateway'], 'mandala');
  assert.equal(CATEGORY_DEFAULTS['Chakra_Activation'], 'chladni');
  assert.equal(CATEGORY_DEFAULTS['Crystal_Frequencies'], 'liquid');
});
```

- [ ] **Step 2: Run, verify failure**

Expected: test file errors with `Cannot find module ../public/js/cymatics-patterns.js`.

- [ ] **Step 3: Implement**

```javascript
// public/js/cymatics-patterns.js

export const PATTERNS = {
  chladni: {
    modeIndex: 0,
    palette: ['#7C5CFC', '#3ECFCF', '#FF6B9D'],
    smoothing: 0.7
  },
  mandala: {
    modeIndex: 1,
    palette: ['#FFB86C', '#FF6B9D', '#9B7FFF'],
    smoothing: 0.6
  },
  liquid: {
    modeIndex: 2,
    palette: ['#3ECFCF', '#5A3AD9', '#7C5CFC'],
    smoothing: 0.85
  },
  particle: {
    modeIndex: 3,
    palette: ['#FF6B9D', '#FFB86C', '#3ECFCF'],
    smoothing: 0.5
  }
};

export const CATEGORY_DEFAULTS = {
  Divine_Tunes: 'mandala',
  Akashic_Gateway: 'mandala',
  Chakra_Activation: 'chladni',
  Holland_Resonance: 'chladni',
  Crystal_Frequencies: 'liquid',
  White_Noise: 'liquid',
  // beat-driven / activation defaults — fall through to particle
  Solar_Activation: 'particle',
  Sacral_Activation: 'particle'
};

const FALLBACK_PATTERN = 'mandala';
```

- [ ] **Step 4: Run, verify pass**

Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add public/js/cymatics-patterns.js tests/cymatics-patterns.test.mjs
git commit -m "cymatics: pattern catalog (4 presets) + category defaults

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 3.2: Test + implement lookupPattern precedence resolver

**Files:**
- Modify: `public/js/cymatics-patterns.js`
- Modify: `tests/cymatics-patterns.test.mjs`

- [ ] **Step 1: Add failing tests**

```javascript
test('lookupPattern: user override beats track and category', () => {
  const result = lookupPattern({
    userOverride: 'particle',
    trackPreset: 'liquid',
    categoryPreset: 'chladni',
    category: 'Divine_Tunes'
  });
  assert.equal(result, 'particle');
});

test('lookupPattern: track preset beats category preset and built-in default', () => {
  const result = lookupPattern({
    userOverride: 'auto',
    trackPreset: 'liquid',
    categoryPreset: 'chladni',
    category: 'Divine_Tunes'
  });
  assert.equal(result, 'liquid');
});

test('lookupPattern: category preset beats built-in default', () => {
  const result = lookupPattern({
    userOverride: 'auto',
    trackPreset: null,
    categoryPreset: 'particle',
    category: 'Divine_Tunes'
  });
  assert.equal(result, 'particle');
});

test('lookupPattern: built-in default for known category', () => {
  const result = lookupPattern({
    userOverride: 'auto',
    trackPreset: null,
    categoryPreset: null,
    category: 'Akashic_Gateway'
  });
  assert.equal(result, 'mandala');
});

test('lookupPattern: unknown preset name falls through gracefully', () => {
  const result = lookupPattern({
    userOverride: 'nonsense',
    trackPreset: 'also-bad',
    categoryPreset: null,
    category: 'unknown_category'
  });
  // Falls all the way through to FALLBACK_PATTERN
  assert.equal(result, 'mandala');
});

test('lookupPattern: completely unknown inputs → fallback', () => {
  const result = lookupPattern({});
  assert.equal(result, 'mandala');
});
```

- [ ] **Step 2: Run, verify failure**

Expected: 6 new failures.

- [ ] **Step 3: Implement**

Append to `public/js/cymatics-patterns.js`:

```javascript
function _isValid(name) {
  return typeof name === 'string' && Object.prototype.hasOwnProperty.call(PATTERNS, name);
}

/**
 * Resolve which pattern to render given the precedence chain.
 * @param {Object} ctx
 * @param {string} [ctx.userOverride] - 'auto' or pattern name from localStorage
 * @param {string|null} [ctx.trackPreset] - meta.json[<Folder>/<file>].cymatics_preset
 * @param {string|null} [ctx.categoryPreset] - meta.json[<Folder>/_folder].cymatics_preset
 * @param {string} [ctx.category] - folder name
 * @returns {string} a key of PATTERNS
 */
export function lookupPattern({ userOverride, trackPreset, categoryPreset, category } = {}) {
  if (userOverride && userOverride !== 'auto' && _isValid(userOverride)) return userOverride;
  if (_isValid(trackPreset)) return trackPreset;
  if (_isValid(categoryPreset)) return categoryPreset;
  if (category && CATEGORY_DEFAULTS[category] && _isValid(CATEGORY_DEFAULTS[category])) {
    return CATEGORY_DEFAULTS[category];
  }
  return FALLBACK_PATTERN;
}
```

- [ ] **Step 4: Run, verify pass**

Expected: 8 tests pass total in this file.

- [ ] **Step 5: Commit**

```bash
git add public/js/cymatics-patterns.js tests/cymatics-patterns.test.mjs
git commit -m "cymatics: lookupPattern precedence resolver (user > track > category > default)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 4: Sidecar Loader (testable pure logic + browser glue)

### Task 4.1: Test + implement int8 dequantization and frame sampling

**Files:**
- Create: `public/js/cymatics-loader.js`
- Create: `tests/cymatics-loader.test.mjs`

- [ ] **Step 1: Create failing test**

```javascript
// tests/cymatics-loader.test.mjs
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
    // Frame 0 = [0,0,0,0], Frame 1 = [255,255,255,255]
    frames: [[0,0,0,0], [255,255,255,255]]
  };
  // halfway between frame 0 and 1 = t = 0.5/30
  const out = sampleAtTime(sidecar, 0.5 / 30);
  // Should be ~0.5
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
```

- [ ] **Step 2: Run, verify failure**

Expected: 5 failures.

- [ ] **Step 3: Implement (pure logic only — browser parts come in 4.2)**

```javascript
// public/js/cymatics-loader.js

/**
 * Convert a single int8 quantized frame to a Float32Array of magnitudes 0..1.
 */
export function dequantizeFrame(frame) {
  const out = new Float32Array(frame.length);
  for (let i = 0; i < frame.length; i++) out[i] = frame[i] / 255;
  return out;
}

/**
 * Sample the sidecar at a given time (seconds), with linear interpolation.
 * Returns a Float32Array of length `sidecar.bins`.
 */
export function sampleAtTime(sidecar, timeSec) {
  const bins = sidecar.bins;
  const out = new Float32Array(bins);
  if (!sidecar.frames || sidecar.frames.length === 0) return out;
  const fps = sidecar.fps;
  const t = Math.max(0, timeSec);
  const idxF = t * fps;
  const i0 = Math.floor(idxF);
  const i1 = Math.min(i0 + 1, sidecar.frames.length - 1);
  const frac = Math.min(1, idxF - i0);
  if (i0 >= sidecar.frames.length) {
    // Past end: clamp to last
    const last = sidecar.frames[sidecar.frames.length - 1];
    for (let i = 0; i < bins; i++) out[i] = last[i] / 255;
    return out;
  }
  const f0 = sidecar.frames[i0];
  const f1 = sidecar.frames[i1];
  for (let i = 0; i < bins; i++) {
    out[i] = (f0[i] * (1 - frac) + f1[i] * frac) / 255;
  }
  return out;
}
```

- [ ] **Step 4: Run, verify pass**

Expected: all 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add public/js/cymatics-loader.js tests/cymatics-loader.test.mjs
git commit -m "cymatics: sidecar dequantization and frame sampling (pure logic + tests)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 4.2: Implement procedural simulation fallback

**Files:**
- Modify: `public/js/cymatics-loader.js`
- Modify: `tests/cymatics-loader.test.mjs`

- [ ] **Step 1: Add failing tests**

```javascript
import { proceduralFrame } from '../public/js/cymatics-loader.js';

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
```

- [ ] **Step 2: Run, verify failure**

Expected: 3 new failures.

- [ ] **Step 3: Implement**

Append to `public/js/cymatics-loader.js`:

```javascript
/**
 * Procedural fallback: layered sin/cos to mimic frequency animation when no
 * sidecar/AnalyserNode is available (used on iOS without sidecar). Matches
 * the spirit of the existing side-spectrum simulation in 5do.html:1206-1224.
 */
export function proceduralFrame({ timeSec, duration, bins = 32 }) {
  const out = new Float32Array(bins);
  const norm = duration > 0 ? (timeSec % duration) / duration : 0;
  for (let i = 0; i < bins; i++) {
    const phase = i / bins;
    const a = 0.5 + 0.5 * Math.sin(2 * Math.PI * (phase * 3 + timeSec * 0.4));
    const b = 0.5 + 0.5 * Math.cos(2 * Math.PI * (phase * 5.7 - timeSec * 0.27));
    const c = 0.5 + 0.5 * Math.sin(2 * Math.PI * (phase * 1.3 + norm * 2));
    // Frequency tilt: low bins louder than high
    const tilt = 1 - phase * 0.6;
    out[i] = Math.min(1, ((a * b * 0.7 + c * 0.3) * tilt));
  }
  return out;
}
```

- [ ] **Step 4: Run, verify pass**

Expected: 8 tests pass in this file.

- [ ] **Step 5: Commit**

```bash
git add public/js/cymatics-loader.js tests/cymatics-loader.test.mjs
git commit -m "cymatics: procedural simulation frame for sidecar-less iOS fallback

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 4.3: Implement browser-side sidecar fetcher and source factory

**Files:**
- Modify: `public/js/cymatics-loader.js`

(This task is browser-only — verified via the smoke page in Phase 10. No Node test.)

- [ ] **Step 1: Add fetcher and source factory**

Append to `public/js/cymatics-loader.js`:

```javascript
const _isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function _sidecarUrlFor(audioUrl) {
  // Replace last .ext with .fft.json
  return audioUrl.replace(/\.[^.\/]+$/, '.fft.json');
}

async function _tryFetchSidecar(audioUrl) {
  const url = _sidecarUrlFor(audioUrl);
  try {
    const head = await fetch(url, { method: 'HEAD' });
    if (!head.ok) return null;
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Build a frequency-data source for the given audio element + URL.
 * Returns: { kind, sample(): Float32Array(32) }
 *   - kind: 'sidecar' | 'analyser' | 'procedural'
 */
export async function buildSource({ audio, audioUrl, analyserFactory }) {
  // Path 1: sidecar
  const sidecar = await _tryFetchSidecar(audioUrl);
  if (sidecar) {
    return {
      kind: 'sidecar',
      sample: () => sampleAtTime(sidecar, audio.currentTime || 0)
    };
  }
  // Path 2: real-time AnalyserNode (desktop/Android only)
  if (!_isIOS && analyserFactory) {
    try {
      const analyser = analyserFactory();  // user supplies; may throw
      const bins = analyser.frequencyBinCount;
      const buf = new Uint8Array(bins);
      // Down-sample to 32 by averaging — keeps shader interface uniform
      return {
        kind: 'analyser',
        sample: () => {
          analyser.getByteFrequencyData(buf);
          const out = new Float32Array(32);
          const stride = bins / 32;
          for (let i = 0; i < 32; i++) {
            let s = 0, n = 0;
            const lo = Math.floor(i * stride), hi = Math.floor((i + 1) * stride);
            for (let j = lo; j < hi; j++) { s += buf[j]; n++; }
            out[i] = (s / Math.max(1, n)) / 255;
          }
          return out;
        }
      };
    } catch {
      // fall through
    }
  }
  // Path 3: procedural simulation (iOS without sidecar, or analyser failure)
  return {
    kind: 'procedural',
    sample: () => proceduralFrame({
      timeSec: audio.currentTime || 0,
      duration: audio.duration || 600,
      bins: 32
    })
  };
}
```

- [ ] **Step 2: Verify file parses (no syntax errors)**

```bash
cd /Users/paulpark/5do-app && node -e "import('./public/js/cymatics-loader.js').then(m => console.log(Object.keys(m)))"
```

Expected: prints `[ 'dequantizeFrame', 'sampleAtTime', 'proceduralFrame', 'buildSource' ]`.

- [ ] **Step 3: Commit**

```bash
git add public/js/cymatics-loader.js
git commit -m "cymatics: browser sidecar fetcher + fallback source factory

buildSource() returns one of three frequency-data sources:
- 'sidecar': fetched <track>.fft.json
- 'analyser': real-time AnalyserNode (desktop/Android only)
- 'procedural': fake sin/cos animation (iOS without sidecar)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 5: Shaders

### Task 5.1: Write vertex shader and fragment shader scaffold

**Files:**
- Create: `public/js/cymatics-shaders.js`

(No Node tests — GLSL compiles only in WebGL. Verified in smoke page Phase 10.)

- [ ] **Step 1: Create shader module with vertex + fragment scaffold**

```javascript
// public/js/cymatics-shaders.js

export const VERT_GLSL = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

// Helper functions used by all patterns
const COMMON_GLSL = `
// Sample a single bin from the FFT texture (32×1 RG8).
float fftBin(int i) {
  return texelFetch(u_fftTex, ivec2(i, 0), 0).r;
}

// Bass = avg of bins 0..3, mid = 4..15, treble = 16..31
float bassEnergy() {
  float s = 0.0;
  for (int i = 0; i < 4; i++) s += fftBin(i);
  return s / 4.0;
}
float midEnergy() {
  float s = 0.0;
  for (int i = 4; i < 16; i++) s += fftBin(i);
  return s / 12.0;
}
float trebleEnergy() {
  float s = 0.0;
  for (int i = 16; i < 32; i++) s += fftBin(i);
  return s / 16.0;
}

// 3-stop palette interpolation (0..1 → color)
vec3 palette(float t, vec3 a, vec3 b, vec3 c) {
  t = clamp(t, 0.0, 1.0);
  if (t < 0.5) return mix(a, b, t * 2.0);
  return mix(b, c, (t - 0.5) * 2.0);
}

// Hue rotate an RGB color by 'angle' radians
vec3 hueRotate(vec3 c, float angle) {
  float cosA = cos(angle);
  float sinA = sin(angle);
  mat3 m = mat3(
    0.299 + 0.701*cosA + 0.168*sinA, 0.587 - 0.587*cosA + 0.330*sinA, 0.114 - 0.114*cosA - 0.497*sinA,
    0.299 - 0.299*cosA - 0.328*sinA, 0.587 + 0.413*cosA + 0.035*sinA, 0.114 - 0.114*cosA + 0.292*sinA,
    0.299 - 0.300*cosA + 1.250*sinA, 0.587 - 0.588*cosA - 1.050*sinA, 0.114 + 0.886*cosA - 0.203*sinA
  );
  return clamp(m * c, 0.0, 1.0);
}

// Simple 2D pseudo-random
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
`;

const PATTERN_PLACEHOLDERS_GLSL = `
vec3 patternChladni(vec2 uv) { return vec3(0.0); }
vec3 patternMandala(vec2 uv) { return vec3(0.0); }
vec3 patternLiquid(vec2 uv) { return vec3(0.0); }
vec3 patternParticle(vec2 uv) { return vec3(0.0); }
`;

export const FRAG_GLSL = `#version 300 es
precision highp float;

uniform sampler2D u_fftTex;       // 32×1 RG8 (R=current, G=smoothed)
uniform float u_time;
uniform vec2 u_resolution;
uniform int u_mode;                // 0..3
uniform vec3 u_palA;
uniform vec3 u_palB;
uniform vec3 u_palC;
uniform float u_hueOffset;         // continuous color cycling

in vec2 v_uv;
out vec4 outColor;

${COMMON_GLSL}
${PATTERN_PLACEHOLDERS_GLSL}

void main() {
  vec2 uv = v_uv * 2.0 - 1.0;        // -1..1
  uv.x *= u_resolution.x / u_resolution.y;
  vec3 col;
  if (u_mode == 0) col = patternChladni(uv);
  else if (u_mode == 1) col = patternMandala(uv);
  else if (u_mode == 2) col = patternLiquid(uv);
  else col = patternParticle(uv);

  // Apply continuous hue cycling (24s period)
  col = hueRotate(col, u_hueOffset);

  outColor = vec4(col, 1.0);
}
`;
```

- [ ] **Step 2: Verify file imports**

```bash
node -e "import('./public/js/cymatics-shaders.js').then(m => console.log(typeof m.VERT_GLSL, typeof m.FRAG_GLSL))"
```

Expected: prints `string string`.

- [ ] **Step 3: Commit**

```bash
git add public/js/cymatics-shaders.js
git commit -m "cymatics: vertex + fragment shader scaffold with shared helpers

Common: fftBin, bass/mid/treble energy, 3-stop palette, hue rotation.
Pattern functions are placeholders; filled in subsequent tasks.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 5.2: Implement Chladni nodal grid pattern

**Files:**
- Modify: `public/js/cymatics-shaders.js`

- [ ] **Step 1: Replace `patternChladni` placeholder**

In `cymatics-shaders.js`, replace the entire `PATTERN_PLACEHOLDERS_GLSL` constant with this expanded version (we'll keep the others as placeholders for now; they fill in later tasks):

```javascript
const PATTERN_PLACEHOLDERS_GLSL = `
// Chladni nodal grid: sin(n·π·x) + sin(m·π·y) ≈ 0 lines, modulated by mid/treble
vec3 patternChladni(vec2 uv) {
  float bass = bassEnergy();
  float mid = midEnergy();
  float treble = trebleEnergy();

  // Modal numbers driven by treble (more nodes when treble rises)
  float n = 3.0 + treble * 8.0;
  float m = 4.0 + mid * 6.0;

  // Time-shifted modal sum
  float a = sin(n * 3.14159 * uv.x + u_time * 0.5);
  float b = sin(m * 3.14159 * uv.y + u_time * 0.4);
  float field = a + b;

  // Distance to nodal line (|field| close to 0)
  float node = exp(-pow(field, 2.0) * 20.0);

  // Background palette modulated by bass
  vec3 base = palette(0.5 + 0.4 * sin(u_time * 0.2), u_palA, u_palB, u_palC) * (0.05 + bass * 0.4);

  // Bright nodal lines
  vec3 line = palette(0.5 + 0.5 * sin(field * 2.0 + u_time * 0.3), u_palA, u_palB, u_palC);

  return base + line * node * (0.6 + treble * 0.4);
}
vec3 patternMandala(vec2 uv) { return vec3(0.0); }
vec3 patternLiquid(vec2 uv) { return vec3(0.0); }
vec3 patternParticle(vec2 uv) { return vec3(0.0); }
`;
```

- [ ] **Step 2: Commit**

```bash
git add public/js/cymatics-shaders.js
git commit -m "cymatics: Chladni nodal grid pattern shader

Modal numbers driven by treble/mid energy; nodal line glow modulated by
treble; background luminance by bass.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 5.3: Implement Mandala bloom pattern

**Files:**
- Modify: `public/js/cymatics-shaders.js`

- [ ] **Step 1: Replace `patternMandala` placeholder**

In the `PATTERN_PLACEHOLDERS_GLSL` constant, replace `vec3 patternMandala(vec2 uv) { return vec3(0.0); }` with:

```glsl
vec3 patternMandala(vec2 uv) {
  float bass = bassEnergy();
  float mid = midEnergy();
  float treble = trebleEnergy();

  vec2 p = uv;
  float r = length(p);
  float theta = atan(p.y, p.x);

  // 6 or 8 petals, breathing with treble
  float petals = 6.0 + floor(treble * 4.0);
  float petal = cos(theta * petals + u_time * 0.3);

  // Radial breathing: bass pulls inward, treble pushes out
  float breath = 0.6 + bass * 0.4 + sin(u_time * 1.0) * 0.05;
  float ring = exp(-pow((r - breath) * 6.0, 2.0));
  float inner = exp(-pow(r * 4.0, 2.0)) * (0.5 + bass * 0.5);

  // Filigree petals
  float petalGlow = exp(-pow((r - breath * 0.7) * 5.0, 2.0)) * (0.5 + 0.5 * petal);

  vec3 col = vec3(0.0);
  col += palette(r, u_palA, u_palB, u_palC) * inner;
  col += palette(0.5 + 0.5 * sin(theta * 2.0 + u_time * 0.4), u_palA, u_palB, u_palC) * ring;
  col += palette(treble, u_palB, u_palC, u_palA) * petalGlow * (0.6 + mid * 0.6);

  return col;
}
```

- [ ] **Step 2: Commit**

```bash
git add public/js/cymatics-shaders.js
git commit -m "cymatics: Mandala bloom pattern shader

Six-to-ten radial petals; bass-driven radial breathing; treble-driven
petal count and glow.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 5.4: Implement Liquid Plate pattern

**Files:**
- Modify: `public/js/cymatics-shaders.js`

- [ ] **Step 1: Replace `patternLiquid` placeholder**

```glsl
vec3 patternLiquid(vec2 uv) {
  float bass = bassEnergy();
  float mid = midEnergy();
  float treble = trebleEnergy();

  vec2 p = uv;
  float r = length(p);

  // Concentric rings with frequency-driven spacing
  float ringFreq = 8.0 + mid * 8.0;
  float ringPhase = r * ringFreq - u_time * 1.2 - bass * 2.0;
  float rings = 0.5 + 0.5 * sin(ringPhase);
  rings *= exp(-r * 0.6);   // attenuate outward

  // Multiple drop sources causing interference
  vec2 d1 = vec2(0.4 * cos(u_time * 0.31), 0.4 * sin(u_time * 0.27));
  vec2 d2 = vec2(-0.5 * cos(u_time * 0.19), 0.3 * sin(u_time * 0.41));
  float w1 = sin(length(p - d1) * 12.0 - u_time * 2.0) * 0.5 + 0.5;
  float w2 = sin(length(p - d2) * 14.0 - u_time * 1.7) * 0.5 + 0.5;
  float interference = (w1 + w2) * 0.5 * (0.4 + treble * 0.6);

  vec3 base = palette(0.3 + r * 0.5, u_palA, u_palB, u_palC) * (0.05 + bass * 0.25);
  vec3 ringCol = palette(0.5 + 0.5 * sin(ringPhase), u_palA, u_palB, u_palC);
  return base + ringCol * rings * 0.8 + ringCol * interference * 0.3;
}
```

- [ ] **Step 2: Commit**

```bash
git add public/js/cymatics-shaders.js
git commit -m "cymatics: Liquid plate pattern shader

Concentric rings + two moving drop sources with interference; spacing
modulated by mid energy, intensity by bass and treble.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 5.5: Implement Particle Vortex pattern

**Files:**
- Modify: `public/js/cymatics-shaders.js`

- [ ] **Step 1: Replace `patternParticle` placeholder**

```glsl
vec3 patternParticle(vec2 uv) {
  float bass = bassEnergy();
  float mid = midEnergy();
  float treble = trebleEnergy();

  // Procedurally render ~64 particles via grid hashing
  vec3 col = vec3(0.0);
  const float COUNT = 64.0;
  for (float i = 0.0; i < COUNT; i += 1.0) {
    float a = i / COUNT;
    // Each particle orbits with mixed period
    float ang = a * 6.2831853 * 3.0 + u_time * (0.3 + a * 0.7) + bass * 2.0;
    float rad = 0.2 + a * 0.6 + sin(u_time * 0.5 + a * 12.0) * 0.1 * mid;
    vec2 pos = vec2(cos(ang) * rad, sin(ang) * rad);
    float d = length(uv - pos);
    float glow = exp(-d * (40.0 - treble * 20.0));
    vec3 c = palette(a + u_time * 0.05, u_palA, u_palB, u_palC);
    col += c * glow * (0.5 + treble * 0.6);
  }
  // Faint core
  col += palette(0.5, u_palA, u_palB, u_palC) * exp(-length(uv) * 5.0) * (0.2 + bass * 0.4);
  return col;
}
```

- [ ] **Step 2: Commit**

```bash
git add public/js/cymatics-shaders.js
git commit -m "cymatics: Particle vortex pattern shader

64 procedural particles orbiting with bass-driven angular drift,
mid-driven radius wobble, treble-driven glow contraction.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 6: Cymatics Main Module

### Task 6.1: Create cymatics.js with init + WebGL context

**Files:**
- Create: `public/js/cymatics.js`

- [ ] **Step 1: Create the file with WebGL setup**

```javascript
// public/js/cymatics.js
import { VERT_GLSL, FRAG_GLSL } from './cymatics-shaders.js';
import { PATTERNS, lookupPattern } from './cymatics-patterns.js';
import { buildSource } from './cymatics-loader.js';

const STATE = {
  canvas: null,
  gl: null,
  program: null,
  fftTex: null,
  uniforms: {},
  vao: null,
  rafId: null,
  audio: null,
  source: null,         // { kind, sample() }
  currentPattern: 'mandala',
  enabled: false,
  fullscreen: false,
  fpsAvg: 60,
  lastFrameTime: 0,
  prefs: { enabled: true, style: 'auto', last_used_fullscreen: false }
};

function _hexToRgb(hex) {
  const v = parseInt(hex.slice(1), 16);
  return [((v >> 16) & 0xff) / 255, ((v >> 8) & 0xff) / 255, (v & 0xff) / 255];
}

function _compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error('Shader compile failed: ' + log);
  }
  return sh;
}

function _link(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(p);
    gl.deleteProgram(p);
    throw new Error('Program link failed: ' + log);
  }
  return p;
}

function _initWebGL(canvas) {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, premultipliedAlpha: false });
  if (!gl) throw new Error('WebGL2 not available');
  const vs = _compile(gl, gl.VERTEX_SHADER, VERT_GLSL);
  const fs = _compile(gl, gl.FRAGMENT_SHADER, FRAG_GLSL);
  const program = _link(gl, vs, fs);
  // Full-screen quad
  const quad = new Float32Array([-1, -1,  1, -1, -1, 1,  1, 1]);
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(program, 'a_pos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
  // Empty FFT texture
  const fftTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, fftTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG8, 32, 1, 0, gl.RG, gl.UNSIGNED_BYTE, new Uint8Array(64));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const uniforms = {
    fftTex: gl.getUniformLocation(program, 'u_fftTex'),
    time: gl.getUniformLocation(program, 'u_time'),
    resolution: gl.getUniformLocation(program, 'u_resolution'),
    mode: gl.getUniformLocation(program, 'u_mode'),
    palA: gl.getUniformLocation(program, 'u_palA'),
    palB: gl.getUniformLocation(program, 'u_palB'),
    palC: gl.getUniformLocation(program, 'u_palC'),
    hueOffset: gl.getUniformLocation(program, 'u_hueOffset')
  };
  return { gl, program, vao, fftTex, uniforms };
}

export function init(canvas) {
  const ctx = _initWebGL(canvas);
  STATE.canvas = canvas;
  STATE.gl = ctx.gl;
  STATE.program = ctx.program;
  STATE.vao = ctx.vao;
  STATE.fftTex = ctx.fftTex;
  STATE.uniforms = ctx.uniforms;
  // Read persisted prefs
  try {
    const raw = localStorage.getItem('cymatics_prefs');
    if (raw) STATE.prefs = { ...STATE.prefs, ...JSON.parse(raw) };
  } catch {}
}
```

- [ ] **Step 2: Verify the file imports**

```bash
node -e "import('./public/js/cymatics.js').then(m => console.log(Object.keys(m)))"
```

Expected: prints `[ 'init' ]` (more exports come in later tasks).

Note: the import will fail in Node because `cymatics-loader.js` references `navigator`, `fetch`, etc. We accept this — `cymatics.js` is browser-only.

If the import fails because of `navigator`: that's fine. Don't try to "fix" it — instead verify file syntax with:

```bash
node --check public/js/cymatics.js
```

Expected: exits 0 (no syntax errors).

- [ ] **Step 3: Commit**

```bash
git add public/js/cymatics.js
git commit -m "cymatics: main module init() with WebGL2 setup and shader compile

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 6.2: Add render loop + resize + visibility-aware pause

**Files:**
- Modify: `public/js/cymatics.js`

- [ ] **Step 1: Append render loop**

```javascript
function _resize() {
  const canvas = STATE.canvas;
  if (!canvas) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2.0);
  const cssW = canvas.clientWidth || canvas.offsetWidth || 256;
  const cssH = canvas.clientHeight || canvas.offsetHeight || 256;
  const w = Math.round(cssW * dpr);
  const h = Math.round(cssH * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
}

function _render(now) {
  STATE.rafId = null;
  if (!STATE.enabled || !STATE.gl) return;
  if (document.visibilityState !== 'visible') return _scheduleRender();
  if (STATE.audio && STATE.audio.paused) return _scheduleRender();
  if (STATE.canvas.offsetParent === null && !STATE.fullscreen) return _scheduleRender();

  _resize();
  const gl = STATE.gl;
  const u = STATE.uniforms;
  const pat = PATTERNS[STATE.currentPattern];

  // FPS tracking + auto-degrade
  if (STATE.lastFrameTime > 0) {
    const dt = now - STATE.lastFrameTime;
    const fps = 1000 / Math.max(1, dt);
    STATE.fpsAvg = STATE.fpsAvg * 0.95 + fps * 0.05;
  }
  STATE.lastFrameTime = now;
  if (STATE.fpsAvg < 45 && now % 33 < 16) return _scheduleRender();

  // FFT sample → texture
  let bins = new Float32Array(32);
  if (STATE.source) bins = STATE.source.sample();
  const buf = new Uint8Array(64);
  for (let i = 0; i < 32; i++) {
    buf[i * 2] = Math.min(255, Math.round(bins[i] * 255));
    buf[i * 2 + 1] = buf[i * 2];   // smoothed channel placeholder
  }
  gl.bindTexture(gl.TEXTURE_2D, STATE.fftTex);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 32, 1, gl.RG, gl.UNSIGNED_BYTE, buf);

  gl.viewport(0, 0, STATE.canvas.width, STATE.canvas.height);
  gl.clearColor(0.04, 0.04, 0.06, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.useProgram(STATE.program);
  gl.bindVertexArray(STATE.vao);
  gl.uniform1i(u.fftTex, 0);
  gl.uniform1f(u.time, now / 1000);
  gl.uniform2f(u.resolution, STATE.canvas.width, STATE.canvas.height);
  gl.uniform1i(u.mode, pat.modeIndex);
  gl.uniform3fv(u.palA, _hexToRgb(pat.palette[0]));
  gl.uniform3fv(u.palB, _hexToRgb(pat.palette[1]));
  gl.uniform3fv(u.palC, _hexToRgb(pat.palette[2 % pat.palette.length]));
  gl.uniform1f(u.hueOffset, (now / 1000) * (2 * Math.PI / 24));  // 24s full cycle
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  _scheduleRender();
}

function _scheduleRender() {
  if (STATE.rafId == null) STATE.rafId = requestAnimationFrame(_render);
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && STATE.enabled) _scheduleRender();
});
```

- [ ] **Step 2: Verify syntax**

```bash
node --check public/js/cymatics.js
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add public/js/cymatics.js
git commit -m "cymatics: render loop with DPR cap, FPS auto-degrade, visibility pause

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 6.3: Add public API: attach, loadTrack, setEnabled, setStyle

**Files:**
- Modify: `public/js/cymatics.js`

- [ ] **Step 1: Append public API**

```javascript
export function attach(audioElement) {
  STATE.audio = audioElement;
}

/**
 * Load a track. trackInfo: { audioUrl, category, trackPreset?, categoryPreset?, analyserFactory? }
 */
export async function loadTrack(trackInfo) {
  STATE.source = await buildSource({
    audio: STATE.audio,
    audioUrl: trackInfo.audioUrl,
    analyserFactory: trackInfo.analyserFactory
  });
  // Resolve which pattern to render
  const name = lookupPattern({
    userOverride: STATE.prefs.style,
    trackPreset: trackInfo.trackPreset,
    categoryPreset: trackInfo.categoryPreset,
    category: trackInfo.category
  });
  STATE.currentPattern = name;
}

function _persistPrefs() {
  try { localStorage.setItem('cymatics_prefs', JSON.stringify(STATE.prefs)); } catch {}
}

export function setEnabled(on) {
  STATE.enabled = !!on;
  STATE.prefs.enabled = !!on;
  _persistPrefs();
  if (STATE.canvas) {
    STATE.canvas.style.display = on ? 'block' : 'none';
    const wrap = STATE.canvas.parentElement;
    if (wrap) wrap.classList.toggle('cymatics-active', on);
  }
  if (on) _scheduleRender();
}

export function setStyle(name) {
  STATE.prefs.style = name;
  _persistPrefs();
  // If currently playing, recompute pattern with new override
  if (STATE.source && name !== 'auto' && PATTERNS[name]) {
    STATE.currentPattern = name;
  }
}

export function getPrefs() {
  return { ...STATE.prefs };
}

export function isReady() {
  return !!STATE.gl;
}
```

- [ ] **Step 2: Verify syntax**

```bash
node --check public/js/cymatics.js
```

- [ ] **Step 3: Commit**

```bash
git add public/js/cymatics.js
git commit -m "cymatics: attach/loadTrack/setEnabled/setStyle public API

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 6.4: Add fullscreen API

**Files:**
- Modify: `public/js/cymatics.js`

- [ ] **Step 1: Append fullscreen logic**

```javascript
let _fullscreenOverlay = null;
let _previousParent = null;

function _ensureOverlay() {
  if (_fullscreenOverlay) return _fullscreenOverlay;
  const div = document.createElement('div');
  div.className = 'cymatics-fullscreen-overlay';
  div.innerHTML = '<button class="cym-fs-exit" aria-label="Exit fullscreen">✕</button>';
  document.body.appendChild(div);
  div.querySelector('.cym-fs-exit').addEventListener('click', () => exitFullscreen());
  _fullscreenOverlay = div;
  return div;
}

export async function enterFullscreen() {
  if (!STATE.canvas) return;
  const overlay = _ensureOverlay();
  _previousParent = STATE.canvas.parentElement;
  overlay.appendChild(STATE.canvas);
  STATE.canvas.classList.add('cymatics-canvas-fullscreen');
  overlay.style.display = 'block';
  STATE.fullscreen = true;
  STATE.prefs.last_used_fullscreen = true;
  _persistPrefs();
  // Try native Fullscreen API; if it fails (iOS Safari), the CSS overlay alone is the fallback.
  try {
    if (overlay.requestFullscreen) await overlay.requestFullscreen();
    else if (overlay.webkitRequestFullscreen) overlay.webkitRequestFullscreen();
  } catch {}
  _scheduleRender();
}

export async function exitFullscreen() {
  if (!STATE.fullscreen) return;
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (document.webkitFullscreenElement) document.webkitExitFullscreen();
  } catch {}
  if (_previousParent && STATE.canvas) {
    _previousParent.appendChild(STATE.canvas);
  }
  STATE.canvas.classList.remove('cymatics-canvas-fullscreen');
  if (_fullscreenOverlay) _fullscreenOverlay.style.display = 'none';
  STATE.fullscreen = false;
}

document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && STATE.fullscreen) exitFullscreen();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && STATE.fullscreen) exitFullscreen();
});
```

- [ ] **Step 2: Verify syntax**

```bash
node --check public/js/cymatics.js
```

- [ ] **Step 3: Commit**

```bash
git add public/js/cymatics.js
git commit -m "cymatics: fullscreen API with re-parent + Esc/exit handlers

Native Fullscreen API where supported; CSS overlay fallback for iOS
Safari. Same canvas re-parented between in-player and overlay so a
single render loop covers both modes.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 6.5: Add WebGL context-loss handling

**Files:**
- Modify: `public/js/cymatics.js`

- [ ] **Step 1: In `init`, attach context-loss listeners**

Modify `export function init(canvas) { ... }`. After `STATE.fftTex = ctx.fftTex;`, append:

```javascript
canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  STATE.enabled = false;
  if (STATE.rafId) cancelAnimationFrame(STATE.rafId);
  STATE.rafId = null;
  console.warn('[cymatics] WebGL context lost');
});
canvas.addEventListener('webglcontextrestored', () => {
  console.warn('[cymatics] WebGL context restored — recompiling');
  try {
    const ctx2 = _initWebGL(canvas);
    STATE.gl = ctx2.gl;
    STATE.program = ctx2.program;
    STATE.vao = ctx2.vao;
    STATE.fftTex = ctx2.fftTex;
    STATE.uniforms = ctx2.uniforms;
    if (STATE.prefs.enabled) setEnabled(true);
  } catch (err) {
    console.error('[cymatics] failed to restore', err);
  }
});
```

- [ ] **Step 2: Verify syntax**

```bash
node --check public/js/cymatics.js
```

- [ ] **Step 3: Commit**

```bash
git add public/js/cymatics.js
git commit -m "cymatics: webglcontextlost/restored handlers

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 7: UI Integration in 5do.html

### Task 7.1: Add canvas + toggle/style/fullscreen DOM

**Files:**
- Modify: `public/5do.html`

- [ ] **Step 1: Read the player section to find insertion points**

```bash
sed -n '195,295p' public/5do.html
```

- [ ] **Step 2: Add cymatics canvas inside `.thumb-viz-wrap`**

Find the line with `<canvas id="vizLeft" class="side-viz" ...>` and the closing `</div>` of `.thumb-viz-wrap` (around `5do.html:200-204`). Inside that div, add a sibling canvas:

Edit `5do.html` to replace:

```html
<canvas id="vizLeft" class="side-viz" width="32" height="280"></canvas>
<div id="statusThumb" class="status-blank"></div>
<canvas id="vizRight" class="side-viz" width="32" height="280"></canvas>
```

with:

```html
<canvas id="vizLeft" class="side-viz" width="32" height="280"></canvas>
<div class="thumb-center-stack">
  <div id="statusThumb" class="status-blank"></div>
  <canvas id="cymatics" class="cymatics-canvas" style="display:none"></canvas>
</div>
<canvas id="vizRight" class="side-viz" width="32" height="280"></canvas>
```

- [ ] **Step 3: Add toggle / style selector / fullscreen button row**

Find the closing `</div>` of the player controls section (around `5do.html:294`). Right before it, insert:

```html
<div id="cymaticsControls" class="cymatics-controls">
  <label class="gen-switch cym-toggle">
    <input id="cymaticsEnable" type="checkbox" checked>
    <span class="gen-switch-track"></span>
    <span class="cym-toggle-label" data-i18n="cym.toggle">Cymatics</span>
  </label>
  <div class="cym-style-group" role="group" aria-label="Cymatics style">
    <button class="cym-style-chip active" data-style="auto" data-i18n="cym.style.auto">Auto</button>
    <button class="cym-style-chip" data-style="chladni">Chladni</button>
    <button class="cym-style-chip" data-style="mandala">Mandala</button>
    <button class="cym-style-chip" data-style="liquid">Liquid</button>
    <button class="cym-style-chip" data-style="particle">Particle</button>
  </div>
  <button id="cymaticsFullscreen" class="cym-fs-btn" aria-label="Cymatics fullscreen">⛶</button>
</div>
```

- [ ] **Step 4: Smoke-load the page**

```bash
cd /Users/paulpark/5do-app && npm start &
SERVER_PID=$!
sleep 2
curl -sI http://localhost:10000/ | head -5
kill $SERVER_PID 2>/dev/null
```

Expected: 200 OK. (Visual verification deferred to Phase 10 smoke test page.)

- [ ] **Step 5: Commit**

```bash
git add public/5do.html
git commit -m "cymatics: add canvas, toggle, style selector, fullscreen button to player

Canvas hidden by default until JS boot wires it up.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 7.2: Add CSS for cymatics canvas, controls, fullscreen overlay

**Files:**
- Modify: `public/css/player.css`

- [ ] **Step 1: Append CSS rules**

Add to the end of `public/css/player.css`:

```css
/* ===== Cymatics Visualizer ===== */

.thumb-center-stack {
  position: relative;
  width: 280px;
  height: 280px;
}
.cymatics-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border-radius: 12px;
  pointer-events: none;
}
.thumb-viz-wrap.cymatics-active #statusThumb {
  display: none;
}
.thumb-viz-wrap.cymatics-active .cymatics-canvas {
  display: block !important;
}

.cymatics-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px 0;
  flex-wrap: wrap;
}
.cym-toggle { display: flex; align-items: center; gap: 6px; }
.cym-toggle-label {
  font-family: 'SF Pro Text', sans-serif;
  font-size: 12px;
  color: var(--text-secondary, #A0A0C0);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.cym-style-group {
  display: flex;
  gap: 4px;
  margin-left: auto;
}
.cym-style-chip {
  background: #252540;
  border: 1px solid transparent;
  color: #A0A0C0;
  font-size: 11px;
  padding: 4px 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}
.cym-style-chip.active,
.cym-style-chip:hover {
  background: #1A1A2E;
  border-color: #7C5CFC;
  color: #F0F0FF;
}
.cym-fs-btn {
  background: #252540;
  color: #F0F0FF;
  border: none;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  font-size: 16px;
  cursor: pointer;
}
.cym-fs-btn:hover { background: #2A2A45; }

.cymatics-fullscreen-overlay {
  display: none;
  position: fixed;
  inset: 0;
  z-index: 999;
  background: #000;
}
.cymatics-canvas-fullscreen {
  width: 100vw !important;
  height: 100vh !important;
  border-radius: 0 !important;
}
.cym-fs-exit {
  position: absolute;
  top: 16px;
  right: 16px;
  background: rgba(0,0,0,0.5);
  color: #F0F0FF;
  border: none;
  width: 40px;
  height: 40px;
  border-radius: 20px;
  font-size: 18px;
  cursor: pointer;
  z-index: 1000;
}
```

- [ ] **Step 2: Commit**

```bash
git add public/css/player.css
git commit -m "cymatics: CSS for canvas, controls, fullscreen overlay

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 7.3: Add subscription gate for fullscreen

**Files:**
- Modify: `public/js/subscription.js`

- [ ] **Step 1: Find where existing `canUse*` methods live**

```bash
grep -n "canUseBinaural\|canUseHarmonics\|canUseQTX" public/js/subscription.js
```

Note: the methods follow a similar pattern. Add the new method following the existing convention (likely `canUsePaid` helper).

- [ ] **Step 2: Add `canUseCymaticsFullscreen` method**

Find an existing `canUse*` method (e.g., `canUseBinaural`) and add a sibling method right after it:

```javascript
canUseCymaticsFullscreen() {
  if (!this.isLive()) return true;
  return this._canUsePaid();
},
```

(Follow the existing object-literal vs prototype style — match what's already there.)

- [ ] **Step 3: Smoke check**

```bash
node -e "import('./public/js/subscription.js').then(() => console.log('ok'))" 2>&1 || node --check public/js/subscription.js
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add public/js/subscription.js
git commit -m "subscription: add canUseCymaticsFullscreen gate

Free in pre-launch; Basic+ when SUB.isLive()=true.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 7.4: Add i18n keys

**Files:**
- Modify: `public/js/i18n.js`

- [ ] **Step 1: Find the `I18N` object**

```bash
grep -n "I18N\s*=" public/js/i18n.js | head
```

- [ ] **Step 2: Add Cymatics keys to both `ko` and `en` sections**

Locate the `ko: { ... }` block and add:

```javascript
'cym.toggle': 'Cymatics',
'cym.style.auto': '자동',
'cym.upgrade.fullscreen': 'Cymatics 전체화면은 유료 기능입니다',
```

Locate the `en: { ... }` block and add:

```javascript
'cym.toggle': 'Cymatics',
'cym.style.auto': 'Auto',
'cym.upgrade.fullscreen': 'Cymatics fullscreen is a paid feature',
```

- [ ] **Step 3: Commit**

```bash
git add public/js/i18n.js
git commit -m "i18n: cymatics labels (ko/en)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 7.5: Wire boot script in 5do.html

**Files:**
- Modify: `public/5do.html`

- [ ] **Step 1: Add module script tag at end of body**

Find the last `<script>` tag in `public/5do.html` (likely just before `</body>`). Add a new module script tag right before it:

```html
<script type="module">
  import * as Cymatics from './js/cymatics.js';
  window.Cymatics = Cymatics;

  document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('cymatics');
    const player = document.getElementById('player');
    const enableBox = document.getElementById('cymaticsEnable');
    const fsBtn = document.getElementById('cymaticsFullscreen');
    if (!canvas || !player) return;
    try {
      Cymatics.init(canvas);
    } catch (e) {
      console.warn('[cymatics] init failed; hiding controls', e);
      const ctrl = document.getElementById('cymaticsControls');
      if (ctrl) ctrl.style.display = 'none';
      return;
    }
    Cymatics.attach(player);
    const prefs = Cymatics.getPrefs();
    enableBox.checked = !!prefs.enabled;
    document.querySelectorAll('.cym-style-chip').forEach((b) => {
      b.classList.toggle('active', b.dataset.style === prefs.style);
      b.addEventListener('click', () => {
        document.querySelectorAll('.cym-style-chip').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        Cymatics.setStyle(b.dataset.style);
      });
    });
    enableBox.addEventListener('change', () => Cymatics.setEnabled(enableBox.checked));
    fsBtn.addEventListener('click', () => {
      if (window.SUB && typeof window.SUB.canUseCymaticsFullscreen === 'function') {
        if (!window.SUB.canUseCymaticsFullscreen()) {
          window.SUB.showUpgradePrompt('cymatics_fullscreen');
          return;
        }
      }
      Cymatics.enterFullscreen();
    });
    if (prefs.enabled) Cymatics.setEnabled(true);

    // On track change, fetch metadata and call loadTrack.
    // The existing track-load function is `loadAndPlay` — hook into it via a custom event we emit there.
    document.addEventListener('5do:trackchange', (ev) => {
      const { audioUrl, category, trackPreset, categoryPreset } = ev.detail || {};
      if (!audioUrl) return;
      Cymatics.loadTrack({
        audioUrl,
        category,
        trackPreset,
        categoryPreset,
        // Use the existing analyser if it's been created — desktop/Android fallback.
        analyserFactory: () => (window._viz && window._viz.analyser) ? window._viz.analyser : null
      });
    });
  });
</script>
```

- [ ] **Step 2: Find the existing track-load function and dispatch the event**

```bash
grep -n "function loadAndPlay\|setStatus.*track\|function play.*Track" public/5do.html | head
```

Identify the function that runs when a track starts playing. (Most likely `loadAndPlay` or similar.) Inside that function, after the audio's `src` is set, dispatch a custom event:

```javascript
document.dispatchEvent(new CustomEvent('5do:trackchange', {
  detail: {
    audioUrl: player.src,
    category: currentCategory,        // adjust to existing var name
    trackPreset: (window._meta && window._meta[currentCategory + '/' + trackFilename] || {}).cymatics_preset,
    categoryPreset: (window._meta && window._meta[currentCategory + '/_folder'] || {}).cymatics_preset
  }
}));
```

The exact variable names depend on the existing 5do.html — adjust to match. The implementer must locate the right place by reading the current track-loading logic.

- [ ] **Step 3: Restart dev server and load page**

```bash
cd /Users/paulpark/5do-app && npm start &
SERVER_PID=$!
sleep 2
curl -s http://localhost:10000/ | grep -c 'cymaticsControls'
kill $SERVER_PID 2>/dev/null
```

Expected: prints `1` (cymaticsControls element appears in HTML).

- [ ] **Step 4: Commit**

```bash
git add public/5do.html
git commit -m "cymatics: boot script wires init/attach/UI events + track-change hook

Listens for 5do:trackchange custom event to call Cymatics.loadTrack.
The track-loading function dispatches that event on track switch.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 8: Manual Smoke Test Page

### Task 8.1: Create the smoke test page

**Files:**
- Create: `tests/manual/cymatics-smoke.html`

- [ ] **Step 1: Create the smoke test page**

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Cymatics Smoke Test</title>
<style>
  body { margin: 0; background: #0A0A0F; color: #F0F0FF; font-family: monospace; }
  .container { display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 24px; }
  canvas { width: 480px; height: 480px; background: #000; border-radius: 12px; }
  .controls { display: flex; gap: 8px; flex-wrap: wrap; max-width: 600px; }
  button, select { background: #252540; color: #F0F0FF; border: 1px solid #2A2A45; padding: 8px 12px; border-radius: 6px; cursor: pointer; }
  .status { font-size: 12px; color: #A0A0C0; max-width: 600px; }
  audio { width: 100%; max-width: 600px; }
</style>
</head>
<body>
<div class="container">
  <h2>Cymatics Smoke Test</h2>
  <canvas id="cymatics"></canvas>

  <audio id="audio" controls crossorigin="anonymous">
    <source src="/tests/fixtures/sine_440_2s.wav" type="audio/wav">
  </audio>

  <div class="controls">
    <button id="enable">Enable</button>
    <button data-style="auto" class="style-btn">Auto</button>
    <button data-style="chladni" class="style-btn">Chladni</button>
    <button data-style="mandala" class="style-btn">Mandala</button>
    <button data-style="liquid" class="style-btn">Liquid</button>
    <button data-style="particle" class="style-btn">Particle</button>
    <button id="fs">Fullscreen</button>
  </div>

  <div class="status">
    <div>Source: <span id="srcKind">—</span></div>
    <div>Pattern: <span id="curPattern">—</span></div>
    <div>FPS: <span id="fps">—</span></div>
  </div>

  <p>Click Enable, then play the audio. Each style button switches the pattern.</p>
</div>

<script type="module">
import * as Cymatics from '/public/js/cymatics.js';

const canvas = document.getElementById('cymatics');
const audio = document.getElementById('audio');
Cymatics.init(canvas);
Cymatics.attach(audio);

document.getElementById('enable').addEventListener('click', async () => {
  await Cymatics.loadTrack({
    audioUrl: audio.currentSrc,
    category: 'Test_Category',
    trackPreset: null,
    categoryPreset: null
  });
  Cymatics.setEnabled(true);
});
document.querySelectorAll('.style-btn').forEach(b =>
  b.addEventListener('click', () => Cymatics.setStyle(b.dataset.style))
);
document.getElementById('fs').addEventListener('click', () => Cymatics.enterFullscreen());

// Status polling
setInterval(() => {
  // expose internal state via a getter we add temporarily, or just observe canvas size
  // For now, infer kind from console + manual inspection
}, 250);
</script>
</body>
</html>
```

- [ ] **Step 2: Add a static route for the smoke test page**

Edit `server.js` and find the section that serves static files. Add (just before the catch-all):

```javascript
app.use('/tests', serveStatic('tests', { fallthrough: true }));
```

- [ ] **Step 3: Run dev server, open the page**

```bash
cd /Users/paulpark/5do-app && npm run dev
```

Then visually verify in browser at `http://localhost:10000/tests/manual/cymatics-smoke.html`:
- Click Enable → cymatics canvas should animate
- Play the audio (440Hz sine for 2s) → if `.fft.json` sidecar exists at `/tests/fixtures/sine_440_2s.fft.json`, sidecar path is used; otherwise procedural/analyser
- Click each Style button → patterns visibly change
- Click Fullscreen → canvas takes over viewport

- [ ] **Step 4: Bake the fixture sidecar so the smoke page exercises the sidecar path**

```bash
node scripts/bake-fft.js tests/fixtures/sine_440_2s.wav tests/fixtures/sine_440_2s.fft.json
```

Expected: creates `tests/fixtures/sine_440_2s.fft.json`.

- [ ] **Step 5: Reload the smoke page and verify network shows sidecar fetch**

In browser DevTools Network tab, confirm a 200 for `sine_440_2s.fft.json`.

- [ ] **Step 6: Commit**

```bash
git add tests/manual/cymatics-smoke.html tests/fixtures/sine_440_2s.fft.json server.js
git commit -m "test: cymatics smoke test page + bake fixture sidecar

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 9: Real-Device Regression Tests

### Task 9.1: iOS Safari background playback regression check

**Files:** none (manual test)

- [ ] **Step 1: Deploy to a staging URL or use a Mac-tethered iPhone**

(Implementation-specific. For local dev: use `npm run dev` + ngrok or similar; or push to a staging Render deploy.)

- [ ] **Step 2: On a real iPhone with iOS Safari, open the staging URL and play any track**

Verify:
- Audio plays
- Lock the phone — audio continues
- Lock screen shows track title and play/pause
- Unlock — audio still playing, no glitch

- [ ] **Step 3: Toggle Cymatics ON, repeat lock/unlock**

Verify:
- Audio continues across lock/unlock with Cymatics ON
- Visualizer pauses when locked, resumes on unlock
- No audible click/glitch

- [ ] **Step 4: Document result**

Write a short note in the PR description with the test outcome.

### Task 9.2: Free-tier subscription gate verification

**Files:** none

- [ ] **Step 1: In the app, set `SUB._tier = 'free'` and `SUB.isLive() === true` in DevTools**

```javascript
SUB._isLive = () => true;
SUB._tier = 'free';
```

- [ ] **Step 2: Click toggle ON**

Expected: cymatics canvas appears (small mode is free).

- [ ] **Step 3: Click Fullscreen button**

Expected: upgrade prompt appears (`SUB.showUpgradePrompt('cymatics_fullscreen')` is called).

### Task 9.3: Side spectrum regression

**Files:** none

- [ ] **Step 1: Toggle Cymatics OFF**

Expected: thumbnail visible, side spectrums (`vizLeft`/`vizRight`) animate as before.

- [ ] **Step 2: Toggle Cymatics ON**

Expected: thumbnail hidden, cymatics canvas in its place, side spectrums **still animate**.

### Task 9.4: WebGL context loss simulated test

**Files:** none

- [ ] **Step 1: In DevTools, run on the cymatics canvas:**

```javascript
const ext = document.getElementById('cymatics').getContext('webgl2').getExtension('WEBGL_lose_context');
ext.loseContext();
```

Expected: console warning `[cymatics] WebGL context lost`.

- [ ] **Step 2: Restore**

```javascript
ext.restoreContext();
```

Expected: console warning `[cymatics] WebGL context restored — recompiling`, animation resumes.

---

## Phase 10: Documentation + Release Prep

### Task 10.1: Add bake-fft instructions to Track 3 CLAUDE.md

**Files:**
- Modify: `~/Projects/5do-content/CLAUDE.md` (Track 3 production workspace, separate repo/dir from 5do-app)

- [ ] **Step 1: Update Track 3 CLAUDE.md operational notes**

In the "운영 메모" section, under "트랙 음원 인코딩 파이프라인", add:

```markdown
- **FFT 사이드카 (Cymatics 비주얼라이저용)**:
  - 트랙 인코딩 후 추가 단계: `cd ~/5do-app && node scripts/bake-fft.js <input.mp3> <output.fft.json>`
  - 출력 파일은 mp3와 같은 폴더, 같은 basename + `.fft.json`
  - Supabase에 mp3와 함께 업로드. `_qtx.mp3`는 사이드카 불필요 (라이브러리 자동 필터)
  - 라이브러리 백필: `node scripts/bake-fft.js --batch <local mirror of media bucket>`
  - Optional: meta.json `<Folder>/<filename.mp3>` 또는 `<Folder>/_folder` 에 `cymatics_preset` 추가
    - 값: `chladni` | `mandala` | `liquid` | `particle`
    - 미지정 시 카테고리 기본 매핑 사용 (cymatics-patterns.js)
```

- [ ] **Step 2: Commit (Track 3 dir)**

```bash
cd ~/Projects/5do-content && git add CLAUDE.md && git status
```

(If 5do-content isn't a git repo, skip the commit — just save the file.)

### Task 10.2: Final commit message squash check

- [ ] **Step 1: Review the commit graph**

```bash
cd /Users/paulpark/5do-app && git log --oneline d719f9f..HEAD
```

Expected: one commit per task plus this plan execution. All commits are atomic, each builds on the previous.

- [ ] **Step 2: If desired, squash related commits before push**

(Optional. Only do this if explicitly requested by the user. Otherwise leave the granular history.)

### Task 10.3: Push and open PR

- [ ] **Step 1: Push the feature branch (if working on a branch) or main**

```bash
git push origin <branch-name>
```

- [ ] **Step 2: Open a PR or notify the user**

```bash
gh pr create --title "feat(cymatics): WebGL audio-reactive visualizer for track player" --body "$(cat <<'EOF'
## Summary
- Toggle-able WebGL Cymatics visualizer in track player
- 4 patterns (Chladni, Mandala, Liquid, Particle) selectable via meta.json or user override
- Pre-baked FFT sidecars preserve iOS native background playback
- Free in small mode; Basic+ for fullscreen

## Test plan
- [ ] iOS Safari: lock screen + AirPlay regression (Phase 9.1)
- [ ] Free tier: small mode works, fullscreen prompts upgrade (Phase 9.2)
- [ ] Side spectrum still animates with cymatics on/off (Phase 9.3)
- [ ] WebGL context loss recovery (Phase 9.4)
- [ ] All 4 patterns render in smoke page (Phase 8)
- [ ] Node tests pass: \`npm test\`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Plan Self-Review Notes

**Spec coverage check:** Each major spec section maps to phases:
- Architecture overview → Phase 6 (cymatics.js render loop)
- Data flow → Phase 4 (loader) + Phase 6 (texture upload)
- Fallback matrix → Phase 4 (buildSource three-way router)
- New file `cymatics.js` → Phase 6
- New file `cymatics-fft-loader.js` → Phase 4 (renamed `cymatics-loader.js` for brevity)
- New file `scripts/bake-fft.js` → Phase 2
- 5do.html modifications → Phase 7
- subscription.js additions → Phase 7.3
- player.css additions → Phase 7.2
- FFT sidecar JSON format → Phase 2
- meta.json schema additions → handled via `lookupPattern` in Phase 3 (no schema change needed; runtime reads optional field)
- Color palettes → Phase 3 (pattern catalog)
- Subscription gating → Phase 7.3 + Phase 7.5 (boot script gate check)
- Performance budget → Phase 6.2 (FPS auto-degrade, DPR cap, visibility pause)
- Testing strategy → Phases 1-4 (Node TDD), Phase 8 (manual smoke), Phase 9 (real device)

**Type/name consistency check:** Verified `lookupPattern`, `setStyle`, `setEnabled`, `enterFullscreen`, `getPrefs` are referenced consistently across tasks. `buildSource` returns `{ kind, sample }` consistently. `STATE.currentPattern` is a string key into `PATTERNS`.

**Placeholder scan:** No "TBD" or "implement later" — every step has concrete code. Two places refer the implementer to existing code that must be located by reading (boot script in 5do.html Step 2; subscription.js style in 7.3 Step 2). These are inevitable in a god-file integration; the steps tell the implementer exactly what to look for and what to do once found.
