import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// The bundled ephemeris carries a moment-timezone snapshot of IANA tzdata 2019b.
// Its Asia/Seoul entry has the 1955-60 UTC+8:30 era and the 1987-88 daylight
// saving, but no daylight saving at all for 1948-51 — a period tzdata gained
// after that snapshot. Births in those summers resolved an hour early, which for
// Seoul noon on 1948-06-15 put the ascendant in Leo instead of Virgo: a
// different sign, so a different reading top to bottom.
//
// chart.js corrects it by trusting the platform's tz database over the bundle's.
// These tests are the reason to trust that: they check the engine against the
// platform across every offset era Korea has had, and across other zones to show
// the correction is inert where the snapshot was already right.

let chart;

before(async () => {
  const src = fs.readFileSync(new URL('../akashic-frequency/public/vendor/cnh.js', import.meta.url), 'utf8');
  const ctx = { console, Math, Date, JSON, parseInt, parseFloat, isNaN, Intl, RegExp, Error, Object, Array, String, Number, Boolean, TypeError };
  ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  chart = await import('../akashic-frequency/public/natal/engine/chart.js');
  chart.setEphemeris(ctx.CNH);
});

// Independent of chart.js: brute-force the offset that makes a wall time
// round-trip in a zone. Comparing minutes as well as hours matters — omitting
// that matched an offset 45 minutes out while writing this.
function platformUtc(tz, y, m, d, hh = 12, mm = 0) {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
  for (let off = -14 * 60; off <= 14 * 60; off += 15) {
    const utc = Date.UTC(y, m - 1, d, hh, mm) - off * 60000;
    const p = f.formatToParts(new Date(utc)).reduce((a, x) => (a[x.type] = x.value, a), {});
    if (+p.year === y && +p.month === m && +p.day === d && +p.hour === hh && +p.minute === mm) {
      return { utc, offsetMin: off };
    }
  }
  return null;
}

const SEOUL = { lat: 37.5665, lon: 126.978, placeLabel: 'Seoul' };
const at = (y, m, d, place = SEOUL, hour = 12) =>
  chart.build({ year: y, month: m, date: d, hour, minute: 0, timeUnknown: false, ...place });

test("every era of Korea's offset history resolves the way the platform says", () => {
  // 1948-51 DST (+10), 1954-61 standard UTC+8:30 with DST (+9:30), 1987-88 DST
  // (+10), and plain +9 on either side of all of it.
  const years = [1945, 1948, 1949, 1950, 1951, 1952, 1954, 1955, 1957, 1959,
    1960, 1961, 1962, 1970, 1986, 1987, 1988, 1989, 1990, 2000, 2026];
  const wrong = [];
  for (const y of years) {
    for (const [m, d] of [[6, 15], [1, 15]]) {
      const want = platformUtc('Asia/Seoul', y, m, d);
      if (!want) continue;
      const got = new Date(at(y, m, d).meta.utc).getTime();
      if (got !== want.utc) {
        wrong.push(`${y}-${String(m).padStart(2, '0')}-15 off by ${(got - want.utc) / 60000}min`);
      }
    }
  }
  assert.deepEqual(wrong, []);
});

test('the 1948-51 summers specifically are UTC+10, not UTC+9', () => {
  for (const y of [1948, 1949, 1950, 1951]) {
    const c = at(y, 6, 15);
    const utc = new Date(c.meta.utc);
    assert.equal(utc.getUTCHours(), 2, `${y} summer should resolve noon KDT to 02:00Z`);
    assert.equal(utc.getUTCMinutes(), 0);
  }
  // Winter in the same years is plain +9 and must not be shifted.
  for (const y of [1948, 1951]) {
    assert.equal(new Date(at(y, 1, 15).meta.utc).getUTCHours(), 3, `${y} winter should stay UTC+9`);
  }
});

test('the hour matters: it moves the ascendant into another sign', () => {
  // This is why the bug was worth fixing rather than documenting. Noon on
  // 1948-06-15 in Seoul is 02:00Z; the uncorrected engine used 03:00Z, which is
  // the same as asking for 11:00 wall time.
  const fixed = at(1948, 6, 15);
  const asIfUncorrected = at(1948, 6, 15, SEOUL, 11);
  const ascOf = (c) => c.points.find((p) => p.key === 'asc');
  assert.notEqual(ascOf(fixed).signIndex, ascOf(asIfUncorrected).signIndex,
    'if these matched, the correction would be cosmetic');
});

test('the local time on the chart is still what was entered', () => {
  // The correction shifts only what the ephemeris is handed. A chart that told
  // the user a birth time they did not give would be a worse bug than the one
  // being fixed.
  const c = at(1948, 6, 15);
  assert.match(c.meta.local, /^1948-06-15 12:00/);
  assert.equal(c.meta.tz, 'Asia/Seoul');
});

test('zones the snapshot already had right are untouched', () => {
  const places = [
    ['America/New_York', 1970, 6, 15, 40.7128, -74.006],
    ['Europe/London', 1968, 6, 15, 51.5074, -0.1278],     // British Standard Time, +1 all year
    ['Asia/Tokyo', 1950, 6, 15, 35.6762, 139.6503],       // Japan also had 1948-51 DST
    ['Europe/Amsterdam', 1940, 6, 15, 52.3676, 4.9041],
    ['America/Sao_Paulo', 1990, 1, 15, -23.5505, -46.6333],
    ['Australia/Sydney', 2000, 1, 15, -33.8688, 151.2093],
  ];
  const wrong = [];
  for (const [tz, y, m, d, lat, lon] of places) {
    const want = platformUtc(tz, y, m, d);
    const got = new Date(at(y, m, d, { lat, lon, placeLabel: tz }).meta.utc).getTime();
    if (!want || got !== want.utc) wrong.push(`${tz} ${y}: ${want ? (got - want.utc) / 60000 + 'min' : 'no reference'}`);
  }
  assert.deepEqual(wrong, []);
});

// ── the wall-time resolver ───────────────────────────────────────────────
test('wallToUtc agrees with a brute-force search', () => {
  const cases = [
    ['Asia/Seoul', 1948, 6, 15], ['Asia/Seoul', 1957, 6, 15], ['Asia/Seoul', 1988, 6, 15],
    ['Asia/Seoul', 2026, 1, 15], ['America/New_York', 1970, 6, 15], ['Europe/London', 1968, 6, 15],
    ['Pacific/Kiritimati', 1994, 6, 15],   // +14, and it skipped a whole day in 1994
    ['Asia/Kathmandu', 1990, 6, 15],       // +5:45, a non-hour offset
  ];
  for (const [tz, y, m, d] of cases) {
    const want = platformUtc(tz, y, m, d);
    assert.ok(want, 'no reference for ' + tz);
    assert.equal(chart.wallToUtc(tz, y, m, d, 12, 0), want.utc, `${tz} ${y}-${m}-${d}`);
  }
});

test('wallToUtc handles a spring-forward gap without looping or throwing', () => {
  // 02:30 on 2026-03-08 does not exist in New York. Any answer is arguable; not
  // returning one is not.
  const ms = chart.wallToUtc('America/New_York', 2026, 3, 8, 2, 30);
  assert.ok(Number.isFinite(ms));
  assert.equal(new Date(ms).getUTCFullYear(), 2026);
});

// ── the guard ────────────────────────────────────────────────────────────
test('the shift is bounded, so a tz database we disagree with cannot corrupt a chart', () => {
  // A browser with its own wrong pre-1970 data would otherwise be trusted into
  // making a correct chart wrong. Only quantised, small differences are applied.
  const src = fs.readFileSync(new URL('../akashic-frequency/public/natal/engine/chart.js', import.meta.url), 'utf8');
  const fn = src.slice(src.indexOf('function mkOrigin(o) {'));
  assert.match(fn, /diff % 900000 !== 0 \|\| Math\.abs\(diff\) > 2 \* 3600000/,
    'the correction must refuse differences that are not a small multiple of 15 minutes');
  assert.match(fn, /for \(var i = 0; i < 3; i\+\+\)/, 'the fixed-point loop must be bounded');
});

test('no tz database at all falls back to the library rather than failing', () => {
  const src = fs.readFileSync(new URL('../akashic-frequency/public/natal/engine/chart.js', import.meta.url), 'utf8');
  const fn = src.slice(src.indexOf('function mkOrigin(o) {'));
  assert.match(fn, /typeof Intl === 'undefined'/);
  assert.match(fn, /catch \(_\) \{\s*return org;/);
});
