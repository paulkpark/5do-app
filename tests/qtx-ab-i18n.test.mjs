import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// The QTX A/B comparison modal shipped 100% Korean: no data-i18n on the markup
// and sixteen Korean literals in the engine, so an English visitor saw Korean
// status text, Korean errors and a Korean button.

const read = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const engine = read('public/js/qtx-ab.js');
const html = read('public/5do.html');
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

test('no user-facing Korean is left in the A/B engine', () => {
  const hangul = /[가-힣]/;
  const offenders = engine.split('\n')
    .map((line, i) => [i + 1, line])
    .filter(([, line]) => hangul.test(line))
    // Comments are not rendered.
    .filter(([, line]) => !/^\s*(\/\/|\/\*|\*)/.test(line));
  assert.deepEqual(offenders.map(([n, l]) => `${n}: ${l.trim().slice(0, 60)}`), []);
});

test('every key the engine asks for resolves in both languages', () => {
  // T('key'), setStatus('key'), setTrackName('key') and abort('key').
  const keys = [...new Set([...engine.matchAll(/'(qtxab\.[A-Za-z]+)'/g)].map((m) => m[1]))];
  assert.ok(keys.length >= 14, 'expected the engine to be broadly translated, found ' + keys.length);
  const missing = keys.filter((k) => !dict.ko[k] || !dict.en[k]);
  assert.deepEqual(missing, []);
});

// abort() used to take a finished string. Passing a key instead is what lets the
// error message survive a language toggle while it is still on screen.
test('abort() is called with keys, never with resolved strings', () => {
  const calls = [...engine.matchAll(/abort\(([^)]*)\)/g)].map((m) => m[1].trim()).filter(Boolean);
  assert.ok(calls.length >= 4, 'expected several abort() call sites, found ' + calls.length);
  const resolved = calls.filter((a) => a !== 'key' && !/^'qtxab\.[A-Za-z]+'$/.test(a));
  assert.deepEqual(resolved, []);
});

// applyLang() sweeps data-i18n and would reset the status, button and countdown
// of a comparison that is mid-run back to their idle markup defaults.
test('applyLang repaints the modal through the engine hook', () => {
  assert.match(i18nSrc, /window\._repaintQtxAb/);
  assert.match(engine, /window\._repaintQtxAb = function/);
  const hook = engine.slice(engine.indexOf('window._repaintQtxAb'));
  for (const el of ['statusEl', 'toggleBtn', 'countdownEl', 'trackNameEl']) {
    assert.ok(hook.includes(el), 'repaint hook does not restore ' + el);
  }
  // A closed modal must not be touched.
  assert.match(hook, /backdrop\.style\.display/);
});

test('every qtxab key the modal markup asks for resolves in both languages', () => {
  const keys = [...new Set([...html.matchAll(/data-i18n="(qtxab\.[^"]+)"/g)].map((m) => m[1]))];
  assert.ok(keys.length >= 10, 'expected the modal to be marked up, found ' + keys.length);
  const missing = keys.filter((k) => !dict.ko[k] || !dict.en[k]);
  assert.deepEqual(missing, []);
});

// The countdown is built by concatenation — "5" + key. A leading space or a
// missing one is invisible in the dictionary but wrong on screen, so pin the
// two shapes: Korean glues straight on, English needs its own spacing.
test('the countdown suffix concatenates cleanly in both languages', () => {
  assert.equal('5' + dict.ko['qtxab.switchIn'], '5초 후 전환');
  assert.match('5' + dict.en['qtxab.switchIn'], /^5s\b/);
});

test('the engine resolves language at call time, not at load time', () => {
  // A cached translation would leave a modal that is already open in the old
  // language after the KO/EN toggle.
  const fn = engine.slice(engine.indexOf('function T(key'), engine.indexOf('function prettyTrack'));
  assert.match(fn, /I18N\[LANG\]/);
});
