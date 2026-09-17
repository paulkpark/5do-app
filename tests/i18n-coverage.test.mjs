import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// applyLang() bails on a key it cannot resolve and leaves the markup alone — and
// the markup is authored in Korean. So a missing key is not an error anyone
// sees; it is an English user reading Korean. This is the check that turns that
// into a test failure instead.

const read = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');

function dictOf(src, decl) {
  const start = src.indexOf(decl);
  assert.ok(start > 0, decl + ' not found');
  const open = src.indexOf('{', start);
  let depth = 0, end = -1;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  assert.ok(end > 0, 'unbalanced braces in ' + decl);
  return eval('(' + src.slice(open, end) + ')');
}

const I18N = dictOf(read('public/js/i18n.js'), 'const I18N = {');
const html = read('public/5do.html');

test('the dictionary has exactly the two languages the app toggles', () => {
  assert.deepEqual(Object.keys(I18N).sort(), ['en', 'ko']);
});

test('every data-i18n key in the app resolves in both languages', () => {
  const used = [...new Set([...html.matchAll(/data-i18n="([^"]+)"/g)].map((m) => m[1]))];
  assert.ok(used.length > 50, 'expected the app to be broadly marked up, found ' + used.length);
  const missing = used.filter((k) => !I18N.ko[k] || !I18N.en[k])
    .map((k) => `${k} (ko:${I18N.ko[k] ? 'y' : 'n'} en:${I18N.en[k] ? 'y' : 'n'})`);
  assert.deepEqual(missing, [], 'unresolvable keys leave authored Korean on screen');
});

test('neither language has keys the other lacks', () => {
  const koOnly = Object.keys(I18N.ko).filter((k) => !(k in I18N.en));
  const enOnly = Object.keys(I18N.en).filter((k) => !(k in I18N.ko));
  assert.deepEqual(koOnly, [], 'present in ko, missing in en');
  assert.deepEqual(enOnly, [], 'present in en, missing in ko');
});

test('no English value is left as Korean text', () => {
  const hangul = /[가-힣]/;
  // A handful of entries are intentionally identical across languages (brand and
  // product names); those are Latin, so any Hangul in en is a missed translation.
  const untranslated = Object.entries(I18N.en).filter(([, v]) => typeof v === 'string' && hangul.test(v));
  assert.deepEqual(untranslated.map(([k]) => k), []);
});

test('the natal module covers every string its UI asks for', () => {
  const natal = dictOf(read('akashic-frequency/public/natal/engine/i18n.js'), 'export const UI = {');
  const ui = read('akashic-frequency/public/natal/ui/app.js');
  const used = [...new Set([...ui.matchAll(/\bT\('([^']+)'\)/g)].map((m) => m[1]))];
  assert.ok(used.length > 20, 'expected many UI strings, found ' + used.length);
  const missing = used.filter((k) => !(k in natal.ko) || !(k in natal.en));
  assert.deepEqual(missing, []);
});

test('English house numbers read as ordinals, not "1th house"', async () => {
  const { houseName } = await import('../akashic-frequency/public/natal/engine/i18n.js');
  assert.equal(houseName('en', 1), '1st house');
  assert.equal(houseName('en', 2), '2nd house');
  assert.equal(houseName('en', 3), '3rd house');
  assert.equal(houseName('en', 4), '4th house');
  // The teens are the exception that a naive rule gets wrong.
  assert.equal(houseName('en', 11), '11th house');
  assert.equal(houseName('en', 12), '12th house');
  assert.equal(houseName('ko', 3), '3하우스');
  assert.equal(houseName('en', undefined), '');
});

test('the natal UI no longer glues a suffix onto a house number', () => {
  const ui = read('akashic-frequency/public/natal/ui/app.js');
  assert.ok(!/T\('houseSuffix'\)/.test(ui),
    "houseSuffix cannot spell English ordinals — use houseName()");
});
