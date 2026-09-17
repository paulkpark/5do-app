import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// The reading is now drawn as text, so its layout is code rather than a
// screenshot: markdown parsing, inline bold, and line wrapping. None of that is
// visible in a diff, so it is exercised here against the real functions.

const html = fs.readFileSync(new URL('../akashic-frequency/public/index.html', import.meta.url), 'utf8');
const slice = (start, end) => {
  const i = html.indexOf(start);
  assert.ok(i > 0, 'not found: ' + start);
  return html.slice(i, html.indexOf(end, i));
};
const src = slice('/** Split markdown into blocks', 'async function natalExportPdf(doc)');
const api = new Function(src + '\nreturn { natalParseBlocks, natalInlineRuns, natalWrapRuns, NATAL_CJK };')();

test('markdown becomes the blocks the writer lays out', () => {
  const b = api.natalParseBlocks([
    '첫 문단입니다.',
    '이어지는 줄.',
    '',
    '## 소제목',
    '- 목록 하나',
    '- 목록 둘',
    '',
    '> 인용문',
    '---',
    '마지막 문단.',
  ].join('\n'));
  assert.deepEqual(b.map((x) => x.type), ['p', 'sub', 'li', 'li', 'quote', 'hr', 'p']);
  // Wrapped lines of one paragraph join, rather than becoming two paragraphs.
  assert.equal(b[0].text, '첫 문단입니다. 이어지는 줄.');
  assert.equal(b[1].text, '소제목');
  assert.equal(b[2].text, '목록 하나');
  assert.equal(b[4].text, '인용문');
});

test('inline markers become runs, so bold can be drawn with the bold face', () => {
  const runs = api.natalInlineRuns('태양은 **쌍둥이자리**에 있고 *상승점*은 처녀자리입니다.');
  assert.deepEqual(runs.map((r) => [r.text, r.bold, r.italic]), [
    ['태양은 ', false, false],
    ['쌍둥이자리', true, false],
    ['에 있고 ', false, false],
    ['상승점', false, true],
    ['은 처녀자리입니다.', false, false],
  ]);
});

test('text with no markers is a single run', () => {
  const runs = api.natalInlineRuns('평범한 문장입니다.');
  assert.equal(runs.length, 1);
  assert.equal(runs[0].bold, false);
});

// A stand-in for jsPDF's measurement: 2mm per Latin char, 4mm per CJK char.
const fakePdf = () => ({
  getTextWidth: (t) => [...String(t)].reduce((w, ch) => w + (api.NATAL_CJK.test(ch) ? 4 : 2), 0),
});

test('Korean wraps between characters — spaces alone would overflow the page', () => {
  const pdf = fakePdf();
  // 40 Hangul syllables, no spaces at all: 160mm of text into a 40mm column.
  const text = '가'.repeat(40);
  const lines = api.natalWrapRuns(pdf, [{ text, bold: false }], 40, 10, () => {});
  assert.ok(lines.length >= 4, `expected several lines, got ${lines.length}`);
  for (const line of lines) {
    const w = line.reduce((a, r) => a + pdf.getTextWidth(r.text), 0);
    assert.ok(w <= 40, `line overflows: ${w}mm`);
  }
  // Nothing is dropped.
  const out = lines.flat().map((r) => r.text).join('');
  assert.equal(out.replace(/\s/g, ''), text);
});

test('Latin words are not broken mid-word', () => {
  const pdf = fakePdf();
  const text = 'Mercury conjunct Ascendant applying';
  const lines = api.natalWrapRuns(pdf, [{ text, bold: false }], 30, 10, () => {});
  const joined = lines.flat().map((r) => r.text).join('').replace(/\s+/g, ' ').trim();
  assert.equal(joined, text);
  for (const line of lines) {
    for (const r of line) {
      for (const word of r.text.trim().split(/\s+/)) {
        if (word) assert.ok(!/^[a-z]/.test(word) || text.includes(word), 'fragmented: ' + word);
      }
    }
  }
});

test('bold survives a line break — the run keeps its weight on the next line', () => {
  const pdf = fakePdf();
  const runs = [
    { text: '앞부분 ', bold: false },
    { text: '강조된긴문장입니다여기서줄이바뀝니다', bold: true },
  ];
  const lines = api.natalWrapRuns(pdf, runs, 40, 10, () => {});
  assert.ok(lines.length > 1);
  const boldLines = lines.filter((l) => l.some((r) => r.bold));
  assert.ok(boldLines.length > 1, 'the bold run should continue onto following lines as bold');
});

test('a line never opens with the space that caused the wrap', () => {
  const pdf = fakePdf();
  const lines = api.natalWrapRuns(pdf, [{ text: 'alpha beta gamma delta epsilon', bold: false }], 22, 10, () => {});
  for (const line of lines.slice(1)) {
    assert.ok(!/^\s/.test(line[0].text), 'line starts with a space: ' + JSON.stringify(line[0].text));
  }
});

test('empty and whitespace input do not throw', () => {
  const pdf = fakePdf();
  assert.deepEqual(api.natalParseBlocks(''), []);
  assert.deepEqual(api.natalParseBlocks('   \n\n  '), []);
  assert.doesNotThrow(() => api.natalWrapRuns(pdf, [{ text: '', bold: false }], 40, 10, () => {}));
});

test('a markdown table row degrades to a readable line rather than being dropped', () => {
  const b = api.natalParseBlocks('| 천체 | 사인 |\n|---|---|\n| 태양 | 쌍둥이 |');
  const texts = b.map((x) => x.text);
  assert.ok(texts.some((t) => t && t.includes('태양') && t.includes('쌍둥이')), JSON.stringify(texts));
  // The separator row carries no information and should not become a line.
  assert.ok(!texts.some((t) => t && /^[-\s|:]+$/.test(t)));
});
