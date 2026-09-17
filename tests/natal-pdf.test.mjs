import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// natalExportPdf drives html2canvas and jsPDF, neither of which exists here, so
// both are faked. What is actually checked is the part that can be wrong without
// throwing: what goes onto the page, how it paginates, and that the off-screen
// element is always removed.

const html = fs.readFileSync(new URL('../akashic-frequency/public/index.html', import.meta.url), 'utf8');
const src = (() => {
  const START = 'async function natalExportPdf(doc)';
  const END = '// Reuse the geocoder Soul Code already ships';
  const i = html.indexOf(START);
  assert.ok(i > 0, 'natalExportPdf not found in index.html');
  return html.slice(i, html.indexOf(END, i));
})();

// rows(y) -> true when that canvas row is text (dark), false when it is page
// background. Lets a test lay out lines and check where the cut lands.
function harness({ canvasHeight = 2000, canvasFail = false, rowIsText = null, taint = false } = {}) {
  const log = { added: [], saved: null, pages: 1, texts: [], appended: 0, removed: 0, captured: null, slices: [] };

  const makeCanvas = (w, h) => ({
    width: w, height: h,
    getContext: () => ({
      drawImage() {},
      getImageData(x, top, width, height) {
        if (taint) { const e = new Error('tainted'); e.name = 'SecurityError'; throw e; }
        const data = new Uint8ClampedArray(width * height * 4);
        for (let r = 0; r < height; r++) {
          const dark = rowIsText ? rowIsText(top + r) : false;
          for (let c = 0; c < width; c++) {
            const i = (r * width + c) * 4;
            // #FBF8F2 background, or near-black ink
            data[i] = dark ? 20 : 251;
            data[i + 1] = dark ? 20 : 248;
            data[i + 2] = dark ? 20 : 242;
            data[i + 3] = 255;
          }
        }
        return { data };
      },
    }),
    toDataURL: () => 'data:image/jpeg;base64,AA',
  });

  const el = () => {
    const node = {
      className: '', style: { cssText: '' }, innerHTML: '',
      width: 0, height: 0,
      getContext: () => ({ drawImage(src, sx, sy, sw, sh) { log.slices.push([sy, sh]); } }),
      toDataURL: () => 'data:image/jpeg;base64,AA',
      remove() { log.removed++; },
    };
    return node;
  };

  const document = {
    createElement: () => el(),
    body: { appendChild(n) { log.appended++; log.captured = n; } },
  };

  const html2canvas = async (node, opts) => {
    if (canvasFail) throw new Error('capture failed');
    log.captureOpts = opts;
    return makeCanvas(1520, canvasHeight);
  };

  function jsPDF() {
    return {
      addPage() { log.pages++; },
      addImage(...a) { log.added.push(a); },
      setFontSize() {}, setTextColor() {},
      text(t) { log.texts.push(t); },
      save(name) { log.saved = name; },
    };
  }

  const win = { jspdf: { jsPDF } };
  const fn = new Function('window', 'document', 'html2canvas', 'setTimeout', 'encodeURIComponent', 'console',
    src + '\nreturn natalExportPdf;',
  )(win, document, html2canvas, (f) => f(), encodeURIComponent, console);
  return { fn, log };
}

const doc = (over = {}) => ({
  lang: 'ko', title: '테스트', born: '1990-06-15 12:00 (Asia/Seoul)', place: 'Seoul',
  timeUnknown: false,
  wheelSVG: '<div class="wheelbox"><svg viewBox="0 0 400 400"><circle r="1"/></svg></div>',
  disclaimer: '점성술은 검증된 예측 과학이 아닙니다.',
  sections: [{ n: 2, title: '빅3', body: 'x', html: '<p>본문</p>' }],
  chartTables: {
    title: '출생차트',
    tabs: [
      { key: 'planets', label: '천체', html: '<div class="plate"><table class="data"><tbody><tr><td class="b">태양</td></tr></tbody></table></div>' },
      { key: 'houses', label: '하우스', html: '<div class="plate"><table class="data"><tbody><tr><td>1</td></tr></tbody></table></div>' },
      { key: 'aspects', label: '어스펙트', html: '<div class="plate"><table class="data"><tbody><tr><td>트라인</td></tr></tbody></table></div>' },
      { key: 'balance', label: '균형·구조', html: '<div class="plate"><table class="data"><tbody><tr><td>불</td></tr></tbody></table></div>' },
    ],
  },
  ...over,
});

test('refuses to export a reading with no generated sections', async () => {
  const { fn } = harness();
  await assert.rejects(() => fn(doc({ sections: [] })), /nothing to export/);
});

test('refuses when the pdf libraries are missing rather than failing obscurely', async () => {
  const fn = new Function('window', 'document', 'html2canvas', 'setTimeout', 'encodeURIComponent', 'console',
    src + '\nreturn natalExportPdf;')({}, { createElement: () => ({ style: {} }), body: { appendChild() {} } }, undefined, (f) => f(), encodeURIComponent, console);
  await assert.rejects(() => fn(doc()), /pdf libraries unavailable/);
});

test('the page carries the reading, not the interface', async () => {
  const { fn, log } = harness();
  await fn(doc());
  const h = log.captured.innerHTML;
  assert.match(h, /테스트/, 'title');
  assert.match(h, /Asia\/Seoul/, 'birth data');
  assert.match(h, /<p>본문<\/p>/, 'section body from the module own markdown pass');
  assert.match(h, /2<\/span>빅3/, 'numbered section heading');
  assert.match(h, /검증된 예측 과학이 아닙니다/, 'disclaimer must survive into the export');
});

test('the wheel is embedded as a data URI image, not inline svg', async () => {
  const { fn, log } = harness();
  await fn(doc());
  const h = log.captured.innerHTML;
  const img = /<img[^>]+src="data:image\/svg\+xml;charset=utf-8,([^"]*)"/.exec(h);
  assert.ok(img, 'html2canvas is unreliable with inline svg, so it must be a data URI image');
  assert.ok(!/<svg/i.test(h), 'no raw svg should remain in the captured page');
  // Decode the src alone — the surrounding markup is not percent-encoded.
  assert.match(decodeURIComponent(img[1]), /xmlns="http:\/\/www\.w3\.org\/2000\/svg"/,
    'a standalone svg needs its namespace to render as an image');
});

test('a missing or malformed wheel does not stop the export', async () => {
  for (const w of [undefined, '', '<div>no svg here</div>']) {
    const { fn, log } = harness();
    await fn(doc({ wheelSVG: w }));
    assert.ok(log.saved, 'export still completes');
    assert.ok(!/<img/.test(log.captured.innerHTML), 'no broken image tag');
  }
});

test('an unknown birth time is stated on the page', async () => {
  const { fn, log } = harness();
  await fn(doc({ timeUnknown: true }));
  assert.match(log.captured.innerHTML, /출생 시각을 모르는/);
  const en = harness();
  await en.fn(doc({ timeUnknown: true, lang: 'en' }));
  assert.match(en.log.captured.innerHTML, /Birth time unknown/);
});

test('content taller than one sheet paginates, each page footed', async () => {
  // A4 content height is ~273mm usable; at this canvas size that is several pages.
  const { fn, log } = harness({ canvasHeight: 9000 });
  await fn(doc());
  assert.ok(log.pages > 1, `expected multiple pages, got ${log.pages}`);
  assert.equal(log.added.length, log.pages, 'every page gets its slice');
  // Two footer strings per page: the label and the page number.
  assert.equal(log.texts.length, log.pages * 2);
  assert.ok(log.texts.includes('1 / ' + log.pages));
});

test('a short reading stays on a single page', async () => {
  const { fn, log } = harness({ canvasHeight: 900 });
  await fn(doc());
  assert.equal(log.pages, 1);
  assert.equal(log.added.length, 1);
});

test('the off-screen page is removed even when capture fails', async () => {
  const { fn, log } = harness({ canvasFail: true });
  await assert.rejects(() => fn(doc()), /capture failed/);
  assert.equal(log.appended, 1);
  assert.equal(log.removed, 1, 'a leaked 760px element would sit in the DOM forever');
});

test('the filename survives Korean and drops characters a filesystem rejects', async () => {
  const { fn, log } = harness();
  await fn(doc({ title: '박/폴: 천궁도*' }));
  assert.ok(!/[/:*]/.test(log.saved), log.saved);
  assert.match(log.saved, /천궁도/);
  assert.match(log.saved, /\.pdf$/);
});

test('an untitled chart still produces a usable filename', async () => {
  const { fn, log } = harness();
  await fn(doc({ title: '///' }));
  assert.match(log.saved, /^natal_/);
});

test('the wheel is given an intrinsic size, or it draws as nothing', async () => {
  const { fn, log } = harness();
  await fn(doc());
  const src = /<img[^>]+src="data:image\/svg\+xml;charset=utf-8,([^"]*)"/.exec(log.captured.innerHTML)[1];
  const svg = decodeURIComponent(src);
  // On screen the stylesheet sizes it; an <img> gets no external CSS, so a
  // viewBox alone leaves the image with no intrinsic dimensions.
  assert.match(svg, /<svg[^>]*\bwidth="400"/, 'width must be on the svg element itself');
  assert.match(svg, /<svg[^>]*\bheight="400"/);
});

test('an svg that already declares a size is left alone', async () => {
  const { fn, log } = harness();
  await fn(doc({ wheelSVG: '<div><svg width="200" height="200" viewBox="0 0 400 400"><circle r="1"/></svg></div>' }));
  const src = /src="data:image\/svg\+xml;charset=utf-8,([^"]*)"/.exec(log.captured.innerHTML)[1];
  const svg = decodeURIComponent(src);
  assert.match(svg, /width="200"/);
  assert.ok(!/width="400"/.test(svg), 'must not stack a second width onto it');
});

test('the computed chart tables are exported, all four of them', async () => {
  const { fn, log } = harness();
  await fn(doc());
  const h = log.captured.innerHTML;
  // Section 1 is computed rather than generated, so it is absent from the
  // sections list — but it is what every reading is based on.
  assert.match(h, /<span class="n">1<\/span>출생차트/);
  for (const label of ['천체', '하우스', '어스펙트', '균형·구조']) {
    assert.match(h, new RegExp('<h3>' + label + '<\\/h3>'), label + ' table missing');
  }
  assert.match(h, /태양/);
  assert.match(h, /트라인/);
  // And they must come before the written sections, as on screen.
  assert.ok(h.indexOf('출생차트') < h.indexOf('빅3'), 'chart data belongs above the reading');
});

test('a document without chart tables still exports', async () => {
  const { fn, log } = harness();
  await fn(doc({ chartTables: undefined }));
  assert.ok(log.saved);
  assert.ok(!/<h3>/.test(log.captured.innerHTML));
});

test('each chart table is tagged so its columns can be sized', async () => {
  const { fn, log } = harness();
  await fn(doc());
  const h = log.captured.innerHTML;
  for (const k of ['planets', 'houses', 'aspects', 'balance']) {
    assert.match(h, new RegExp('class="tbl tbl-' + k + '"'), k + ' not tagged');
  }
});

test('table cells are allowed to wrap, or wide tables get clipped', async () => {
  const { fn, log } = harness();
  await fn(doc());
  const style = /<style>([\s\S]*?)<\/style>/.exec(log.captured.innerHTML)[1];
  // The page is ~652px of content and the bodies table has eight columns.
  // Holding every cell on one line is what pushed it past the capture width.
  const cellRule = /\.np table\.data td\{[^}]*\}/.exec(style)[0];
  assert.ok(!/white-space:nowrap/.test(cellRule), 'cells must not be nowrap: ' + cellRule);
  assert.match(cellRule, /white-space:normal/);
  // Korean must break between words, not inside them.
  assert.match(cellRule, /word-break:keep-all/);
});

test('a tab without a key still renders rather than breaking the export', async () => {
  const { fn, log } = harness();
  await fn(doc({
    chartTables: { title: '출생차트', tabs: [{ label: '천체', html: '<p>t</p>' }] },
  }));
  assert.ok(log.saved);
  assert.match(log.captured.innerHTML, /class="tbl tbl-"/);
});

// ── page breaks ────────────────────────────────────────────────────────────
// One page of canvas at the export's own numbers: content is 186mm wide and
// 273mm tall, and the canvas is 1520px wide, so a page is about 2231px.
const PAGE_PX = Math.floor((297 - 12 * 2 - 8) / ((210 - 12 * 2) / 1520));

test('a page break lands in the gap between lines, not through one', async () => {
  // Text lines every 40px, each 24px tall — so rows 24..39 of each band are gaps.
  const rowIsText = (y) => (y % 40) < 24;
  const { fn, log } = harness({ canvasHeight: PAGE_PX * 2 + 500, rowIsText });
  await fn(doc());
  assert.ok(log.slices.length > 1, 'expected more than one page');
  for (const [, h] of log.slices.slice(0, -1)) {
    const cutRow = h;                       // first page cuts at y = h
    assert.ok(!rowIsText(cutRow - 1) || !rowIsText(cutRow),
      `cut at ${cutRow} falls inside a line of text`);
  }
});

test('the cut is pulled back to a gap rather than taken at the page edge', async () => {
  // A line of text straddles the ideal cut, with a gap shortly before it.
  const gapStart = PAGE_PX - 60, gapEnd = PAGE_PX - 40;
  const rowIsText = (y) => !(y >= gapStart && y < gapEnd);
  const { fn, log } = harness({ canvasHeight: PAGE_PX * 2, rowIsText });
  await fn(doc());
  const firstPageHeight = log.slices[0][1];
  assert.ok(firstPageHeight < PAGE_PX, 'the cut should move up, off the text');
  assert.ok(firstPageHeight >= gapStart && firstPageHeight < gapEnd,
    `expected a cut inside ${gapStart}..${gapEnd}, got ${firstPageHeight}`);
});

test('solid content with no gap still paginates instead of hanging', async () => {
  // The chart wheel is a big graphic — there may be no blank row to find.
  const { fn, log } = harness({ canvasHeight: PAGE_PX * 2 + 10, rowIsText: () => true });
  await fn(doc());
  assert.ok(log.slices.length >= 2);
  assert.equal(log.slices[0][1], PAGE_PX, 'falls back to the full-page cut');
});

test('pages never exceed one sheet, and together cover the whole canvas', async () => {
  const rowIsText = (y) => (y % 37) < 20;
  const height = PAGE_PX * 3 + 137;
  const { fn, log } = harness({ canvasHeight: height, rowIsText });
  await fn(doc());
  let covered = 0;
  for (const [y, h] of log.slices) {
    assert.equal(y, covered, 'pages must be contiguous — no content skipped');
    assert.ok(h > 0 && h <= PAGE_PX, `page height ${h} out of range`);
    covered += h;
  }
  assert.equal(covered, height, 'the last page must reach the end');
});

test('a canvas that cannot be read falls back to fixed slicing', async () => {
  const { fn, log } = harness({ canvasHeight: PAGE_PX * 2, taint: true });
  await fn(doc());
  assert.ok(log.saved, 'a SecurityError must not break the export');
  assert.equal(log.slices[0][1], PAGE_PX);
});

test('the page count in the footer matches the pages produced', async () => {
  const rowIsText = (y) => (y % 40) < 24;
  const { fn, log } = harness({ canvasHeight: PAGE_PX * 2 + 300, rowIsText });
  await fn(doc());
  const n = log.slices.length;
  assert.ok(log.texts.includes('1 / ' + n));
  assert.ok(log.texts.includes(n + ' / ' + n));
});
