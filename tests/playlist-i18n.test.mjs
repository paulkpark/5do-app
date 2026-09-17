import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// The playlist panel was authored in Korean with no data-i18n anywhere, and
// applyLang()'s hook for redrawing it called renderPL() — a function that never
// existed. Guarded by typeof, so it failed silently and the panel kept whatever
// language it was first drawn in.

const read = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const pl = read('public/js/playlist.js');
const i18nSrc = read('public/js/i18n.js');

const dict = (() => {
  const start = i18nSrc.indexOf('const I18N = {');
  const open = i18nSrc.indexOf('{', start);
  let d = 0, end = -1;
  for (let i = open; i < i18nSrc.length; i++) {
    if (i18nSrc[i] === '{') d++;
    else if (i18nSrc[i] === '}') { d--; if (d === 0) { end = i + 1; break; } }
  }
  return eval('(' + i18nSrc.slice(open, end) + ')');
})();

test('nothing user-facing in the playlist is hardcoded Korean any more', () => {
  const hangul = /[가-힣]/;
  const offenders = pl.split('\n')
    .map((line, i) => [i + 1, line])
    .filter(([, line]) => hangul.test(line))
    // Comments are fine; they are not rendered.
    .filter(([, line]) => !/^\s*(\/\/|\/\*|\*)/.test(line));
  assert.deepEqual(offenders.map(([n, l]) => `${n}: ${l.trim().slice(0, 60)}`), []);
});

test('every key the panel asks for exists in both languages', () => {
  const keys = [...new Set([...pl.matchAll(/T\('([^']+)'/g)].map((m) => m[1]))];
  assert.ok(keys.length >= 15, 'expected the panel to be broadly translated, found ' + keys.length);
  const missing = keys.filter((k) => !dict.ko[k] || !dict.en[k]);
  assert.deepEqual(missing, []);
});

test('applyLang can actually redraw an open panel', () => {
  // i18n.js calls renderPL(); before this it did not exist, and the typeof guard
  // turned that into silence rather than an error.
  assert.match(i18nSrc, /typeof renderPL === 'function'/);
  assert.match(pl, /window\.renderPL = render;/);
});

test('the translator follows a language toggle rather than caching', () => {
  const src = /function T\(key, fallback\) \{[\s\S]*?\n  \}/.exec(pl);
  assert.ok(src, 'translator not found');
  const T = new Function('I18N', 'LANG', src[0] + '\nreturn T;');
  const I18N = { ko: { 'pl.saved': '저장됨' }, en: { 'pl.saved': 'Saved' } };
  assert.equal(T(I18N, 'ko')('pl.saved'), '저장됨');
  assert.equal(T(I18N, 'en')('pl.saved'), 'Saved');
  // An unknown language falls back to Korean rather than printing the key.
  assert.equal(T(I18N, 'jp')('pl.saved'), '저장됨');
  // A key missing from the active language falls back instead of going blank.
  assert.equal(T({ ko: { a: '가' }, en: {} }, 'en')('a'), '가');
  // A key missing everywhere uses the supplied fallback, then the key itself.
  assert.equal(T(I18N, 'en')('nope', 'Fallback'), 'Fallback');
  assert.equal(T(I18N, 'en')('nope'), 'nope');
});

test('the translator survives i18n not being loaded', () => {
  const src = /function T\(key, fallback\) \{[\s\S]*?\n  \}/.exec(pl)[0];
  const T = new Function(src + '\nreturn T;')();   // I18N and LANG undefined
  assert.equal(T('pl.saved', 'Saved'), 'Saved');
});
