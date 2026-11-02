import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// The tab bar sat at the TOP, the second of four fixed layers: header 41px,
// tabs, a nav row and a search bar, 130px in all — 20% of an iPhone SE
// permanently spent on chrome, with every control out of thumb reach and the
// bottom of the screen empty. The six tabs carried no visible text, only
// aria-label, so six abstract glyphs had to be decoded on first run.
//
// It is now five labelled tabs at the bottom. Soul Code and Biofeedback share
// one "분석" tab. What this file guards is the part that is easy to get wrong
// twice: those two features have DIFFERENT entitlements, so the gate must stay
// per-sub-tab and must never collapse onto the tab itself.

const html = fs.readFileSync(new URL('../public/5do.html', import.meta.url), 'utf8');
const layout = fs.readFileSync(new URL('../public/css/layout.css', import.meta.url), 'utf8');
const player = fs.readFileSync(new URL('../public/css/player.css', import.meta.url), 'utf8');
const base = fs.readFileSync(new URL('../public/css/base.css', import.meta.url), 'utf8');
const i18n = fs.readFileSync(new URL('../public/js/i18n.js', import.meta.url), 'utf8');

const navBlock = html.slice(html.indexOf('<nav class="tab-bar">'),
                            html.indexOf('</nav>', html.indexOf('<nav class="tab-bar">')));

test('there are exactly five tabs', () => {
  const ids = [...navBlock.matchAll(/<button id="(tab[A-Za-z0-9]+)"/g)].map((m) => m[1]);
  assert.deepEqual(ids, ['tabLibrary', 'tabGenerator', 'tabInsight', 'tabCe5', 'tabCosmic']);
});

test('every tab carries a VISIBLE label, not just an aria-label', () => {
  // This is the whole reason the bar was unreadable.
  const labels = [...navBlock.matchAll(/<span class="tab-label" data-i18n="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(labels.length, 5, 'a tab is missing its text label');
  for (const key of labels) {
    for (const lang of ['ko', 'en']) {
      const block = i18n.slice(i18n.indexOf(`'${lang}': {`));
      assert.ok(block.includes(`'${key}'`), `${key} has no ${lang} string`);
    }
  }
});

test('the labels are the SHORT forms — five of them share 390px', () => {
  for (const [key, max] of [['tab.libraryShort', 4], ['tab.insightShort', 4], ['tab.cosmicShort', 4]]) {
    const m = i18n.match(new RegExp(`'${key.replace('.', '\\.')}':'([^']+)'`));
    assert.ok(m, `${key} missing`);
    assert.ok(m[1].length <= max, `${key} = "${m[1]}" is too long for a fifth of the bar`);
  }
});

test('no tab label makes a diagnostic claim', () => {
  // Legal copy rule for this product: measure/render/experience, never
  // diagnose/treat/cure. "분석" was chosen over "진단" for exactly this.
  const ko = i18n.slice(i18n.indexOf("'ko': {"), i18n.indexOf("'en': {"));
  const labels = [...ko.matchAll(/'tab\.[A-Za-z0-9]+Short':'([^']+)'/g)].map((m) => m[1]);
  assert.ok(labels.length >= 5);
  for (const l of labels) assert.doesNotMatch(l, /진단|치료|치유|처방/, `tab label "${l}" makes a clinical claim`);
});

test('the bar is at the bottom and clears the home indicator', () => {
  const bar = layout.slice(layout.indexOf('.tab-bar {'), layout.indexOf('}', layout.indexOf('.tab-bar {')));
  assert.match(bar, /position: fixed; bottom: 0/);
  assert.doesNotMatch(bar, /top: 41px/, 'the bar is back at the top');
  assert.match(bar, /padding-bottom: var\(--safe-b\)/, 'labels would sit under the iPhone home indicator');
  assert.match(base, /--safe-b: env\(safe-area-inset-bottom/);
});

test('nothing is left stranded underneath the fixed bar', () => {
  // The last row of every list, and the track-info sheet, were both at risk.
  assert.match(layout, /main \{[^}]*padding-bottom: calc\(var\(--chrome-bottom\)/);
  const sheet = player.slice(player.indexOf('.track-info-sheet {'));
  assert.match(sheet.slice(0, 400), /bottom: var\(--chrome-bottom\)/,
    'the track-info sheet would open behind the tab bar');
});

test('the chrome stack is named once, not scattered as magic numbers', () => {
  for (const t of ['--h-header', '--h-tabbar', '--chrome-top', '--chrome-bottom', '--h-full-page']) {
    assert.ok(base.includes(`${t}:`), `${t} is not defined`);
  }
  // The old loose numbers must not come back.
  assert.doesNotMatch(layout, /padding-top: 130px/);
  assert.doesNotMatch(player, /top: 75px/);
  assert.doesNotMatch(player, /calc\(100vh - 130px\)/);
  assert.doesNotMatch(html, /calc\(100vh - 90px\)/);
});

// ── the merged tab ────────────────────────────────────────────────────────

test('Soul Code and Biofeedback live in one wrapper', () => {
  const i = html.indexOf('<div id="pageInsight"');
  assert.ok(i > -1, 'no pageInsight wrapper');
  const end = html.indexOf('<!-- CE5 Protocol -->', i);
  const wrap = html.slice(i, end);
  assert.match(wrap, /id="pageAkashic"/);
  assert.match(wrap, /id="pageBiofield"/);
  assert.match(wrap, /id="subTabAkashic"/);
  assert.match(wrap, /id="subTabBiofield"/);
});

test('the two sub-tabs keep SEPARATE entitlement gates', () => {
  // Soul Code is Pro; Biofeedback only needs a signed-in account. Collapsing
  // these onto the tab would either paywall Biofeedback or give Soul Code away.
  assert.match(html, /function _openAkashic\(\)[\s\S]{0,200}SUB\.canUseAkashic\(\)/);
  assert.match(html, /function _openBiofield\(\)[\s\S]{0,160}_requireLoginOrPrompt\(\)/);
  assert.match(html, /\$\('#subTabAkashic'\)\.addEventListener\('click', _openAkashic\)/);
  assert.match(html, /\$\('#subTabBiofield'\)\.addEventListener\('click', _openBiofield\)/);
});

test('opening the tab lands a free user on the page they can use', () => {
  // A signed-in free user hitting an upgrade wall on arrival would make the
  // whole tab look broken to them.
  const h = html.slice(html.indexOf("$('#tabInsight')"), html.indexOf("$('#subTabAkashic')"));
  assert.match(h, /canUseAkashic\(\)/);
  assert.match(h, /if \(akashicOk\) showPage\('akashic'\); else showPage\('biofield'\)/);
});

test('both sub-pages light the same tab', () => {
  const fn = html.slice(html.indexOf('function showPage(which)'), html.indexOf('// Akashic iframe'));
  assert.match(fn, /akashic: 'tabInsight'/);
  assert.match(fn, /biofield: 'tabInsight'/);
  assert.match(fn, /const inInsight = \(which === 'akashic' \|\| which === 'biofield'\)/);
  assert.match(fn, /wrap\.classList\.toggle\('hidden', !inInsight\)/);
});

test('the removed tabs leave no dangling handlers', () => {
  // $('#tabBiofield') on a missing element throws and kills the rest of the
  // script — every listener registered after it would never attach.
  assert.doesNotMatch(html, /\$\('#tabBiofield'\)/);
  assert.doesNotMatch(html, /\$\('#tabAkashic'\)/);
  assert.doesNotMatch(html, /id="tabBiofield"/);
  assert.doesNotMatch(html, /id="tabAkashic"/);
});

test('the camera/mic release still fires when leaving Biofeedback', () => {
  // Biofeedback holds the webcam. Hiding a tab is display:none, which does not
  // fire visibilitychange, so without this the capture light stays on.
  assert.match(html, /if \(which !== 'biofield'\)[\s\S]{0,320}releaseCapture/);
});

test('the service worker was rebuilt', () => {
  const sw = fs.readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
  const id = sw.match(/const BUILD_ID = '([^']+)'/)[1];
  assert.ok(id >= '2026-11-02-v124', `BUILD_ID ${id} predates the tab-bar move`);
});
