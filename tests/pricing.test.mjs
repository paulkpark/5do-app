import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeProPrice, customerKeyFor, FREE_TRIAL_END_ISO } from '../services/pricing.js';

// Anchor dates around the early-bird boundary so tests are deterministic.
const inTrial   = new Date('2026-05-20T12:00:00+09:00'); // before 2026-05-29
const lastTrial = new Date('2026-05-28T23:59:59+09:00'); // last second of trial
const postTrial = new Date('2026-05-29T00:00:00+09:00'); // exact cutoff → not early-bird
const wayLater  = new Date('2027-01-01T00:00:00+09:00');

test('computeProPrice: monthly early-bird', () => {
  const { amount, orderName } = computeProPrice('monthly', inTrial);
  assert.equal(amount, 6900);
  assert.match(orderName, /월간/);
  assert.match(orderName, /얼리버드/);
});

test('computeProPrice: yearly early-bird', () => {
  const { amount, orderName } = computeProPrice('yearly', inTrial);
  assert.equal(amount, 69000);
  assert.match(orderName, /연간/);
  assert.match(orderName, /얼리버드/);
});

test('computeProPrice: last second of trial is still early-bird', () => {
  assert.equal(computeProPrice('monthly', lastTrial).amount, 6900);
  assert.equal(computeProPrice('yearly',  lastTrial).amount, 69000);
});

test('computeProPrice: cutoff moment is post-trial (full price)', () => {
  assert.equal(computeProPrice('monthly', postTrial).amount, 9900);
  assert.equal(computeProPrice('yearly',  postTrial).amount, 99000);
});

test('computeProPrice: long after trial → full price, no early-bird suffix', () => {
  const m = computeProPrice('monthly', wayLater);
  assert.equal(m.amount, 9900);
  assert.doesNotMatch(m.orderName, /얼리버드/);
  const y = computeProPrice('yearly', wayLater);
  assert.equal(y.amount, 99000);
  assert.doesNotMatch(y.orderName, /얼리버드/);
});

test('computeProPrice: invalid interval throws', () => {
  assert.throws(() => computeProPrice('weekly',  inTrial), /interval/);
  assert.throws(() => computeProPrice('',        inTrial), /interval/);
  assert.throws(() => computeProPrice(undefined, inTrial), /interval/);
  assert.throws(() => computeProPrice('MONTHLY', inTrial), /interval/); // case-strict
});

test('customerKeyFor: matches client-side formula (dashes stripped, first 20 chars)', () => {
  // Mirrors public/js/subscription.js: 'cust_' + user.id.replace(/-/g, '').substring(0, 20)
  const uid = 'cce9ff73-6c1d-4b23-8707-ea6f93a01073';
  assert.equal(customerKeyFor(uid), 'cust_cce9ff736c1d4b238707');
});

test('customerKeyFor: short userId (no dashes) passes through, padded by substring semantics', () => {
  assert.equal(customerKeyFor('abc'), 'cust_abc');
});

test('customerKeyFor: throws on falsy userId (defensive)', () => {
  assert.throws(() => customerKeyFor(''),        /userId/);
  assert.throws(() => customerKeyFor(null),      /userId/);
  assert.throws(() => customerKeyFor(undefined), /userId/);
});

test('FREE_TRIAL_END_ISO matches subscription.js anchor', () => {
  // Sanity: keep this constant in sync with public/js/subscription.js FREE_TRIAL_END.
  assert.equal(FREE_TRIAL_END_ISO, '2026-05-29T00:00:00+09:00');
});
