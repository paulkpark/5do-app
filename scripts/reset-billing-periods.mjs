/* scripts/reset-billing-periods.mjs
 *
 * Resets current_period_end for Pro subscriptions whose renewals never ran, so
 * that billing resumes from the current period instead of back-charging.
 *
 * Why this exists: a Toss subscription is only charged when something POSTs
 * /api/toss/renew, and nothing in this repo schedules it. When that external
 * cron is absent, renewals stop silently — subscription_status stays 'active',
 * isProEffective() honors 'active' without consulting current_period_end, and
 * the subscriber keeps full access, is never billed, and never complains. On
 * 2026-11-02 six monthly subscribers were 42-132 days past the period they had
 * paid for, KRW 148,500 uncollected. That gap was ours, so the missed cycles
 * were written off and billing restarted from the current period.
 *
 * What it does and does not do:
 *   - writes current_period_end only, plus one subscription_events audit row
 *   - charges nothing. The charge happens when /api/toss/renew next runs, so
 *     THE CRON REGISTRATION TIME IS THE BILLING TIME. Notify subscribers first
 *     and register the cron afterwards if you want them warned before a card
 *     is touched.
 *   - touches no tier and no entitlement. Nobody gains or loses access here.
 *
 * Usage:
 *   node scripts/reset-billing-periods.mjs            # dry run (default)
 *   node scripts/reset-billing-periods.mjs --apply    # write, after backing up
 *   node scripts/reset-billing-periods.mjs --env path/to/.env
 *
 * Reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env at the repo root.
 * --apply backs the previous values up to ~/dev/5do-backups/ first; restoring
 * is a PATCH of current_period_end back to what that file records.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { billingStalledDays } from '../services/tier.js';
import { renewalAmount } from '../services/pricing.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APPLY = process.argv.includes('--apply');
const envIdx = process.argv.indexOf('--env');
const envPath = envIdx > -1 ? process.argv[envIdx + 1] : path.join(ROOT, '.env');

if (!fs.existsSync(envPath)) {
  console.error('no env file at ' + envPath + ' (pass --env <path>)');
  process.exit(1);
}
const env = Object.fromEntries(fs.readFileSync(envPath, 'utf8')
  .split('\n').filter(l => l.includes('=') && !l.trim().startsWith('#'))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));

if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('env is missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const BASE = env.SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/';
const H = {
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY,
  'Content-Type': 'application/json',
};

const now = new Date();
const nowIso = now.toISOString();
const cycleDays = (iv) => (iv === 'yearly' ? 365 : 30);
const maskEmail = (e) => (e || '').replace(/^(.{2}).*(@.*)$/, '$1***$2');

const res = await fetch(BASE + 'profiles?select=id,email,tier,subscription_status,tier_source,'
  + 'current_period_end,toss_interval,toss_billing_key&tier=eq.pro&subscription_status=eq.active', { headers: H });
if (!res.ok) {
  console.error('profile fetch failed:', res.status, (await res.text()).slice(0, 300));
  process.exit(1);
}
const rows = await res.json();

// Recomputed from the same detector the server alarms on, never a hardcoded id
// list — the set must be whatever is actually stalled at run time.
const targets = rows
  .map(p => {
    const overdue = billingStalledDays(p.tier, p.subscription_status, p.current_period_end, now);
    const interval = p.toss_interval === 'yearly' ? 'yearly' : 'monthly';
    return { p, overdue, interval, cycles: overdue ? Math.floor(overdue / cycleDays(interval)) : 0 };
  })
  .filter(t => t.overdue > 0)
  .sort((a, b) => b.overdue - a.overdue);

console.log(`mode: ${APPLY ? 'APPLY' : 'DRY RUN'}   now: ${nowIso}`);
console.log(`active pro: ${rows.length}   to reset: ${targets.length}\n`);

if (!targets.length) {
  console.log('Nothing is stalled. If renewals are still not being charged, the cron itself is the problem.');
  process.exit(0);
}

let waived = 0;
for (const t of targets) {
  waived += t.cycles * renewalAmount(t.interval);
  console.log(`  ${maskEmail(t.p.email)}`);
  console.log(`     current_period_end: ${t.p.current_period_end}  ->  ${nowIso}`);
  console.log(`     ${t.overdue}d overdue / ${t.cycles} cycle(s) waived / ${t.interval} / billingKey=${t.p.toss_billing_key ? 'OK' : 'MISSING'}`);
}
console.log(`\nwaived total: KRW ${waived.toLocaleString('en-US')}`);
console.log(`next charge: one cycle each, when /api/toss/renew first runs — monthly KRW ${renewalAmount('monthly').toLocaleString('en-US')}`);

const noKey = targets.filter(t => !t.p.toss_billing_key);
if (noKey.length) {
  console.log(`\n!! ${noKey.length} target(s) have no toss_billing_key — the cron will skip them and count them failed,`);
  console.log('   which drops them to tier=free / past_due. Handle those by hand.');
}

if (!APPLY) {
  console.log('\n(dry run — nothing written. Re-run with --apply)');
  process.exit(0);
}

const dir = path.join(os.homedir(), 'dev', '5do-backups', 'billing-period-reset-' + nowIso.slice(0, 10));
fs.mkdirSync(dir, { recursive: true });
const backup = path.join(dir, 'profiles-before.json');
fs.writeFileSync(backup, JSON.stringify(targets.map(t => ({
  id: t.p.id, email: t.p.email,
  current_period_end: t.p.current_period_end,
  tier: t.p.tier, subscription_status: t.p.subscription_status,
  tier_source: t.p.tier_source, toss_interval: t.p.toss_interval,
  overdueDays: t.overdue, waivedCycles: t.cycles,
})), null, 2));
console.log(`\nbackup -> ${backup}`);

let ok = 0, fail = 0;
for (const t of targets) {
  const u = await fetch(BASE + 'profiles?id=eq.' + encodeURIComponent(t.p.id), {
    method: 'PATCH',
    headers: { ...H, Prefer: 'return=minimal' },
    body: JSON.stringify({ current_period_end: nowIso }),
  });
  if (!u.ok) {
    console.error(`  FAIL ${t.p.id}: ${u.status} ${(await u.text()).slice(0, 200)}`);
    fail++;
    continue;
  }
  // Audit row, in the same table every other billing event lands in, so the
  // waiver is visible to whoever next wonders why a cycle is missing.
  const ev = await fetch(BASE + 'subscription_events', {
    method: 'POST',
    headers: { ...H, Prefer: 'return=minimal' },
    body: JSON.stringify({
      user_id: t.p.id,
      event_type: 'billing_period_reset',
      provider: 'admin',
      payload: {
        reason: 'renewal cron was never registered; missed cycles waived',
        previous_period_end: t.p.current_period_end,
        new_period_end: nowIso,
        overdue_days: t.overdue,
        waived_cycles: t.cycles,
        waived_krw: t.cycles * renewalAmount(t.interval),
      },
    }),
  });
  if (!ev.ok) console.warn(`  (audit row failed for ${t.p.id}: ${ev.status})`);
  ok++;
}
console.log(`\nupdated ${ok}, failed ${fail}`);
if (ok) console.log('Billing resumes the moment /api/toss/renew next runs. Nothing has been charged yet.');
