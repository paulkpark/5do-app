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

// The 72-hour trial now includes a natal reading, capped at one chart in one
// language. It used to be excluded because a reading is ~14 model calls; it is
// included as a marketing cost, and the cap is what makes that affordable. The
// page may say "every feature" again — but only while the cap is real and the
// page says what it is.
test('the trial really does include a reading', () => {
  const grant = server.slice(server.indexOf('async function natalProGrant'));
  const fn = grant.slice(0, grant.indexOf('\n}\n') + 2);
  assert.match(fn, /trialWindow\(prof\.trial_started_at\)/,
    'the natal gate ignores the trial again — the landing must stop saying every feature');
  assert.match(fn, /trialAllowsReading/);
});

test('the cap is one reading, enforced server-side', () => {
  const natal = read('services/natal.js');
  assert.match(natal, /export const TRIAL_READING_LIMIT = 1;/);
  const grant = server.slice(server.indexOf('async function natalProGrant'));
  const fn = grant.slice(0, grant.indexOf('\n}\n') + 2);
  assert.match(fn, /code: 'trial_reading_limit'/);
  // The used set has to come from the database, not from the request.
  assert.match(fn, /from\('natal_readings'\)[\s\S]*?\.eq\('user_id', userId\)/);
  assert.ok(!/req\.body\?\.used|req\.query\.used/.test(fn),
    'the cap must not be computed from anything the client sends');
});

test('a trial never gets the expensive model', () => {
  // Deep mode is Opus. The trial is affordable because its ceiling is one
  // Sonnet reading, so the flag is overridden rather than trusted.
  assert.match(server, /deep: !!deep && !req\._natalTrial/);
});

test('the landing says what the trial includes, not just that it does', () => {
  assert.match(ko, /차트 1개·1개 언어|차트 1개를 한 가지 언어/,
    'KO landing promises the reading without naming the cap');
  assert.match(en, /one chart, one language|one natal chart read end to end, in one language/,
    'EN landing promises the reading without naming the cap');
});

test('a lapsed subscriber is not let in by an old trial stamp', () => {
  const grant = server.slice(server.indexOf('async function natalProGrant'));
  const fn = grant.slice(0, grant.indexOf('\n}\n') + 2);
  // The window is checked, not merely the presence of a stamp.
  assert.match(fn, /if \(!trial\.active\)/);
  assert.match(fn, /code: 'not_granted'/);
});

test('the UI explains the cap rather than failing generically', () => {
  const app = read('akashic-frequency/public/natal/ui/app.js');
  assert.match(app, /e\.code === 'trial_reading_limit' \? T\('errTrialLimit'\)/);
  const i18n = read('akashic-frequency/public/natal/engine/i18n.js');
  assert.equal((i18n.match(/errTrialLimit:/g) || []).length, 2, 'errTrialLimit must exist in both languages');
});

test('5DO shows the controls to a trialist', () => {
  const host = read('akashic-frequency/public/index.html');
  assert.match(host, /canRead: !!\(appUser && \(appUser\.pro \|\| appUser\.trial\)\)/);
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
