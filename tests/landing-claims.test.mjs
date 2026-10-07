import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// The landing is a conversion page, so what it promises has to be what the app
// actually does. Two things had drifted: the catalogue had grown past the
// numbers on the page, and the trial was advertised as opening every feature
// when the natal reading's AI interpretation is gated separately, server-side.

const read = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const ko = read('public/landing/index.html');
const en = read('public/landing/en/index.html');
const sub = read('public/js/subscription.js');
const server = read('server.js');

test('neither landing still quotes the old catalogue size', () => {
  // 150+ tracks / 12 categories understated a library that is now 203 tracks
  // across 16 user-facing folders (underscore-prefixed folders are internal and
  // hidden by supabase-api.js).
  for (const [name, src] of [['ko', ko], ['en', en]]) {
    assert.equal((src.match(/150\+/g) || []).length, 0, name + ' still says 150+');
    assert.equal((src.match(/12 카테고리|12개 카테고리|12 categories/g) || []).length, 0,
      name + ' still says 12 categories');
  }
});

test('both landings agree on the catalogue size', () => {
  const counts = (src) => ({
    tracks: [...new Set([...src.matchAll(/(\d{3})\+?\s*(?:트랙|곡|tracks)/g)].map((m) => m[1]))].sort(),
    cats: [...new Set([...src.matchAll(/(\d{2})\s*(?:개 카테고리|카테고리|categories)/g)].map((m) => m[1]))].sort(),
  });
  const a = counts(ko), b = counts(en);
  assert.deepEqual(a.tracks, ['200'], 'ko track counts: ' + a.tracks);
  assert.deepEqual(b.tracks, ['200'], 'en track counts: ' + b.tracks);
  assert.deepEqual(a.cats, ['16'], 'ko category counts: ' + a.cats);
  assert.deepEqual(b.cats, ['16'], 'en category counts: ' + b.cats);
});

// The 72-hour trial opens every client-side gate (categories, binaural,
// harmonics, WAV, presets, playlists, Soul Code, QTX, cymatics fullscreen) —
// but NOT the natal reading, which the server gates on isProEffective() while a
// trial leaves tier at 'free'. That exclusion is deliberate: a reading costs
// real money per section. So the page must not promise "every feature".
test('the trial is not advertised as opening everything', () => {
  assert.equal((ko.match(/모든 기능/g) || []).length, 0,
    'KO landing promises 모든 기능 for the trial');
  assert.equal((en.match(/every feature/gi) || []).length, 0,
    'EN landing promises every feature for the trial');
});

test('the exclusion the trial actually has is still true of the code', () => {
  // If this stops holding, the landing copy should be loosened back — this test
  // exists so the copy and the gate are changed together.
  assert.match(sub, /_trialActive\(\)\s*\{/);
  const grant = server.slice(server.indexOf('async function natalProGrant'));
  assert.match(grant.slice(0, 600), /isProEffective/,
    'the natal gate no longer uses isProEffective; revisit the landing copy');
  assert.ok(!/_trialActive|trial/i.test(grant.slice(0, 600)),
    'the natal gate now honours the trial — the landing may say every feature again');
});

test('the landing names the exclusion where it makes the promise', () => {
  assert.match(ko, /천궁도[^<]*AI 해석[^<]*Pro 전용|천궁도 AI 해석 제외/,
    'KO landing never says the natal interpretation is excluded');
  assert.match(en, /natal chart&rsquo;s AI interpretation/,
    'EN landing never says the natal interpretation is excluded');
});

// Shipped in the generator but missing from both pages, including the plan
// table a buyer compares before paying.
test('carrier modulation appears on both landings', () => {
  assert.match(ko, /반송파/, 'KO landing does not mention the carrier');
  assert.match(ko, /7\.83Hz/, 'the concrete example is what makes it land');
  assert.match(en, /carrier/i, 'EN landing does not mention the carrier');
  // and in the Pro column, not only in prose
  assert.match(ko, /반송파 변조 · WAV 내보내기/);
  assert.match(en, /carrier modulation · WAV export/);
});

test('the generator really has the carrier controls the landing claims', () => {
  // Checked against the markup rather than a guess at key names: the page sells
  // these four controls by name, so they have to exist.
  const app = read('public/5do.html');
  for (const id of ['carrierEnable', 'carrierFreq', 'carrierDepth', 'carrierMode', 'carrierDuty']) {
    assert.match(app, new RegExp('id="' + id + '"'), 'landing claims a control the app lacks: ' + id);
  }
  // AM and ring modulation are both named on the page.
  assert.match(app, /value="am"/);
  assert.match(app, /value="ring"/);
});
