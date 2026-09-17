import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// The natal UI is framework-free and asks the host for three capabilities:
// reach the model, read the cache, resolve a place name. Nothing type-checks
// across that seam, so it is pinned here — these run the real callbacks lifted
// out of index.html against a fake fetch.

// The streaming client is a real module now. natalGeocode is still 5DO's own —
// it wraps the geocoder Soul Code already ships — so that one is still lifted
// out of the page.
const html = fs.readFileSync(new URL('../akashic-frequency/public/index.html', import.meta.url), 'utf8');
const geoSrc = (() => {
  const START = 'function natalGeocode(query)';
  const i = html.indexOf(START);
  assert.ok(i > 0, 'natalGeocode not found in index.html');
  return html.slice(i, html.indexOf('\n}', i) + 2);
})();
const { createReadingClient } = await import('../akashic-frequency/public/natal/http.js');

function load({ fetchImpl, token = 'jwt-1', geocodePlace } = {}) {
  globalThis.fetch = fetchImpl;
  // Mirrors natalAuthHeaders in index.html: a fresh token per request, and a
  // coded throw when there is none, which must reach the caller unchanged.
  const authHeaders = async () => {
    const t = await Promise.resolve(token);
    if (!t) { const e = new Error('sign in required'); e.code = 'not_granted'; throw e; }
    return { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t };
  };
  const client = createReadingClient({ authHeaders });
  const win = { geocodePlace };
  const { natalGeocode } = new Function('window', 'console', geoSrc + '\nreturn { natalGeocode };')(win, console);
  return { natalSample: client.sample, natalLoadCached: client.loadCached, natalGeocode };
}

const sse = (chunks) => ({
  ok: true,
  headers: { get: () => 'text/event-stream; charset=utf-8' },
  body: {
    getReader() {
      let i = 0;
      return { read: async () => (i < chunks.length
        ? { value: new TextEncoder().encode(chunks[i++]), done: false }
        : { value: undefined, done: true }) };
    },
  },
});
const json = (status, obj) => ({
  ok: status < 400, status,
  headers: { get: () => 'application/json' },
  json: async () => obj,
});

test('streams a section, reporting accumulated text as it arrives', async () => {
  const seen = [];
  const api = load({ fetchImpl: async () => sse([
    'data: {"type":"text","text":"태양은 "}\n\n',
    'data: {"type":"text","text":"쌍둥이"}\n\ndata: {"type":"text","text":"자리"}\n\n',
    'data: {"type":"done","stopReason":"end_turn"}\n\ndata: {"type":"end"}\n\n',
  ]) });
  const r = await api.natalSample('p', { onText: (o) => seen.push(o.text) });
  assert.equal(r.text, '태양은 쌍둥이자리');
  // onText carries the running total, not a delta — the UI renders it directly.
  assert.deepEqual(seen, ['태양은 ', '태양은 쌍둥이', '태양은 쌍둥이자리']);
});

test('a cache hit answers as JSON, so nothing is regenerated or billed', async () => {
  const api = load({ fetchImpl: async () => json(200, { cached: true, text: '저장된 해석' }) });
  let got = null;
  const r = await api.natalSample('p', { onText: (o) => { got = o.text; } });
  assert.equal(r.text, '저장된 해석');
  assert.equal(got, '저장된 해석');
});

test('the request carries the coordinates the server caches by', async () => {
  let sent = null;
  const api = load({ fetchImpl: async (url, init) => { sent = JSON.parse(init.body); return json(200, { text: 'x' }); } });
  await api.natalSample('PROMPT', { section: 14, chartKey: 'ck', lang: 'en', modelTier: 'complex', regenerate: true });
  assert.equal(sent.section, 14);
  assert.equal(sent.chartKey, 'ck');
  assert.equal(sent.lang, 'en');
  assert.equal(sent.deep, true);
  assert.equal(sent.regenerate, true);
});

test('the subscription gate surfaces as a code the UI can branch on', async () => {
  const api = load({ fetchImpl: async () => json(403, { error: 'subscription required', code: 'not_granted' }) });
  await assert.rejects(() => api.natalSample('p', {}), (e) => e.code === 'not_granted');
});

test('a timing cooldown reports when it next unlocks', async () => {
  const api = load({ fetchImpl: async () => json(429, { code: 'timing_cooldown', availableAt: '2026-10-01T00:00:00Z' }) });
  await assert.rejects(() => api.natalSample('p', {}),
    (e) => e.code === 'timing_cooldown' && e.availableAt === '2026-10-01T00:00:00Z');
});

test('a refusal is reported rather than shown as a section that just stops', async () => {
  const api = load({ fetchImpl: async () => sse([
    'data: {"type":"text","text":"일부 "}\n\n',
    'data: {"type":"done","stopReason":"refusal"}\n\n',
  ]) });
  // Partial text rides along so the UI can show it and offer a retry.
  await assert.rejects(() => api.natalSample('p', {}), (e) => e.code === 'refusal' && e.text === '일부 ');
});

test('without a token no request is made at all', async () => {
  let called = false;
  const api = load({ token: null, fetchImpl: async () => { called = true; return json(200, {}); } });
  await assert.rejects(() => api.natalSample('p', {}), (e) => e.code === 'not_granted');
  assert.equal(called, false, 'a paid endpoint must not be called without a token');
});

test('a failed cache read never blocks the chart', async () => {
  const api = load({ fetchImpl: async () => { throw new Error('network down'); } });
  assert.equal(await api.natalLoadCached('k', 'ko'), null);
});

test('cached sections come back keyed by section number', async () => {
  const api = load({ fetchImpl: async () => json(200, { sections: { 2: 'a', 3: 'b' } }) });
  assert.deepEqual(await api.natalLoadCached('k', 'ko'), { 2: 'a', 3: 'b' });
});

test('geocode returns exactly the keys the suggestion list renders', async () => {
  const api = load({
    fetchImpl: async () => json(200, {}),
    geocodePlace: async () => ({ display: 'Greenville, Pitt County, North Carolina, United States', lat: 35.61, lon: -77.37 }),
  });
  const [r] = await api.natalGeocode('Greenville');
  assert.equal(r.name, 'Greenville');
  assert.equal(r.region, 'Pitt County, North Carolina');
  // The UI calls lat.toFixed(2) to dedupe against its built-in list.
  assert.equal(typeof r.lat, 'number');
  assert.equal(typeof r.lon, 'number');
});

test('geocode failure yields an empty list, not a throw', async () => {
  const api = load({ fetchImpl: async () => json(200, {}), geocodePlace: async () => null });
  assert.deepEqual(await api.natalGeocode('nowhere'), []);
});
