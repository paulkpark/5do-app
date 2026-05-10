import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PATTERNS, CATEGORY_DEFAULTS } from '../public/js/cymatics-patterns.js';

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
