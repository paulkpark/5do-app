import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const krLanding = readFileSync(join(ROOT, 'public/landing/index.html'), 'utf8');
const enLanding = readFileSync(join(ROOT, 'public/landing/en/index.html'), 'utf8');

// The toggle script is duplicated in both landings — extract once and verify
// its behavior against the date boundary. We re-evaluate the toggle decision
// directly here using the same constant the script uses.
const TOGGLE_END_ISO = '2026-05-29T00:00:00+09:00';
const END = new Date(TOGGLE_END_ISO);

function decideShown(now) {
  // Mirrors the script: isEarly === (now < END)
  return new Date(now) < END ? 'eb' : 'fp';
}

test('toggle: any moment before 2026-05-29 00:00 KST shows early-bird', () => {
  assert.equal(decideShown('2026-05-20T12:00:00+09:00'), 'eb');
  assert.equal(decideShown('2026-05-28T23:59:59+09:00'), 'eb');
  // Even one second before the boundary
  assert.equal(decideShown(new Date(END.getTime() - 1000)), 'eb');
});

test('toggle: at or after 2026-05-29 00:00 KST shows full price', () => {
  assert.equal(decideShown('2026-05-29T00:00:00+09:00'), 'fp');
  assert.equal(decideShown('2026-05-29T00:00:01+09:00'), 'fp');
  assert.equal(decideShown('2027-01-01T00:00:00+09:00'), 'fp');
});

test('toggle endpoint matches server FREE_TRIAL_END_ISO', async () => {
  const { FREE_TRIAL_END_ISO } = await import('../services/pricing.js');
  assert.equal(FREE_TRIAL_END_ISO, TOGGLE_END_ISO);
});

test('KR landing: both eb-only and fp-only blocks exist for every dynamic region', () => {
  // Banner — only eb-only (banner disappears after EB; no fp replacement)
  assert.match(krLanding, /class="early-banner"\s+data-eb-only/);
  // Pro price card has both variants
  const ebCount = (krLanding.match(/data-eb-only/g) || []).length;
  const fpCount = (krLanding.match(/data-fp-only/g) || []).length;
  assert.ok(ebCount >= 4, `expected >=4 data-eb-only, got ${ebCount}`);
  assert.ok(fpCount >= 3, `expected >=3 data-fp-only, got ${fpCount}`);
});

test('KR landing: fp blocks contain full prices', () => {
  // The full-price block must say ₩9,900 and ₩99,000 (the actual charges
  // computed by services/pricing.js after the early-bird window).
  const fpRegion = krLanding.split('data-fp-only').slice(1).join('');
  assert.match(fpRegion, /₩9,900/);
  assert.match(fpRegion, /₩99,000/);
});

test('KR landing: eb blocks contain early-bird prices', () => {
  const ebRegion = krLanding.split('data-eb-only').slice(1).join('');
  assert.match(ebRegion, /₩6,900/);
  assert.match(ebRegion, /₩69,000/);
});

test('KR landing: toggle script wires up the right selectors', () => {
  assert.match(krLanding, /data-fp-only/);
  assert.match(krLanding, /data-eb-only/);
  assert.match(krLanding, /new Date\('2026-05-29T00:00:00\+09:00'\)/);
});

test('EN landing: parallel structure to KR', () => {
  assert.match(enLanding, /class="early-banner"\s+data-eb-only/);
  const ebCount = (enLanding.match(/data-eb-only/g) || []).length;
  const fpCount = (enLanding.match(/data-fp-only/g) || []).length;
  assert.ok(ebCount >= 4, `EN expected >=4 data-eb-only, got ${ebCount}`);
  assert.ok(fpCount >= 3, `EN expected >=3 data-fp-only, got ${fpCount}`);
  const fpRegion = enLanding.split('data-fp-only').slice(1).join('');
  assert.match(fpRegion, /₩9,900/);
  assert.match(fpRegion, /₩99,000/);
  const ebRegion = enLanding.split('data-eb-only').slice(1).join('');
  assert.match(ebRegion, /₩6,900/);
  assert.match(ebRegion, /₩69,000/);
});
