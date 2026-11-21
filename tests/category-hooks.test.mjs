import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mergeHooks, onlyHooksMoved } from '../scripts/merge-category-hooks.mjs';

// Library rows now lead with a situation ("컨디션이 바닥났을 때") and drop the
// category name to the subtitle. The copy lives in data/category-hooks.json and
// is merged into meta.json; the row is built by folderHeadline().

const root = new URL('../', import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, root), 'utf8');
const HOOKS = JSON.parse(read('data/category-hooks.json'));
const ENTRIES = Object.entries(HOOKS).filter(([k]) => !k.startsWith('_'));

// supabase-api.js is a classic script; lift the two functions out and run them.
function headline(lang) {
  const src = read('public/js/supabase-api.js');
  const pick = (name) => {
    const at = src.indexOf(`function ${name}(`);
    return src.slice(at, src.indexOf('\n}\n', at) + 3);
  };
  return new Function('LANG', `${pick('getLocalized')}\n${pick('folderHeadline')}\nreturn folderHeadline;`)(lang);
}

test('every library category has a hook in both languages', () => {
  const folders = [
    'Akashic_Gateway', 'Body_Organ_Therapy', 'Brainwave_States', 'Chakra_Activation',
    'Crystal_Frequencies', 'Divine_Tunes', 'Holland_Resonance', 'Meditation_and_Breathwork',
    'Nature_Resonance', 'PEMF_Audiotherapy', 'Quantum_Torus_X', 'RIFE_Frequency_Therapy',
    'Singing_Bowls', 'Solfeggio_Frequencies', 'Torus_Harmonics', 'Useful_Frequencies', 'White_Noise',
  ];
  assert.deepEqual(ENTRIES.map(([k]) => k).sort(), folders);
  for (const [k, h] of ENTRIES) {
    assert.ok(h.ko && h.en, `${k} is missing a language`);
    assert.match(h.ko, /[가-힣]/, `${k}.ko is not Korean`);
    assert.doesNotMatch(h.en, /[가-힣]/, `${k}.en has Korean in it`);
  }
});

test('a hook fits on one line of a phone row', () => {
  // .v-title is nowrap + ellipsis at 16px beside a 96px thumbnail. A cut hook
  // is worse than none — the point of it is the last word ("…할 때").
  // Measured, not guessed: every hook below was rendered with the real CSS at
  // 360px and 390px on 2026-11-22 and none overflowed. The longest Korean one,
  // "오직 나에게만 집중하는 시간", is 15 characters with spaces, so that is the
  // line. Going past it means rendering again, not raising the number.
  for (const [k, h] of ENTRIES) {
    assert.ok([...h.ko].length <= 15, `${k}.ko is ${[...h.ko].length} chars: ${h.ko}`);
    assert.ok(h.en.length <= 28, `${k}.en is ${h.en.length} chars: ${h.en}`);
  }
});

test('no hook makes a medical claim', () => {
  // Wellness / experience wording only — the same rule as every other piece of
  // copy in the app.
  const BAD = /치료|치유|완치|진단|처방|효능|통증|질병|낫|cure|heal|treat|therap|diagnos|remed|pain|disease|symptom/i;
  for (const [k, h] of ENTRIES) {
    assert.doesNotMatch(h.ko, BAD, `${k}.ko: ${h.ko}`);
    assert.doesNotMatch(h.en, BAD, `${k}.en: ${h.en}`);
  }
});

test('with a hook, the hook leads and the name becomes the subtitle', () => {
  const meta = { title_ko: 'RIFE 주파수 치료', title_en: 'RIFE Frequency Therapy',
    desc_ko: '설명', hook_ko: '컨디션이 바닥났을 때', hook_en: 'Running on empty' };
  assert.deepEqual(headline('ko')(meta, 'RIFE'), { title: '컨디션이 바닥났을 때', sub: 'RIFE 주파수 치료' });
  assert.deepEqual(headline('en')(meta, 'RIFE'), { title: 'Running on empty', sub: 'RIFE Frequency Therapy' });
});

test('without a hook the row is exactly what it was', () => {
  const meta = { title_ko: '화이트 노이즈', desc_ko: '백색 소음' };
  assert.deepEqual(headline('ko')(meta, 'White'), { title: '화이트 노이즈', sub: '백색 소음' });
  assert.deepEqual(headline('ko')(null, 'White Noise'), { title: 'White Noise', sub: '카테고리 열기' });
});

test('an English screen never shows a Korean hook', () => {
  // getLocalized falls back across languages; the hook deliberately does not.
  const meta = { title_ko: '싱잉볼', title_en: 'Singing Bowls', desc_en: 'Bowls', hook_ko: '복잡한 머릿속을 비울 때' };
  assert.deepEqual(headline('en')(meta, 'x'), { title: 'Singing Bowls', sub: 'Bowls' });
});

test('the merge touches hook fields only, and only on folders that exist', () => {
  const live = {
    'A/_folder': { title_ko: 'a', desc_ko: 'd' },
    'A/1.mp3': { title_ko: 't' },
  };
  const { out, changes, missing } = mergeHooks(live, { A: { ko: '가', en: 'a' }, Z: { ko: '나', en: 'z' } });
  assert.deepEqual(missing, ['Z'], 'a hook for a folder that does not exist was invented into meta.json');
  assert.equal(Object.keys(out).length, 2);
  assert.deepEqual(out['A/_folder'], { title_ko: 'a', desc_ko: 'd', hook_ko: '가', hook_en: 'a' });
  assert.equal(changes.length, 2);
  assert.ok(onlyHooksMoved(live, out));
  assert.deepEqual(live['A/_folder'], { title_ko: 'a', desc_ko: 'd' }, 'the input was mutated');
});

test('the guard catches any change beyond the hooks', () => {
  const live = { 'A/_folder': { title_ko: 'a' }, 'A/1.mp3': { title_ko: 't' } };
  assert.equal(onlyHooksMoved(live, { 'A/_folder': { title_ko: 'b' }, 'A/1.mp3': { title_ko: 't' } }), false);
  assert.equal(onlyHooksMoved(live, { 'A/_folder': { title_ko: 'a' } }), false, 'a dropped entry got through');
});

test('the library row is built by folderHeadline', () => {
  const html = read('public/5do.html');
  assert.match(html, /folderHeadline\(lookupFolderMeta\(name\), prettyName\(name\)\)/);
});
