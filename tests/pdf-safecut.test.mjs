import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// pdfSafeCutRows decides where a captured report may be split across pages.
// Both exports depend on it — the cream natal capture and the dark Soul Code
// report — so it is tested directly rather than through either of them.

const html = fs.readFileSync(new URL('../akashic-frequency/public/index.html', import.meta.url), 'utf8');
const src = (() => {
  const START = 'function pdfSafeCutRows(canvas, from, rows)';
  const i = html.indexOf(START);
  assert.ok(i > 0, 'pdfSafeCutRows not found');
  const end = html.indexOf('\n}', html.indexOf('return rows;        // solid content', i)) + 2;
  return html.slice(i, end);
})();
const pdfSafeCutRows = new Function(src + '\nreturn pdfSafeCutRows;')();

// A canvas whose rows are either flat (a gap) or patterned (a line of text).
function canvasOf({ width = 1400, height = 8000, isText, throws = false }) {
  return {
    width, height,
    getContext: () => ({
      getImageData(x, top, w, h) {
        if (throws) { const e = new Error('tainted'); e.name = 'SecurityError'; throw e; }
        const data = new Uint8ClampedArray(w * h * 4);
        for (let r = 0; r < h; r++) {
          const text = isText(top + r);
          for (let c = 0; c < w; c++) {
            const i = (r * w + c) * 4;
            // A text row varies across its width; a gap row does not.
            const v = text ? (c % 2 ? 20 : 240) : 60;
            data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = 255;
          }
        }
        return { data };
      },
    }),
  };
}

test('a cut is pulled up out of a line of text into the gap above it', () => {
  // Lines every 40 rows: 24 of text, then 16 of gap.
  const isText = (y) => (y % 40) < 24;
  const from = 0, rows = 2000;                 // 2000 % 40 = 0 -> inside a line
  assert.ok(isText(from + rows), 'the plain cut should land in text for this to mean anything');
  const out = pdfSafeCutRows(canvasOf({ isText }), from, rows);
  assert.ok(!isText(from + out), `cut at ${from + out} is still inside a line`);
  assert.ok(out < rows && out > rows * 0.75, `moved too far: ${out} of ${rows}`);
});

test('a flat row of any colour counts as a gap, not just the page background', () => {
  // The Soul Code report is dark and most of its gaps are card-coloured; the
  // natal capture is cream. Uniformity is what both have in common.
  const isText = (y) => y !== 1900;
  const out = pdfSafeCutRows(canvasOf({ isText }), 0, 2000);
  assert.equal(out, 1900);
});

test('a gap further back than a quarter page is left alone', () => {
  // A short ragged page is the worse outcome, so the plain cut stands.
  const isText = (y) => y !== 500;
  const out = pdfSafeCutRows(canvasOf({ isText }), 0, 2000);
  assert.equal(out, 2000);
});

test('solid content with no gap takes the plain cut rather than hanging', () => {
  const out = pdfSafeCutRows(canvasOf({ isText: () => true }), 0, 2000);
  assert.equal(out, 2000);
});

test('a canvas that cannot be read falls back instead of throwing', () => {
  const out = pdfSafeCutRows(canvasOf({ isText: () => false, throws: true }), 0, 2000);
  assert.equal(out, 2000);
});

test('a canvas with no 2d context falls back', () => {
  assert.equal(pdfSafeCutRows({ width: 100, height: 100, getContext: () => null }, 0, 50), 50);
  assert.equal(pdfSafeCutRows({ width: 100, height: 100, getContext: () => ({}) }, 0, 50), 50);
});

test('the returned height is always positive and never grows the slice', () => {
  const isText = (y) => (y % 13) < 9;
  for (const rows of [40, 137, 500, 2000]) {
    const out = pdfSafeCutRows(canvasOf({ isText }), 0, rows);
    assert.ok(out > 0 && out <= rows, `rows=${rows} -> ${out}`);
  }
});
