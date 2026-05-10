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
  assert.equal(json.frames.length, 60);
  assert.equal(json.frames[0].length, 32);
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
