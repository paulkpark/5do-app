import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { billingStalledDays, BILLING_GRACE_DAYS, isProEffective } from '../services/tier.js';
import { renewalAmount, computeProPrice } from '../services/pricing.js';

// Toss subscriptions are only charged when something POSTs /api/toss/renew, and
// nothing in this repo schedules it. When that external cron is absent the
// failure is silent in both directions: no charge is made, and the subscriber
// keeps full access because isProEffective() honors 'active' without consulting
// current_period_end. Six monthly subscribers went 42-132 days uncharged that
// way. billingStalledDays() is the detector; it must never gate access.

const NOW = new Date('2026-11-02T12:00:00+09:00');
const ago = (days) => new Date(NOW.getTime() - days * 86400000).toISOString();
const ahead = (days) => new Date(NOW.getTime() + days * 86400000).toISOString();

test('an active subscription well past its paid period is stalled', () => {
  assert.equal(billingStalledDays('pro', 'active', ago(132), NOW), 132);
  assert.equal(billingStalledDays('pro', 'active', ago(42), NOW), 42);
});

test('a current subscription is not stalled', () => {
  assert.equal(billingStalledDays('pro', 'active', ahead(206), NOW), 0);
  assert.equal(billingStalledDays('pro', 'active', ahead(1), NOW), 0);
});

test('the grace window absorbs a cron that is merely late', () => {
  // A daily cron leaves a subscription up to a day overdue in normal operation,
  // and a transient Toss failure costs a retry. Alarming on that trains people
  // to ignore the alarm.
  assert.equal(billingStalledDays('pro', 'active', ago(BILLING_GRACE_DAYS), NOW), 0);
  assert.equal(billingStalledDays('pro', 'active', ago(BILLING_GRACE_DAYS + 1), NOW), BILLING_GRACE_DAYS + 1);
});

test('only "active" can stall — the other statuses lapse visibly on their own', () => {
  // canceled/promo stop being Pro at periodEnd via isProEffective, and past_due
  // means the renew path already ran and already recorded a failure event.
  for (const status of ['canceled', 'promo', 'past_due', 'none', undefined]) {
    assert.equal(billingStalledDays('pro', status, ago(90), NOW), 0, `${status} should not be reported as stalled`);
  }
});

test('lifetime and free are out of scope', () => {
  assert.equal(billingStalledDays('pro', 'lifetime', ago(400), NOW), 0);
  assert.equal(billingStalledDays('free', 'active', ago(90), NOW), 0);
});

test('an active row with no or unusable periodEnd is not reported', () => {
  // Manual/legacy grants have nothing to charge against, so there is no missed
  // renewal to find. Reporting them would be noise, not signal.
  for (const v of [null, undefined, '', 'not-a-date']) {
    assert.equal(billingStalledDays('pro', 'active', v, NOW), 0);
  }
});

test('detection never changes entitlement', () => {
  // The whole point is that access is a business decision and this is a clock
  // reading. If these two ever disagree about what to DO, the bug is here.
  const end = ago(132);
  assert.equal(billingStalledDays('pro', 'active', end, NOW), 132);
  assert.equal(isProEffective('pro', 'active', end, NOW), true,
    'the stall detector must not have started revoking Pro access');
});

test('renewalAmount is the full price, never the early-bird rate', () => {
  assert.equal(renewalAmount('monthly'), 9900);
  assert.equal(renewalAmount('yearly'), 99000);
  assert.throws(() => renewalAmount('weekly'));
  // Before the early-bird deadline a *signup* was discounted; a renewal was not.
  const earlyNow = new Date('2026-05-01T00:00:00+09:00');
  assert.equal(computeProPrice('monthly', earlyNow).amount, 6900);
  assert.equal(renewalAmount('monthly'), 9900);
});

test('the inline renewal price in server.js still agrees with renewalAmount', () => {
  // /api/toss/renew keeps these numbers inline because that code charges live
  // cards. Pin them so the duplicate cannot drift in silence.
  const src = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  const m = src.match(/const amount = interval === 'yearly' \? (\d+) : (\d+);/);
  assert.ok(m, 'the renewal charge line moved — re-pin it against renewalAmount()');
  assert.equal(Number(m[1]), renewalAmount('yearly'));
  assert.equal(Number(m[2]), renewalAmount('monthly'));
});

test('the alarm is actually wired into boot and an admin route', () => {
  // This failed for four months because nothing looked. A detector nobody calls
  // reproduces exactly that.
  const src = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  assert.match(src, /async function auditBillingHealth\(\)/);
  assert.match(src, /app\.get\('\/api\/admin\/billing-health'/);
  assert.match(src, /x-admin-key/);
  const listen = src.slice(src.indexOf('app.listen(PORT'));
  assert.match(listen, /auditBillingHealth\(\)/, 'boot does not run the billing audit');
  assert.match(listen, /\.catch\(/, 'a failing audit must not take down boot');
});
