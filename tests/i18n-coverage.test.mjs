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

test('every data-tip-i18n key resolves in both languages', () => {
  // These localise title + aria-label on icon-only controls. A miss is
  // invisible to a sighted user and reads as English to a screen reader, so
  // nothing ever reports it.
  const keys = [...html.matchAll(/data-tip-i18n="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(keys.length > 0, 'no tooltip keys found — re-point this test');
  for (const k of [...new Set(keys)]) {
    for (const lang of ['ko', 'en']) {
      assert.ok(I18N[lang][k], `${k} missing in ${lang}`);
    }
  }
});

test('the play timer has no hard-coded label left in it', () => {
  // Reported from the app: the timer UI did not follow the language toggle.
  // Every control it owns now carries a key.
  // 5do.html carries three stray </body> tags, so the end of the modal is
  // found from the modal's own start, not from the document's.
  const at = html.indexOf('<div id="timerModal"');
  const panel = html.slice(at, html.indexOf('\n</body>', at));
  assert.ok(panel.includes('timerWheelList'), 'the timer modal moved — re-point this test');
  assert.match(panel, /data-i18n="timer\.title"/);
  assert.match(panel, /data-i18n="timer\.hint"/);
  assert.match(panel, /data-tip-i18n="timer\.close"/);
  // The commit button ships with a key AND a default, because timerPaint only
  // moves the key when a dictionary is loaded.
  assert.match(panel, /id="timerApply"[^>]*data-i18n="timer\.start"/);
  for (const id of ['btnTimer', 'btnLoop', 'btnPlay', 'btnStop']) {
    const re = new RegExp(`<button id="${id}"[^>]*data-tip-i18n="`);
    assert.match(html, re, `${id} has an untranslated tooltip`);
  }
  // The Off row is the only word on the drum; the rest are numerals.
  assert.match(html, /b\.dataset\.i18n = 'timer\.off'/);
  // And the remaining-time line, which applyLang() cannot reach, is repainted.
  assert.match(html, /applyLang\(\);[\s\S]{0,400}timerPaint\(\)/);
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
