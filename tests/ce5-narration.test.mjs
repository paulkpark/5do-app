import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// The guided-meditation app schedules each step from its narration clip's own
// length. HTMLMediaElement.duration reports the INTRINSIC length and does not
// change with playbackRate, so slowing the voice without also slowing those
// readings advances the step on the original schedule and cuts the narration
// off mid-sentence. The rate and the duration maths have to move together —
// that coupling is what this file guards.

const src = fs.readFileSync(new URL('../ce5-protocol/public/index.html', import.meta.url), 'utf8');

test('the narration rate is a single named constant', () => {
  const m = src.match(/const NARRATION_RATE = ([\d.]+);/);
  assert.ok(m, 'NARRATION_RATE is gone — re-point this test');
  const rate = Number(m[1]);
  assert.ok(rate > 0 && rate <= 1, `NARRATION_RATE ${rate} is out of range`);
  assert.equal((src.match(/const NARRATION_RATE/g) || []).length, 1, 'declared more than once');
});

test('the voice is not time-stretched far enough to slur', () => {
  // 0.5 shipped, and the report back was that the narrator sounded drunk.
  // Pitch correction does not save it: at that rate the formants smear and
  // what you hear is the processing. Slowness belongs in the PAUSES.
  const rate = Number(src.match(/const NARRATION_RATE = ([\d.]+);/)[1]);
  assert.ok(rate >= 0.85, `NARRATION_RATE ${rate} is slow enough to slur the voice`);
});

test('the unhurried feel comes from the pause, not the playback', () => {
  const m = src.match(/const NARRATION_PACE = ([\d.]+);/);
  assert.ok(m, 'NARRATION_PACE is gone — slowness has nowhere to live but the voice');
  const pace = Number(m[1]);
  assert.ok(pace >= 1, `NARRATION_PACE ${pace} < 1 would cut the narration off`);
  assert.ok(pace <= 3, `NARRATION_PACE ${pace} leaves more silence than speech`);
  // A step is still longer than the clip, which is the whole point.
  const rate = Number(src.match(/const NARRATION_RATE = ([\d.]+);/)[1]);
  assert.ok(pace / rate > 1.2, 'a step is no longer than the voice that fills it');
});

test('every step timing is divided by the rate', () => {
  // If a helper returns a.duration directly again, the voice gets cut off.
  assert.match(src, /function narrationSeconds\(a, fallback, name\)[\s\S]{0,300}\/ NARRATION_RATE/);
  const helpers = [...src.matchAll(/function get(?:Breath|Audio)Duration\([^)]*\) \{[\s\S]{0,320}?\n  \}/g)];
  assert.equal(helpers.length, 3, `expected 3 duration helpers, found ${helpers.length}`);
  for (const h of helpers) {
    assert.match(h[0], /return narrationSeconds\(a, fallback, name\);/,
      'a duration helper returns the intrinsic length again');
    assert.doesNotMatch(h[0], /\?\s*a\.duration\s*:/, 'raw a.duration is back');
  }
});

test('the rate is applied to every narration clip, cached and direct', () => {
  // Two creation sites: the preload cache, and CTS which builds its own.
  const sites = [...src.matchAll(/new Audio\([^)]*\)/g)].length;
  assert.ok(sites >= 2, 'narration clip construction moved');
  assert.match(src, /a\.preload = 'auto';\n\s*applyNarrationRate\(a, f\);/, 'cached clips are not slowed');
  assert.match(src, /const audio = new Audio\(`audio\/cts[\s\S]{0,80}applyNarrationRate\(audio\);/,
    'the CE-5 protocol narration is not slowed');
});

test('slowing the voice must not drop its pitch', () => {
  // Without preservesPitch, 0.5x turns the narrator into a growl.
  const fn = src.slice(src.indexOf('function applyNarrationRate'), src.indexOf('function narrationSeconds'));
  assert.match(fn, /a\.preservesPitch = true/);
  assert.match(fn, /webkitPreservesPitch = true/, 'Safari has shipped this off');
});

test("Deep Field's music is not slowed", () => {
  // It loads from DF_MEDIA_BASE and never passes through the narration cache.
  // Halving a soundtrack would be a different, unasked-for change.
  const df = src.slice(src.indexOf('const playTrack ='), src.indexOf('const playTrack =') + 600);
  assert.doesNotMatch(df, /applyNarrationRate|NARRATION_RATE/);
});

// ── back navigation ───────────────────────────────────────────────────────

test('every running programme can get back to the library', () => {
  // Reported from the app as "there is no back button". There was one, but it
  // was a bare 13px arrow AND it was rendering black-on-black, because
  // .sub-nav button takes --text-secondary and that token was in a var() cycle.
  const backs = [...src.matchAll(/className="back"[^>]*onClick=\{\(\) => setStage\('library'\)\}/g)];
  assert.equal(backs.length, 4, `expected a back button on 4 stages, found ${backs.length}`);
});

test('the back button is labelled, not a bare glyph', () => {
  assert.match(src, /className="back"[\s\S]{0,140}&#8592;\s*\{lang === 'ko' \? '라이브러리' : 'Library'\}/);
  const css = src.slice(src.indexOf('.sub-nav .back {'), src.indexOf('.sub-nav .back:hover'));
  assert.match(css, /min-height:40px/, 'the target is too small to hit');
  assert.match(css, /color:var\(--text-primary\)/, 'the label must not depend on a dim token');
});

test('the breath counts keep their recorded speed', () => {
  // getAction() fires one count per second and playCount() calls
  // stopAllVoices() first, so a stretched count is cut off after a beat. At
  // 0.3 that leaves the first syllable of "하나" and nothing else. They are
  // the metronome, not narration.
  assert.match(src, /function isCountCue\(name\)[\s\S]{0,120}\/\^count\\d\//);
  const fn = src.slice(src.indexOf('function applyNarrationRate'), src.indexOf('function narrationSeconds'));
  assert.match(fn, /if \(isCountCue\(name\)\) return;/, 'count cues would be slowed');
  assert.match(src, /applyNarrationRate\(a, f\);/, 'the clip name is not passed, so the guard cannot fire');
  assert.match(src, /return isCountCue\(name\) \? d : \(d \/ NARRATION_RATE\) \* NARRATION_PACE;/);
});

test('every duration helper passes the clip name through', () => {
  // Without the name, narrationSeconds() cannot tell a count from prose.
  const calls = [...src.matchAll(/return narrationSeconds\(a, fallback(?:, name)?\);/g)].map((m) => m[0]);
  assert.equal(calls.length, 3);
  for (const c of calls) assert.match(c, /, name\);$/, `"${c}" drops the name`);
});
