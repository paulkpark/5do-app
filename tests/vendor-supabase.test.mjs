import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

// The Supabase bundle used to load from jsdelivr. sw.js returns early for
// cross-origin requests, so it was never cached: every cold start went to the
// network for it, and offline the app did not boot at all — 5do.html creates
// SB synchronously, so a missing window.supabase threw before anything ran.

const root = new URL('../', import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, root), 'utf8');
const html = read('public/5do.html');
const sw = read('public/sw.js');
const readme = read('public/js/vendor/README.md');

const tag = html.match(/<script src="(\/js\/vendor\/supabase-js-[\d.]+\.js)"><\/script>/);

test('5do.html loads the Supabase bundle from our own origin', () => {
  assert.ok(tag, 'no vendored supabase <script> tag in 5do.html');
  assert.doesNotMatch(html, /src="https?:\/\/[^"]*supabase-js/,
    '5do.html still pulls Supabase from a CDN');
});

test('the vendored file the page asks for is actually on disk', () => {
  const file = new URL('public' + tag[1], root);
  assert.ok(fs.existsSync(file), 'missing ' + tag[1]);
  assert.ok(fs.statSync(file).size > 100_000, 'vendored bundle looks truncated');
});

// Half a bump — new file, old precache entry — would leave the SW caching a
// path that no longer exists, silently restoring the every-boot network fetch.
test('the service worker precaches exactly the file the page loads', () => {
  const inSw = [...sw.matchAll(/'(\/js\/vendor\/supabase-js-[\d.]+\.js)'/g)].map((m) => m[1]);
  assert.deepEqual(inSw, [tag[1]], 'sw.js CORE_ASSETS is out of step with 5do.html');
});

test('README records the version that is actually vendored', () => {
  const version = tag[1].match(/supabase-js-([\d.]+)\.js/)[1];
  assert.ok(readme.includes(version), `README does not mention ${version}`);
});

test('the bundle really exposes createClient when evaluated', () => {
  const src = fs.readFileSync(new URL('public' + tag[1], root), 'utf8');
  const ctx = { globalThis: null, window: null, self: null, console };
  ctx.globalThis = ctx; ctx.window = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  assert.equal(typeof ctx.supabase?.createClient, 'function',
    'vendored bundle did not install window.supabase.createClient');
});

// The Toss SDK ships cache-control: max-age=60 and is ~480KB. In <head> that was
// a render-blocking re-download on nearly every visit, for a script only the
// Korean checkout flow ever calls.
test('the Toss SDK is not loaded up front', () => {
  assert.doesNotMatch(html, /<script src="https:\/\/js\.tosspayments\.com/,
    'Toss SDK is back in <head>');
  const sub = read('public/js/subscription.js');
  assert.match(sub, /loadTossSdk\s*\(\)\s*\{/, 'no on-demand Toss loader');
  assert.match(sub, /await this\.loadTossSdk\(\)/, 'checkout does not await the loader');
  assert.match(read('public/js/account-ui.js'), /warmTossSdk/,
    'upgrade modal does not warm the SDK');
});

// A failed load that stuck would make the pay button dead for the rest of the
// session; the user is usually just on a flaky connection.
test('a failed Toss load does not poison later attempts', () => {
  const sub = read('public/js/subscription.js');
  const fn = sub.slice(sub.indexOf('loadTossSdk()'), sub.indexOf('warmTossSdk()'));
  assert.ok(fn.length > 100, 'could not isolate loadTossSdk');
  assert.match(fn, /this\._tossSdk = null/, 'the cached promise is never cleared on failure');
  assert.match(fn, /\.catch\(/, 'nothing observes the rejection');
});

test('no same-origin script 5do.html loads is missing from disk', () => {
  const srcs = [...html.matchAll(/<script src="(\/[^"]+)"/g)].map((m) => m[1].split('?')[0]);
  const missing = srcs.filter((s) => !fs.existsSync(new URL('public' + s, root)));
  assert.deepEqual(missing, []);
});
