import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// An audit on 2026-11-02 found, across public/css/, 177 distinct colour
// literals against 26 token uses, 12 border-radius values and 14 font-sizes
// (nine of them between 10px and 16px). None of that is a bug anyone can
// report — it reads as cheapness, because the eye notices that a row, its
// thumbnail and the star on top are 16px, 12px and 10px round.
//
// The tokens already existed in base.css. The CSS simply went around them.
// This file is what stops that happening again, so it asserts the RULE (no
// un-named values) rather than a snapshot of today's numbers.

const root = new URL('../', import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, root), 'utf8');
// Definitions live in tokens.css now so the sub-apps can share them;
// base.css still holds the reset and the commentary.
const base = read('public/css/tokens.css') + read('public/css/base.css');

const CSS = ['layout', 'components', 'player'].map((n) => [
  `public/css/${n}.css`, read(`public/css/${n}.css`),
]);

// Strip comments first: the comments here deliberately quote the old literals
// ("this glow was rgba(124,92,252,.55)") and that history is worth keeping.
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

const COLOUR = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g;

// Two literals survive on purpose, each with a reason written beside it.
const ALLOWED = [
  '#1a6fff',                 // the oscilloscope trace swatch — data, not chrome
  'rgba(6, 10, 18, var(--uiOpacity, 0.94))', // --uiOpacity is a live user setting
];

test('no CSS file reintroduces a raw colour', () => {
  for (const [name, src] of CSS) {
    const found = (strip(src).match(COLOUR) || [])
      .filter((c) => !ALLOWED.some((a) => a.toLowerCase().startsWith(c.toLowerCase())));
    assert.deepEqual(found, [], `${name} has un-named colours: ${found.join(', ')}`);
  }
});

test('every radius is one of the three', () => {
  for (const [name, src] of CSS) {
    for (const m of strip(src).matchAll(/border-radius:\s*([^;}]+)/g)) {
      const v = m[1].replace('!important', '').trim();
      for (const part of v.split(/\s+/)) {
        assert.ok(
          part === '0' || ['var(--r-sm)', 'var(--r-lg)', 'var(--r-pill)'].includes(part),
          `${name}: border-radius "${v}" is not on the scale`);
      }
    }
  }
});

test('every font-size is one of the named steps', () => {
  const steps = ['var(--t-micro)', 'var(--t-caption)', 'var(--t-body)',
                 'var(--t-title)', 'var(--t-display)', 'var(--t-hero)'];
  for (const [name, src] of CSS) {
    for (const m of strip(src).matchAll(/font-size:\s*([^;}]+)/g)) {
      const v = m[1].trim();
      assert.ok(steps.includes(v), `${name}: font-size "${v}" is not on the scale`);
    }
  }
});

test('every token referenced anywhere is defined in base.css', () => {
  // A var() that resolves to nothing fails silently — the property is simply
  // dropped and the element renders unstyled.
  const defined = new Set([...base.matchAll(/^\s*(--[A-Za-z0-9-]+)\s*:/gm)].map((m) => m[1]));
  const dir = new URL('public/css/', root);
  const missing = new Set();
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.css')) continue;
    const src = fs.readFileSync(new URL(f, dir), 'utf8');
    for (const m of src.matchAll(/var\(\s*(--[A-Za-z0-9-]+)\s*([,)])/g)) {
      // A var() WITH a fallback is allowed to name something set at runtime.
      if (m[2] === ',') continue;
      if (!defined.has(m[1])) missing.add(`${f}: ${m[1]}`);
    }
  }
  assert.deepEqual([...missing], [], 'undefined token references');
});

test('the body type is 16px, the size below which iOS Safari zooms', () => {
  assert.match(base, /--t-body:\s*16px/);
  assert.match(base, /font-size:\s*var\(--t-body\)/, 'body does not take the body size');
});

// ── contrast ──────────────────────────────────────────────────────────────
// The player's elapsed-time readout was 11px rgba(160,190,220,.4): 2.5:1 on
// the ground, against a 4.5:1 minimum. Asserting the ratio rather than the
// hex means a future palette tweak cannot quietly undo it.

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lum = (rgb) => {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [x, y] = [lum(hex(a)), lum(hex(b))].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const token = (n) => base.match(new RegExp(`${n}:\\s*(#[0-9A-Fa-f]{6})`))[1];

test('body and caption text clear 4.5:1 on the ground', () => {
  const bg = token('--bg');
  for (const n of ['--text-primary', '--text-secondary']) {
    const r = ratio(token(n), bg);
    assert.ok(r >= 4.5, `${n} is ${r.toFixed(2)}:1 on --bg, under the 4.5:1 minimum`);
  }
});

test('--text-tertiary is documented as large-text-only, not promoted', () => {
  // It is 3.3:1. That is fine for 24px+ and for non-text UI, and not fine for
  // a caption — which is exactly the mistake this codebase already made.
  const r = ratio(token('--text-tertiary'), token('--bg'));
  assert.ok(r >= 3 && r < 4.5, `--text-tertiary is ${r.toFixed(2)}:1`);
  assert.match(base, /FAILS the 4\.5:1 body minimum/,
    'the caveat on --text-tertiary was removed from base.css');
});

test('the elapsed-time readout no longer uses the failing grey', () => {
  // strip(): the comment beside that rule quotes the old value on purpose.
  const player = strip(read('public/css/player.css'));
  assert.doesNotMatch(player, /rgba\(160,190,220,\.4\)/);
  assert.match(player, /font-size: var\(--t-caption\); color: var\(--text-secondary\); font-variant-numeric/);
});

// ── touch targets ─────────────────────────────────────────────────────────

test('text inputs clear the 44px minimum and do not trigger iOS zoom', () => {
  const c = read('public/css/components.css');
  assert.match(base, /--tap:\s*44px/);
  for (const sel of ['.search-input-wrap input', '.filterbar input']) {
    const i = c.indexOf(sel);
    assert.ok(i > -1, `${sel} is gone`);
    const block = c.slice(i, c.indexOf('}', i));
    assert.match(block, /min-height: var\(--tap\)/, `${sel} has no minimum height`);
    assert.match(block, /font-size: var\(--t-body\)/, `${sel} under 16px → iOS zooms`);
  }
});

test('the small icon buttons carry a full-size hit area', () => {
  const c = read('public/css/components.css');
  assert.match(c, /\.search-go-btn::after[\s\S]{0,200}width: var\(--tap\); height: var\(--tap\)/);
});

// ── the palettes that were leaking ────────────────────────────────────────

test('the abandoned purple theme is gone from the first screen', () => {
  // The compliance gate — the first thing anyone ever sees of 5DO — shipped a
  // #7C5CFC→#5A3AD9 gradient button while the app itself was cyan.
  const gate = read('public/js/compliance-gate.js');
  const body = strip(gate);
  assert.doesNotMatch(body, /#7[Cc]5[Cc][Ff][Cc]|#5[Aa]3[Aa][Dd]9/, 'purple theme still in the gate');
  assert.deepEqual(body.match(COLOUR) || [], [], 'the gate has raw colours again');
});

test('QTX purple is a named product accent, not twelve loose values', () => {
  // 5do.html picks it at runtime: _outputMode === 'qtx' ? '#8b5cf6' : …
  // Purple is correct here. Twelve unnamed purples were not.
  assert.match(base, /--qtx:\s*#8B5CF6/);
  const html = read('public/5do.html');
  for (const dead of ['#7c5cfc', '#9b7fff', '#c4b5fd', '#5a3ad9']) {
    assert.ok(!html.toLowerCase().includes(dead), `${dead} is still inline in 5do.html`);
  }
});

test('the service worker was rebuilt after the stylesheets changed', () => {
  const sw = read('public/sw.js');
  const id = sw.match(/const BUILD_ID = '([^']+)'/)[1];
  assert.ok(id >= '2026-11-02-v123', `BUILD_ID ${id} predates the token refactor`);
  // Returning visitors hold the precached CSS until BUILD_ID moves.
  assert.match(sw, /CORE_ASSETS[\s\S]{0,600}\/css\/base\.css/);
});

// ── theme.js vs tokens.css ────────────────────────────────────────────────
// theme.js writes a full palette as INLINE styles on <html>, which beats every
// stylesheet. Its default theme, deep_ocean, is meant to BE the design system,
// so any divergence means the CSS says one thing and the app does another with
// no error anywhere. Two had already drifted: --secondary stayed #7FFFD4 after
// tokens.css moved to #3ECFCF, and --title-glow kept painting a cyan halo that
// tokens.css had set to none. The other themes override on purpose.

test('the default theme mirrors tokens.css exactly', () => {
  const theme = read('public/js/theme.js');
  const i = theme.indexOf("id:'deep_ocean'");
  assert.ok(i > -1, 'the deep_ocean theme is gone — re-point this test');
  const block = theme.slice(i, theme.indexOf("id:'cosmic_purple'"));
  const pairs = [...block.matchAll(/'(--[a-z-]+)'\s*:\s*'([^']*)'/g)];
  assert.ok(pairs.length > 8, 'deep_ocean has no vars to compare');

  const tokens = read('public/css/tokens.css');
  const declared = (name) => {
    const m = tokens.match(new RegExp(`^\\s*${name}:\\s*([^;]+);`, 'm'));
    return m && m[1].trim();
  };
  const norm = (v) => v.replace(/\s+/g, '').toLowerCase();

  const drifted = [];
  for (const [name, value] of pairs) {
    const want = declared(name);
    if (!want) continue;               // theme-only keys are fine
    if (want.startsWith('var(')) continue;  // alias, resolved elsewhere
    if (norm(want) !== norm(value)) drifted.push(`${name}: tokens.css=${want} theme.js=${value}`);
  }
  assert.deepEqual(drifted, [],
    'deep_ocean overrides tokens.css — the app will not look like the stylesheet');
});

test('the wordmark glow is off in BOTH places', () => {
  // Turning it off in CSS alone did nothing: theme.js re-applied it at runtime.
  assert.match(read('public/css/tokens.css'), /--title-glow:\s*none/);
  assert.match(read('public/js/theme.js'), /'--title-glow':'none'/);
});

// ── sub-apps ──────────────────────────────────────────────────────────────
// 분석 (Soul Code · Biofeedback), 명상 and 코스믹 are separate documents in
// iframes. None loaded the palette, so each had grown its own: #050810 and
// #2a2250 grounds against the app's #060A12. Switching tabs switched product.

const SUBAPPS = ['public/biofield.html', 'public/cosmic.html',
                 'ce5-protocol/public/index.html', 'akashic-frequency/public/index.html'];

test('every sub-app links the shared palette', () => {
  for (const f of SUBAPPS) {
    assert.match(read(f), /<link rel="stylesheet" href="\/css\/tokens\.css">/, `${f} does not link tokens.css`);
  }
});

test('tokens.css is declarations only — linking it cannot move a layout', () => {
  // The sub-apps were built without base.css's reset; inheriting its `body`
  // and `html` rules would reflow them. That is why the tokens were split out.
  const t = read('public/css/tokens.css');
  const withoutComments = t.replace(/\/\*[\s\S]*?\*\//g, '');
  const selectors = [...withoutComments.matchAll(/^([^@\s{][^{]*)\{/gm)].map((m) => m[1].trim());
  assert.deepEqual(selectors, [':root'], `tokens.css must contain only :root, found: ${selectors}`);
});

test('no sub-app keeps its own ground colour', () => {
  for (const f of SUBAPPS) {
    const s = read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');
    for (const dead of ['#050810', '#2a2250', '#1a1530']) {
      assert.ok(!s.toLowerCase().includes(dead), `${f} still paints ${dead}`);
    }
  }
});

test('a translucent wash was never swapped for a solid block', () => {
  // rgba(248,113,113,.25) -> var(--error) turns a faint tint into a red block.
  // That shipped briefly; --error-tint exists so it cannot recur silently.
  assert.match(read('public/css/tokens.css'), /--error-tint: rgba\(248, 113, 113, \.22\)/);
  for (const f of ['public/biofield.html', 'public/cosmic.html']) {
    assert.doesNotMatch(read(f), /background:\s*var\(--error\)[;}]/,
      `${f} paints a surface with solid --error`);
  }
});

test('no custom property references itself', () => {
  // `--text-primary: var(--text-primary)` is a cycle. CSS declares it invalid
  // at computed-value time and drops it, so `color: var(--text-primary)` falls
  // back to the INITIAL colour — black text on a dark card, with nothing in the
  // console. This shipped: the sub-apps redefine the shared names in their own
  // :root, and the palette migration rewrote the values of those definitions,
  // which is how the meditation tab lost the text in every programme card.
  const files = [
    'public/5do.html', 'public/biofield.html', 'public/cosmic.html',
    'ce5-protocol/public/index.html', 'akashic-frequency/public/index.html',
    'public/css/tokens.css', 'public/css/base.css', 'public/css/layout.css',
    'public/css/components.css', 'public/css/player.css',
  ];
  const cycles = [];
  for (const f of files) {
    for (const m of read(f).matchAll(/(--[A-Za-z0-9-]+)\s*:\s*var\(\s*(--[A-Za-z0-9-]+)\s*\)/g)) {
      if (m[1] === m[2]) cycles.push(`${f}: ${m[1]}`);
    }
  }
  assert.deepEqual(cycles, [], 'self-referential custom properties');
});

test('a sub-app may alias a shared token but never redefine it as itself', () => {
  // The safe shapes are `--primary: var(--qtx)` (alias to another token) and
  // `--surface: #252540` (a deliberate local value). Only the cycle is fatal.
  const ce5 = read('ce5-protocol/public/index.html');
  const root = ce5.slice(ce5.indexOf(':root {'), ce5.indexOf('}', ce5.indexOf(':root {')));
  assert.match(root, /--primary: var\(--qtx\)/, 'the meditation accent lost its hue');
  assert.doesNotMatch(root, /--text-primary\s*:/, 'the cyclic declaration is back');
});
