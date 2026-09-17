import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// The host's loadCached reads a server, so it returns a promise. It used to be
// spread as if it were the sections object: {...promise} is empty and a promise
// is truthy, so the guard passed and nothing was restored — silently, and every
// reading generated on another device was paid for again.

const src = fs.readFileSync(new URL('../akashic-frequency/public/natal/ui/app.js', import.meta.url), 'utf8');

const restoreBlock = (() => {
  const i = src.indexOf('      if (P.loadCached) {');
  assert.ok(i > 0, 'cache restore block not found');
  return src.slice(i, src.indexOf('\n      }', i) + 8);
})();

// Run the real block against fakes.
function run({ loadCached, keyNow = 'K' }) {
  const state = { sections: { ko: {}, en: {} } };
  const calls = { saveLocal: 0, resultView: 0 };
  const fn = new Function('P', 'S', 'key', 'chartKey', 'saveLocal', 'resultView', 'Promise',
    'return (async () => {' + restoreBlock + '\n})();')(
    { loadCached }, state, 'K', () => keyNow,
    () => { calls.saveLocal++; }, () => { calls.resultView++; }, Promise);
  return { done: fn, state, calls };
}

const settle = () => new Promise((r) => setTimeout(r, 5));

test('sections from an async cache are actually restored', async () => {
  const { state } = run({ loadCached: async (k, l) => (l === 'ko' ? { 2: '빅3', 3: '기질' } : { 2: 'Big Three' }) });
  await settle();
  assert.deepEqual(state.sections.ko, { 2: '빅3', 3: '기질' });
  assert.deepEqual(state.sections.en, { 2: 'Big Three' });
});

test('a promise is never spread as if it were the sections object', async () => {
  const { state } = run({ loadCached: async () => ({ 5: 'text' }) });
  await settle();
  // The old bug produced {} here — assert on content, not merely on shape.
  assert.equal(Object.keys(state.sections.ko).length, 1);
  assert.equal(state.sections.ko[5], 'text');
});

test('the view is re-rendered once the cache lands', async () => {
  const { calls } = run({ loadCached: async () => ({ 2: 'a' }) });
  await settle();
  assert.equal(calls.resultView, 1, 'restored sections must be drawn');
  assert.equal(calls.saveLocal, 1);
});

test('a synchronous cache still works', async () => {
  const { state } = run({ loadCached: () => ({ 7: 'sync' }) });
  await settle();
  assert.equal(state.sections.ko[7], 'sync');
});

test('a cache miss or a failure leaves the chart alone', async () => {
  for (const lc of [async () => null, async () => { throw new Error('offline'); }, () => undefined]) {
    const { state, calls } = run({ loadCached: lc });
    await settle();
    assert.deepEqual(state.sections, { ko: {}, en: {} });
    assert.equal(calls.resultView, 1, 'still settles rather than hanging');
  }
});

test('a late arrival for an abandoned chart does not overwrite the current view', async () => {
  // The user computed a different chart while the request was in flight.
  const { calls } = run({ loadCached: async () => ({ 2: 'stale' }), keyNow: 'DIFFERENT' });
  await settle();
  assert.equal(calls.resultView, 0, 'must not redraw with another chart sections');
});

test('the chart is rendered before the cache is awaited, not after', () => {
  // A network round trip must not hold up a locally computed chart.
  const i = src.indexOf('      S.sections = (saved && saved.key === key');
  const window_ = src.slice(i, i + 900);
  assert.ok(window_.indexOf('resultView();') < window_.indexOf('if (P.loadCached)'),
    'first render must come before the cache lookup');
});
