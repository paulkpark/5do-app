import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PATTERNS, CATEGORY_DEFAULTS, lookupPattern } from '../public/js/cymatics-patterns.js';

test('PATTERNS: 4 patterns with required fields', () => {
  const names = Object.keys(PATTERNS);
  assert.deepEqual(names.sort(), ['chladni', 'liquid', 'mandala', 'particle']);
  for (const name of names) {
    const p = PATTERNS[name];
    assert.equal(typeof p.modeIndex, 'number', `${name}.modeIndex`);
    assert.ok(Array.isArray(p.palette) && p.palette.length >= 2, `${name}.palette`);
    for (const stop of p.palette) {
      assert.match(stop, /^#[0-9a-fA-F]{6}$/, `${name} palette stop ${stop}`);
    }
  }
});

test('CATEGORY_DEFAULTS: maps known categories to valid pattern names', () => {
  for (const [cat, pat] of Object.entries(CATEGORY_DEFAULTS)) {
    assert.ok(PATTERNS[pat], `category ${cat} → unknown pattern ${pat}`);
  }
  assert.equal(CATEGORY_DEFAULTS['Divine_Tunes'], 'mandala');
  assert.equal(CATEGORY_DEFAULTS['Akashic_Gateway'], 'mandala');
  assert.equal(CATEGORY_DEFAULTS['Chakra_Activation'], 'chladni');
  assert.equal(CATEGORY_DEFAULTS['Crystal_Frequencies'], 'liquid');
});

test('lookupPattern: user override beats track and category', () => {
  const result = lookupPattern({
    userOverride: 'particle',
    trackPreset: 'liquid',
    categoryPreset: 'chladni',
    category: 'Divine_Tunes'
  });
  assert.equal(result, 'particle');
});

test('lookupPattern: track preset beats category preset and built-in default', () => {
  const result = lookupPattern({
    userOverride: 'auto',
    trackPreset: 'liquid',
    categoryPreset: 'chladni',
    category: 'Divine_Tunes'
  });
  assert.equal(result, 'liquid');
});

test('lookupPattern: category preset beats built-in default', () => {
  const result = lookupPattern({
    userOverride: 'auto',
    trackPreset: null,
    categoryPreset: 'particle',
    category: 'Divine_Tunes'
  });
  assert.equal(result, 'particle');
});

test('lookupPattern: built-in default for known category', () => {
  const result = lookupPattern({
    userOverride: 'auto',
    trackPreset: null,
    categoryPreset: null,
    category: 'Akashic_Gateway'
  });
  assert.equal(result, 'mandala');
});

test('lookupPattern: unknown preset name falls through gracefully', () => {
  const result = lookupPattern({
    userOverride: 'nonsense',
    trackPreset: 'also-bad',
    categoryPreset: null,
    category: 'unknown_category'
  });
  assert.equal(result, 'mandala');
});

test('lookupPattern: completely unknown inputs → fallback', () => {
  const result = lookupPattern({});
  assert.equal(result, 'mandala');
});
