import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// The same natal endpoints serve two products with different entitlement rules:
// a 5DO Pro subscription covers every chart, while on 5doracle.com one chart in
// one language is bought at a time. This is the security-sensitive seam of the
// whole feature, so what is asserted here is that neither product's grant can
// stand in for the other's, and that 5DO's rule did not move.

const read = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const server = read('server.js');
const sql = read('supabase-migrations/2026-09-18_natal_entitlements.sql');
const shell = read('public/natal-app/index.html');
const providers = read('public/natal-app/providers.js');
const app = read('akashic-frequency/public/natal/ui/app.js');

test('identity and entitlement are separate steps', () => {
  assert.match(server, /async function natalIdentity\(req, res\)/);
  assert.match(server, /async function natalProGrant\(userId, res\)/);
  assert.match(server, /async function natalPurchaseGrant\(userId, req, res\)/);
  // Identity must not look at entitlement, or the split is cosmetic.
  // Its own body only — the next function's doc comment is not part of it.
  const from = server.indexOf('async function natalIdentity');
  const id = server.slice(from, server.indexOf('\n}\n', from) + 2);
  assert.ok(!/isProEffective|natal_entitlements|natal_charts/.test(id),
    'natalIdentity checks entitlement, so the split is only cosmetic');
  assert.match(id, /auth\.getUser\(bearer\)/);
});

test("5DO's rule is unchanged", () => {
  const pro = server.slice(server.indexOf('async function natalProGrant'), server.indexOf('async function natalPurchaseGrant'));
  assert.match(pro, /isProEffective\(prof\.tier, prof\.subscription_status, prof\.current_period_end\)/);
  assert.match(pro, /code: 'not_granted'/);
});

test('a purchase grant is scoped to one chart in one language', () => {
  const buy = server.slice(server.indexOf('async function natalPurchaseGrant'));
  const fn = buy.slice(0, buy.indexOf('\n}\n') + 2);
  assert.match(fn, /\.eq\('user_id', userId\)/);
  assert.match(fn, /\.eq\('chart_key', chartKey\)/);
  assert.match(fn, /\.eq\('lang', lang\)/, 'ko and en are billed separately, so the grant must name one');
  assert.match(fn, /code: 'not_granted'/);
});

test('a missing chart_key or lang is rejected, not treated as a match', () => {
  const buy = server.slice(server.indexOf('async function natalPurchaseGrant'));
  const fn = buy.slice(0, buy.indexOf('\n}\n') + 2);
  const guard = fn.indexOf("lang !== 'ko'");
  const query = fn.indexOf('natal_entitlements');
  assert.ok(guard > -1 && query > -1);
  assert.ok(guard < query, 'the query runs before the arguments are validated');
});

test('neither product can borrow the other’s grant', () => {
  // The Host decides which rule runs, and each rule consults only its own
  // source of truth — so a forged Host changes what is demanded, never what is
  // granted.
  const auth = server.slice(server.indexOf('async function natalAuth(req, res, {'));
  const fn = auth.slice(0, auth.indexOf('\n}\n') + 2);
  assert.match(fn, /if \(isNatalHost\(req\)\)/);
  assert.match(fn, /natalPurchaseGrant/);
  assert.match(fn, /natalProGrant/);
  assert.ok(!/\|\|\s*await natalProGrant|natalProGrant.*\|\|/.test(fn),
    'the two grants must not be OR-ed together — they are separate products');
});

// Listing your own charts is not a paid action on 5DOracle. On 5DO it stays
// behind the subscription, because loosening it would hand lapsed subscribers
// back their saved readings.
test("reading back your own list is scope 'own', and only loosens 5DOracle", () => {
  for (const route of ["app.get('/api/natal/charts'", "app.delete('/api/natal/charts'", "app.get('/api/natal/entitlements'"]) {
    const i = server.indexOf(route);
    assert.ok(i > 0, 'route not found: ' + route);
    assert.match(server.slice(i, i + 220), /scope: 'own'/, route + " is not scope 'own'");
  }
  const auth = server.slice(server.indexOf('async function natalAuth(req, res, {'));
  const fn = auth.slice(0, auth.indexOf('\n}\n') + 2);
  const ownAt = fn.indexOf("scope === 'own'");
  const hostAt = fn.indexOf('isNatalHost(req)');
  assert.ok(hostAt > -1 && ownAt > hostAt, "scope 'own' must only apply inside the 5DOracle branch");
});

test('generating a reading is never scope own', () => {
  const i = server.indexOf("app.post('/api/natal/reading'");
  assert.ok(i > 0);
  const head = server.slice(i, i + 200);
  assert.match(head, /await natalAuth\(req, res\)/);
  assert.ok(!/scope: 'own'/.test(head), 'the paid action must demand a grant');
});

// ── the chart cap ────────────────────────────────────────────────────────
// The cap bounds what one subscription can spend. A bought chart has paid for
// itself, so counting it would refuse a customer's fourth purchase after they
// had already been charged.
test('purchased charts do not count against the three-chart cap', () => {
  assert.match(sql, /if exists \(\s*select 1 from public\.natal_entitlements e\s*where e\.user_id = new\.user_id and e\.chart_key = new\.chart_key\s*\) then\s*return new;/);
  assert.match(sql, /not exists \(\s*select 1 from public\.natal_entitlements e/);
  assert.match(sql, /if n >= 3 then/);
});

test('a replayed payment callback cannot grant twice', () => {
  assert.match(sql, /unique \(user_id, chart_key, lang\)/);
  assert.match(sql, /create unique index if not exists natal_entitlements_order_idx[\s\S]*?where order_id is not null/);
});

test('entitlements are readable by their owner and writable by nobody', () => {
  assert.match(sql, /alter table public\.natal_entitlements enable row level security/);
  assert.match(sql, /for select using \(auth\.uid\(\) = user_id\)/);
  const policies = [...sql.matchAll(/create policy[\s\S]*?for (\w+)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(policies)], ['select'],
    'a client-side insert on this table would be a free reading');
});

test('language is part of the billing unit in the schema too', () => {
  assert.match(sql, /lang\s+text not null check \(lang in \('ko','en'\)\)/);
});

// ── the client side ──────────────────────────────────────────────────────
test('the module can answer entitlement per chart, synchronously', () => {
  assert.match(app, /function canReadNow\(\)/);
  assert.match(app, /typeof e\.canRead === 'function'/);
  assert.match(app, /e\.canRead\(chartKey\(\), S\.lang\)/);
  // A throwing host callback must read as "not entitled", never as entitled.
  assert.match(app, /catch \(_\) \{ return false; \}/);
});

test('the gate copy is overridable, because "subscribe" is the wrong word here', () => {
  assert.match(app, /function gateCopy\(\)/);
  assert.match(app, /P\.entitlement && P\.entitlement\.gate/);
  assert.match(shell, /get gate\(\)/);
  // Falls back to the built-in subscription wording for 5DO.
  assert.match(app, /o\.title \|\| T\('upgradeTitle'\)/);
});

test('the owned set comes from the server, never from the client', () => {
  assert.match(providers, /fetch\('\/api\/natal\/entitlements'/);
  assert.match(providers, /export function owns\(chartKey, lang\)/);
  // A failed fetch must unlock nothing.
  const fn = providers.slice(providers.indexOf('export async function refreshOwned'));
  assert.match(fn.slice(0, 700), /owned = new Set\(\);/);
});

test('sign-in does not block the free tier', () => {
  // The chart and the tables are computed in the browser. Auth resolves after
  // the UI is mounted, so a slow session check cannot delay first use.
  const mountAt = shell.indexOf('await mountNatal(');
  const authAt = shell.indexOf('await applySession(');
  assert.ok(mountAt > -1 && authAt > -1);
  assert.ok(mountAt < authAt, 'the app waits on a session before drawing the chart');
});

test('a token refresh does not redraw the page', () => {
  assert.match(shell, /if \(was !== !!user && handle && handle\.refresh\)/,
    'redraw only on an actual change of signed-in state');
});

test('the redirect target is the canonical origin, not a literal', () => {
  // The non-canonical hosts 301, and an OAuth redirect target that moves is one
  // the provider rejects.
  assert.match(providers, /redirectTo: window\.location\.origin \+ window\.location\.pathname/);
});

// ── chart key normalisation ──────────────────────────────────────────────
// The key ties the cache, the chart row and the entitlement together. While
// only the validator trimmed, a stray space meant the grant was looked up
// untrimmed and refused: "purchase required" for a reading already paid for.
const natal = await import('../services/natal.js');

test('a chart key is normalised the same way everywhere it is read', () => {
  const raw = '  1990|6|15|12|0|37.5665|126.9780|t ';
  const direct = natal.normalizeChartKey(raw);
  const validated = natal.validateReadingTarget({ chartKey: raw, section: 5, lang: 'ko' }).chartKey;
  assert.equal(direct, validated);
  assert.equal(direct, raw.trim());
});

test('normalisation survives the values a request can actually carry', () => {
  for (const v of [null, undefined, '', '   ']) {
    assert.equal(natal.normalizeChartKey(v), '', 'unexpected for ' + JSON.stringify(v));
  }
  assert.equal(natal.normalizeChartKey(123), '123');
});

test('every place the server reads a chart key goes through it', () => {
  const reads = [...server.matchAll(/const chartKey = ([^;]+);/g)].map((m) => m[1].trim());
  assert.ok(reads.length >= 3, 'expected several chart key reads, found ' + reads.length);
  const raw = reads.filter((r) => !r.startsWith('normalizeChartKey(') && !r.startsWith('target.'));
  assert.deepEqual(raw, [], 'these read a chart key without normalising: ' + raw.join(' | '));
});
