import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isProEffective } from '../services/tier.js';

const NOW = new Date('2026-06-15T12:00:00+09:00');
const FUTURE = new Date('2026-07-15T12:00:00+09:00');
const PAST   = new Date('2026-05-15T12:00:00+09:00');

test('active Pro → true', () => {
  assert.equal(isProEffective('pro', 'active', FUTURE.toISOString(), NOW), true);
  assert.equal(isProEffective('pro', 'active', null,                    NOW), true);
});

test('lifetime → true regardless of periodEnd', () => {
  assert.equal(isProEffective('pro', 'lifetime', null,                   NOW), true);
  assert.equal(isProEffective('pro', 'lifetime', PAST.toISOString(),     NOW), true);
});

test('canceled within paid period → STILL Pro (the bug fix)', () => {
  // This is the "Keep current_period_end so they can use until it expires"
  // promise the server cancel handler makes. Without the fix, isPro returned
  // false the moment the user clicked cancel, breaking that promise.
  assert.equal(isProEffective('pro', 'canceled', FUTURE.toISOString(), NOW), true);
});

test('canceled past period end → not Pro', () => {
  assert.equal(isProEffective('pro', 'canceled', PAST.toISOString(), NOW), false);
});

test('canceled with null periodEnd → not Pro (defensive)', () => {
  // A canceled row missing periodEnd is malformed; we can't honor the
  // grace window, so revert to Free behavior.
  assert.equal(isProEffective('pro', 'canceled', null,      NOW), false);
  assert.equal(isProEffective('pro', 'canceled', undefined, NOW), false);
  assert.equal(isProEffective('pro', 'canceled', '',        NOW), false);
});

test('tier=free is never Pro regardless of status', () => {
  assert.equal(isProEffective('free', 'active',   FUTURE.toISOString(), NOW), false);
  assert.equal(isProEffective('free', 'lifetime', null,                 NOW), false);
  assert.equal(isProEffective('free', 'canceled', FUTURE.toISOString(), NOW), false);
});

test('past_due → not Pro (treat like cancellation without grace)', () => {
  // past_due means a renewal charge failed; gate the Pro features until
  // the customer fixes payment. Same behavior whether periodEnd is past
  // or future — Toss billing is broken either way.
  assert.equal(isProEffective('pro', 'past_due', FUTURE.toISOString(), NOW), false);
  assert.equal(isProEffective('pro', 'past_due', PAST.toISOString(),   NOW), false);
});

test('none / undefined status → not Pro', () => {
  assert.equal(isProEffective('pro', 'none',      FUTURE.toISOString(), NOW), false);
  assert.equal(isProEffective('pro', undefined,   FUTURE.toISOString(), NOW), false);
});

test('exact period-end moment → not Pro (canceled grace is exclusive)', () => {
  // If now === periodEnd, the paid period has just ended.
  const exact = '2026-06-15T12:00:00+09:00';
  assert.equal(isProEffective('pro', 'canceled', exact, NOW), false);
});
