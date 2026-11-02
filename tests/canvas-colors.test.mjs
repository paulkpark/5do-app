import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Canvas 2D does not resolve CSS custom properties. Measured in headless
// Chrome 2026-11-03:
//
//   ctx.fillStyle = 'var(--c)'   → assignment IGNORED, the context keeps the
//                                  colour it already had
//   addColorStop(0,'var(--c)')   → throws SyntaxError
//   hexToRgb('var(--c)')         → NaN, and '#NaNNaNNaN' then throws too
//   <rect fill="var(--c)">       → DOES resolve (presentation attributes are
//                                  parsed as CSS), so SVG is left alone
//
// The palette migration (ca78250) rewrote 20-odd colour literals that were
// never CSS: they were JS strings on their way to a 2D context. The worst was
// the CE5 guide, whose background gradient threw on the first frame of the
// first step — inside a requestAnimationFrame loop started from a React
// effect, so the throw escaped the effect and unmounted the whole tree. The
// bell rang and the screen stayed empty.
//
// Every such colour now goes through cvar(), which resolves var() off
// documentElement once and caches it. This file pins that.

const root = new URL('../', import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, root), 'utf8');

const FILES = [
  'public/5do.html', 'public/biofield.html', 'public/cosmic.html',
  'ce5-protocol/public/index.html', 'akashic-frequency/public/index.html',
];

const strip = (s) => s.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

test('no canvas colour is assigned a raw var()', () => {
  const bad = [];
  for (const f of FILES) {
    strip(read(f)).split('\n').forEach((line, i) => {
      if (!/(fillStyle|strokeStyle|shadowColor|addColorStop)/.test(line)) return;
      if (!line.includes('var(--')) return;
      if (line.includes('cvar(')) return;     // resolved
      bad.push(`${f}:${i + 1} ${line.trim().slice(0, 90)}`);
    });
  }
  assert.deepEqual(bad, [], 'a 2D context is being handed an unresolved token');
});

test('no colour arithmetic is handed a raw var()', () => {
  // mix()/hexToRgb() slice two characters at a time out of a hex string.
  const bad = [];
  for (const f of FILES) {
    for (const m of strip(read(f)).matchAll(/(mix|hexToRgb|parseInt)\(\s*['"]var\(/g)) {
      bad.push(`${f}: ${m[1]}('var(…)`);
    }
  }
  assert.deepEqual(bad, [], 'a hex parser is being handed a token name');
});

test('no token is concatenated with a hex alpha suffix', () => {
  // `${ec.primary}60` and colours[step]+'30' are how alpha is written here.
  // 'var(--x)60' is not a colour at all, and the declaration is dropped.
  const bad = [];
  for (const f of FILES) {
    for (const m of strip(read(f)).matchAll(/var\(--[A-Za-z0-9-]+\)[0-9a-fA-F]{2}['"`]/g)) {
      bad.push(`${f}: ${m[0]}`);
    }
  }
  assert.deepEqual(bad, [], 'token + hex alpha is not a colour');
});

test('every file that calls cvar() defines it', () => {
  for (const f of FILES) {
    const src = read(f);
    if (!src.includes('cvar(')) continue;
    assert.match(src, /function cvar\(v\)/, `${f} calls cvar() without defining it`);
    assert.match(src, /getComputedStyle\(document\.documentElement\)\.getPropertyValue/,
      `${f}'s cvar() does not read the computed value`);
  }
});

test('cvar() is defined at the top level, not inside a drawing function', () => {
  // It was briefly nested inside drawChromaPattern, where the cache was
  // rebuilt on every frame and the other two call sites could not see it.
  for (const f of FILES) {
    const src = read(f);
    const i = src.indexOf('function cvar(v)');
    if (i < 0) continue;
    const line = src.slice(src.lastIndexOf('\n', i) + 1, i + 16);
    assert.equal(line, 'function cvar(v)', `${f}: cvar() is indented, so it is nested`);
  }
});

test('the CE5 step palette is resolved once, at the top', () => {
  // These seven feed both fillStyle and the gradient that used to throw.
  const ce5 = read('ce5-protocol/public/index.html');
  assert.match(ce5, /const colors = \[[^\]]*\]\.map\(cvar\);/,
    'the CE5 step colours are no longer resolved');
});

test('element and spectral colours stay literals', () => {
  // Air is sky blue and Metal is white because the system says so — they are
  // data, like a chakra colour, and they are also parsed and alpha-suffixed.
  // Pointing them at theme tokens changed their meaning AND broke them.
  const ak = read('akashic-frequency/public/index.html');
  assert.match(ak, /"바람": \{ primary: "#6EC8F5"/, 'the Air element lost its hue');
  assert.match(ak, /chromaColors: \["#FFFFFF","#8B00FF"\]/, 'Metal lost its white');
  assert.doesNotMatch(ak, /<meta name="theme-color" content="var\(/,
    'theme-color cannot be a var() — the browser ignores it');
});
