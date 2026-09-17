import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { computeProPrice } from '../services/pricing.js';

// These pin four holes an audit found. Each is the kind that fails open — the
// app keeps working while the protection is gone — so they are asserted against
// the source rather than left to a future reader to notice.

const read = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const server = read('server.js');
const api = read('akashic-frequency/api.js');
const sub = read('public/js/subscription.js');

test('profiles has no client UPDATE policy, and the column grant is narrow', () => {
  const mig = read('supabase-migrations/2026-09-18_profiles_rls_lockdown.sql');
  assert.match(mig, /drop policy if exists "Users update own profile" on public\.profiles/);
  assert.match(mig, /revoke update on public\.profiles from authenticated/);
  // Entitlement columns must not appear in what is granted back.
  const granted = /grant update \(([^)]*)\) on public\.profiles/.exec(mig)[1];
  for (const col of ['tier', 'subscription_status', 'current_period_end', 'trial_started_at', 'stripe_customer_id']) {
    assert.ok(!granted.includes(col), `${col} must stay unwritable from the browser`);
  }
});

test('the Anthropic proxy requires a signed-in caller and caps max_tokens', () => {
  // Without this the URL alone is a free Claude endpoint on our key.
  assert.match(api, /userIdFromRequest\(req\)/);
  assert.match(api, /if \(!userId\) return res\.status\(401\)/);
  const call = /max_tokens: [^,]+,/.exec(api)[0];
  assert.match(call, /Math\.min\(/, 'caller-supplied max_tokens must be clamped: ' + call);
});

test('billing endpoints take the caller from the token, never from the body', () => {
  for (const route of ["'/api/subscription/portal'", "'/api/toss/cancel'"]) {
    const i = server.indexOf('app.post(' + route);
    assert.ok(i > 0, route + ' not found');
    const body = server.slice(i, i + 1200);
    assert.match(body, /userIdFromRequest\(req\)/, route + ' must derive the caller from the token');
    assert.ok(!/const \{ user_id \} = req\.body/.test(body),
      route + ' must not read user_id from the body');
  }
});

test('the client sends a bearer token on billing calls', () => {
  assert.match(sub, /async function _authHeaders\(\)/);
  assert.match(sub, /Authorization = 'Bearer '/);
  for (const url of ['/api/subscription/portal', '/api/toss/cancel']) {
    const i = sub.indexOf(url);
    const call = sub.slice(i, i + 300);
    assert.match(call, /headers: await _authHeaders\(\)/, url + ' must carry the token');
    assert.ok(!/user_id: user\.id/.test(call), url + ' must not send a user_id the server would trust');
  }
});

test('a one-time Toss payment grants the period its amount paid for', () => {
  const i = server.indexOf("app.get('/api/toss/payment-success'");
  const body = server.slice(i, server.indexOf("app.post('/api/toss/cancel'"));
  // The interval must be derived from the confirmed amount, not the redirect.
  assert.match(body, /computeProPrice\(iv\)\.amount === paid/);
  assert.match(body, /if \(paidInterval === 'yearly'\)/);
  assert.ok(!/if \(interval === 'yearly'\)/.test(body),
    'the granted period must not follow the query string');
  // And an amount matching no price is refused rather than guessed at.
  assert.match(body, /if \(!paidInterval\)[\s\S]{0,200}redirect/);
});

test('the two prices are distinguishable, or deriving the interval would be ambiguous', () => {
  assert.notEqual(computeProPrice('monthly').amount, computeProPrice('yearly').amount);
});
