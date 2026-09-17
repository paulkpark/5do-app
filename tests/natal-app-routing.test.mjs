import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// The standalone natal app (5DOracle) is served from the same server as 5DO,
// picked by Host header. The risk this file guards is quiet rather than loud:
// the SPA fallback ends in `sendFile(5DO landing)` as a DEFAULT, not a 404, so
// a domain pointed here but missing from NATAL_HOSTS serves the 5DO landing
// page and nothing errors.

const read = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const server = read('server.js');
const shell = read('public/natal-app/index.html');

test('the host list is configuration, not a hardcoded domain', () => {
  // The domain was still undecided when this shipped; it must be settable
  // without a code change.
  assert.match(server, /process\.env\.NATAL_HOSTS/);
  assert.match(server, /function isNatalHost\(req\)/);
});

test('an unset NATAL_HOSTS changes nothing about 5DO', () => {
  const m = server.match(/const NATAL_HOSTS = new Set\(([\s\S]*?)\);/);
  assert.ok(m, 'NATAL_HOSTS not found');
  // Empty string → split(',') → [''] → filtered out → empty set.
  const hosts = new Set(('').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean));
  assert.equal(hosts.size, 0);
  assert.match(m[1], /filter\(Boolean\)/, 'an empty env would leave a blank host in the set');
});

test('both the home route and the SPA fallback branch on the host', () => {
  const home = server.slice(server.indexOf("app.get('/', (req, res)"));
  assert.match(home.slice(0, 600), /isNatalHost\(req\)/,
    'GET / does not branch to the natal app');
  const fallback = server.slice(server.indexOf("app.get('*', (req, res, next)"));
  assert.match(fallback.slice(0, 900), /isNatalHost\(req\)/,
    'the SPA fallback does not branch to the natal app');
});

// /en and /us answered on every host, so the natal domain would have served
// the 5DO English landing page at those paths.
test('the /en and /us aliases are host-guarded', () => {
  const alias = server.match(/app\.get\(\['\/en', '\/us'\][\s\S]{0,320}/);
  assert.ok(alias, '/en alias route not found');
  assert.match(alias[0], /isNatalHost\(req\)/, '/en is not host-guarded');
});

test('the natal branch comes before the catch-all landing fallback', () => {
  const fallback = server.slice(server.indexOf("app.get('*', (req, res, next)"));
  const natalAt = fallback.indexOf('isNatalHost(req)');
  const landingAt = fallback.indexOf("'landing', 'index.html'");
  assert.ok(natalAt > -1 && landingAt > -1);
  assert.ok(natalAt < landingAt, 'the landing default would swallow the natal host');
});

// The engine is mounted, never copied. Two copies would drift, and the whole
// argument for the standalone app is that it runs the same code as 5DO.
test('the natal module is served from its single home', () => {
  assert.match(server, /app\.use\('\/lib\/natal', express\.static\(/);
  assert.match(server, /app\.use\('\/lib\/vendor', express\.static\(/);
  const mounts = [...server.matchAll(/app\.use\('(\/lib\/\w+)', express\.static\(path\.join\(__dirname, '([^']+)', '([^']+)', '([^']+)'\)\)\)/g)]
    .map((m) => ({ url: m[1], dir: [m[2], m[3], m[4]].join('/') }));
  const natal = mounts.find((m) => m.url === '/lib/natal');
  assert.ok(natal, 'natal mount not parsed');
  assert.equal(natal.dir, 'akashic-frequency/public/natal',
    'the standalone app is being served a copy, not the original');
  assert.ok(fs.existsSync(new URL('../' + natal.dir, import.meta.url)));
});

// index.js resolves the ephemeris as `../vendor/cnh.js` relative to its own
// URL, so the two mounts have to be siblings or the 850KB bundle 404s.
test('the vendor mount is a sibling of the natal mount', () => {
  const natalUrl = new URL('https://x/lib/natal/index.js');
  const resolved = new URL('../vendor/cnh.js', natalUrl).pathname;
  assert.equal(resolved, '/lib/vendor/cnh.js');
  assert.match(server, /app\.use\('\/lib\/vendor'/);
});

test('the shell loads no framework or payment SDK', () => {
  const external = [...shell.matchAll(/<script[^>]+src="(https?:\/\/[^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(external, [], 'the shell pulls external scripts: ' + external.join(', '));
  for (const bad of ['react', 'babel', 'tosspayments', 'supabase']) {
    assert.ok(!shell.toLowerCase().includes(bad + '.'), 'shell references ' + bad);
  }
});

test('the shell mounts the module and starts on the free tier', () => {
  assert.match(shell, /import\('\/lib\/natal\/index\.js'\)/);
  assert.match(shell, /canRead:\s*false/, 'stage 1 must not claim a paid entitlement');
  assert.match(shell, /hideLangToggle:\s*false/,
    "the standalone app has no language chrome of its own, so the module's toggle must show");
});

// A rename that has to be made in six places gets made in four.
test('the product name has exactly one source', () => {
  const occurrences = (shell.match(/5DOracle/g) || []).length;
  assert.ok(occurrences <= 3,
    `product name appears ${occurrences} times; it should live in window.PRODUCT`);
  assert.match(shell, /window\.PRODUCT = \{/);
});

test('a failed module load offers a retry rather than a blank page', () => {
  assert.match(shell, /catch \(e\)/);
  assert.match(shell, /addEventListener\('click', start\)/);
});

// ── canonical host ────────────────────────────────────────────────────────
// The product answers on two domains (5doracle.com and 5doracle.app), which is
// two browser origins. A Supabase session lives in one origin's storage, so
// signing in on one and landing on the other reads as "my paid chart is gone".

test('the canonical host is configuration too', () => {
  assert.match(server, /process\.env\.NATAL_CANONICAL_HOST/);
  assert.match(server, /res\.redirect\(301, 'https:\/\/' \+ NATAL_CANONICAL \+ req\.originalUrl\)/,
    'the redirect must be permanent and must preserve the path and query');
});

test('unset means no redirect at all', () => {
  const mw = server.slice(server.indexOf('app.use((req, res, next) => {'));
  assert.match(mw.slice(0, 400), /if \(!NATAL_CANONICAL\) return next\(\);/,
    'an unset canonical host must leave every request alone');
});

// Payment providers post to a fixed URL and do not follow redirects. 5DO lost a
// Stripe webhook to exactly this, on the apex 307.
test('/api/ is never redirected', () => {
  const mw = server.slice(server.indexOf('app.use((req, res, next) => {'));
  const head = mw.slice(0, 500);
  const apiSkip = head.indexOf("req.path.startsWith('/api/')");
  const redirect = head.indexOf('res.redirect(301');
  assert.ok(apiSkip > -1, 'the redirect does not exempt /api/');
  assert.ok(apiSkip < redirect, '/api/ must be exempted before the redirect is issued');
});

test('a host outside NATAL_HOSTS is not redirected either', () => {
  // 5do.app and 5do.co.kr share this server; the redirect must not reach them.
  const mw = server.slice(server.indexOf('app.use((req, res, next) => {'));
  assert.match(mw.slice(0, 600), /!NATAL_HOSTS\.has\(host\) \|\| host === NATAL_CANONICAL/);
});

test('the redirect runs after the Stripe webhook is registered', () => {
  // The webhook needs a raw body and is mounted before the general chain; a
  // redirect registered earlier would shadow it.
  const webhook = server.indexOf("app.post('/api/webhooks/stripe'");
  const mw = server.indexOf('app.use((req, res, next) => {');
  assert.ok(webhook > -1 && mw > -1);
  assert.ok(webhook < mw, 'the redirect middleware is registered before the webhook');
});
