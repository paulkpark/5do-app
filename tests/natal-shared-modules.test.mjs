import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// The PDF exporter and the streaming client used to live inside the 5DO Soul
// Code page. Both are now modules under natal/, shared with the standalone app.
// What this file guards is that they stay shared and stay host-neutral — a
// second copy, or one 5DO path left hardcoded, and the standalone app breaks in
// ways that only show up at export time.

const read = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const pdf = read('akashic-frequency/public/natal/pdf.js');
const http = read('akashic-frequency/public/natal/http.js');
const host = read('akashic-frequency/public/index.html');
const shell = read('public/natal-app/index.html');
const providers = read('public/natal-app/providers.js');

test('the shared modules hardcode no mount path', () => {
  // natal/ is served at /akashic-frequency/natal/ for 5DO and /lib/natal/ for
  // the standalone app. Anything absolute here works in exactly one of them.
  for (const [name, src] of [['pdf.js', pdf], ['http.js', http]]) {
    const hits = src.split('\n')
      .map((l, i) => [i + 1, l])
      .filter(([, l]) => /['"`]\/akashic-frequency|['"`]\/lib\//.test(l));
    assert.deepEqual(hits.map(([n, l]) => `${name}:${n} ${l.trim()}`), []);
  }
});

test('the font is resolved against the module, not an absolute path', () => {
  assert.match(pdf, /new URL\('\.\/fonts\/' \+ file, import\.meta\.url\)/,
    'fonts must resolve relative to pdf.js or the standalone export breaks');
});

test('the page footer brand has no default', () => {
  // A default is how the wrong product name ends up on the other one's PDF.
  assert.match(pdf, /opts\.brand \? opts\.brand \+ ' · ' : ''/);
  assert.doesNotMatch(pdf, /brand = '5DO/, 'brand must not be defaulted');
  assert.match(host, /exportReadingPdf\(d, \{ brand: '5DO' \}\)/);
  assert.match(providers, /exportReadingPdf\(doc, \{ brand: '5DOracle' \}\)/);
});

test('the 5DO page keeps no copy of what moved', () => {
  for (const gone of [
    'function natalExportPdf', 'function pdfSafeCutRows', 'function natalRenderChartImage',
    'function loadNatalFonts', 'function natalWrapRuns', 'function natalParseBlocks',
    'async function natalSample', 'async function natalLoadCached',
  ]) {
    assert.ok(!host.includes(gone), 'index.html still defines ' + gone);
  }
});

test('the 5DO page reaches the modules through the one bridge', () => {
  // index.html's bundle is a classic Babel script and cannot import, so both
  // modules are handed to it by a single module script.
  assert.match(host, /import \* as NatalPdf from '\.\/natal\/pdf\.js'/);
  assert.match(host, /import \* as NatalHttp from '\.\/natal\/http\.js'/);
  assert.match(host, /window\.NatalPdf = NatalPdf/);
  assert.match(host, /window\.NatalHttp = NatalHttp/);
});

test('the Soul Code exporter registers its font after the document exists', () => {
  // registerFonts takes the jsPDF instance. Calling it a line before `const pdf`
  // is a temporal-dead-zone error that the exporter's own catch-all turns into a
  // silent no-op — which is exactly how it shipped for a few minutes.
  const gen = host.slice(host.indexOf('const generatePdf = useCallback'));
  const ctor = gen.indexOf('const pdf = new jsPDFCtor');
  const fonts = gen.indexOf('registerFonts(pdf)');
  assert.ok(ctor > -1 && fonts > -1, 'could not locate both statements');
  assert.ok(ctor < fonts, 'registerFonts(pdf) runs before pdf is declared');
});

test('only the auth header differs between the two hosts', () => {
  assert.match(http, /export function createReadingClient\(\{ authHeaders/);
  assert.match(host, /createReadingClient\(\{ authHeaders: natalAuthHeaders \}\)/);
  assert.match(providers, /createReadingClient\(\{ authHeaders \}\)/);
});

test('the standalone provider supplies the contract the module reads', async () => {
  // ui/app.js reads these off the provider; nothing type-checks across the seam.
  const app = read('akashic-frequency/public/natal/ui/app.js');
  const asked = new Set([...app.matchAll(/\bP\.([a-zA-Z]+)/g)].map((m) => m[1]));
  const supplied = new Set([
    ...[...providers.matchAll(/^\s{4}([a-zA-Z]+)[,:]/gm)].map((m) => m[1]),
  ]);
  // prefill and saveCached are deliberately absent: the standalone app has no
  // other form to seed from, and the server writes the cache itself.
  const optional = new Set(['prefill', 'saveCached', 'geocode']);
  const missing = [...asked].filter((k) => !supplied.has(k) && !optional.has(k));
  assert.deepEqual(missing, [], 'provider is missing: ' + missing.join(', '));
});

test('the standalone app loads auth only when something needs it', () => {
  // The chart and the data tables are computed in the browser and need no
  // account, so the sign-in bundle must not be part of first paint.
  assert.ok(!/<script[^>]+supabase/i.test(shell), 'auth bundle is in the shell');
  assert.match(providers, /document\.createElement\('script'\)/);
  assert.match(providers, /\/js\/vendor\/supabase-js-[\d.]+\.js/,
    'the standalone app should reuse the vendored bundle 5DO already caches');
});

test('the vendored supabase path the provider names exists', () => {
  const m = providers.match(/'(\/js\/vendor\/supabase-js-[\d.]+\.js)'/);
  assert.ok(m, 'no vendored bundle path in providers.js');
  assert.ok(fs.existsSync(new URL('../public' + m[1], import.meta.url)), 'missing ' + m[1]);
});
