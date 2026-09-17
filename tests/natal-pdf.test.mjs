import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// The export is deliberately hybrid: the chart block is captured as an image
// because it is the only part carrying astrological symbols, which no Korean
// font ships; the written reading is drawn as real text with an embedded font,
// which is what makes the file small and the words selectable.
//
// Neither half is visible in a diff, and neither runs outside a browser, so
// jsPDF, html2canvas and fetch are faked and the real functions are run against
// them.

const html = fs.readFileSync(new URL('../akashic-frequency/public/index.html', import.meta.url), 'utf8');
const src = (() => {
  const START = 'const NATAL_FONT = {';
  const END = '// Reuse the geocoder Soul Code already ships';
  const i = html.indexOf(START);
  assert.ok(i > 0, 'natal pdf block not found in index.html');
  return html.slice(i, html.indexOf(END, i));
})();

function harness({ captureFail = false, fontFail = false, canvasH = 900, rowIsText = null, taint = false } = {}) {
  const log = {
    texts: [], fonts: [], vfs: [], saved: null, pages: 1, ctorOpts: null,
    images: [], appended: 0, removed: 0, captured: null, fontUrls: [], slices: [],
  };

  function jsPDF(opts) {
    log.ctorOpts = opts;
    let curFont = null;
    return {
      addFileToVFS(name, data) { log.vfs.push([name, (data || '').length]); },
      addFont(vfsName, family, style) { log.fonts.push([vfsName, family, style]); },
      setFont(family, style) { curFont = style; },
      setFontSize() {}, setTextColor() {}, setDrawColor() {}, setLineWidth() {},
      line() {},
      getTextWidth: (t) => [...String(t)].length * 2,
      text(t) { log.texts.push({ text: String(t), bold: curFont === 'bold' }); },
      addImage(d, f, x, y, w, h) { log.images.push({ x, y, w, h }); },
      addPage() { log.pages++; },
      setPage() {},
      save(name) { log.saved = name; },
    };
  }

  const el = () => ({
    className: '', style: { cssText: '' }, innerHTML: '',
    width: 0, height: 0,
    getContext: () => ({ drawImage(src, sx, sy, sw, sh) { log.slices.push([sy, sh]); } }),
    toDataURL: () => 'data:image/jpeg;base64,AA',
    remove() { log.removed++; },
  });

  const document = {
    createElement: () => el(),
    body: { appendChild(n) { log.appended++; if (n.className === 'nc') log.captured = n; } },
  };

  const fetchImpl = async (url) => {
    log.fontUrls.push(url);
    if (fontFail) return { ok: false, status: 404 };
    return { ok: true, status: 200, arrayBuffer: async () => new Uint8Array([0x00, 0x01, 0x02, 0x03]).buffer };
  };

  // rowIsText(y) lets a test lay the capture out as lines and gaps, so where a
  // page break lands can be asserted.
  const html2canvas = async (node) => {
    if (captureFail) throw new Error('capture failed');
    return {
      width: 1400, height: canvasH,
      getContext: () => ({
        drawImage() {},
        getImageData(x, top, width, height) {
          if (taint) { const e = new Error('tainted'); e.name = 'SecurityError'; throw e; }
          const data = new Uint8ClampedArray(width * height * 4);
          for (let r = 0; r < height; r++) {
            const text = rowIsText ? rowIsText(top + r) : false;
            for (let c = 0; c < width; c++) {
              const i = (r * width + c) * 4;
              // A row of text varies across its width — that variation is what
              // the cut search looks for. A gap row is flat. Painting a "text"
              // row flat would make it read as a gap.
              const v = text ? (c % 2 ? 20 : 240) : 251;
              data[i] = v;
              data[i + 1] = text ? v : 248;
              data[i + 2] = text ? v : 242;
              data[i + 3] = 255;
            }
          }
          return { data };
        },
      }),
      toDataURL: () => 'data:image/jpeg;base64,AA',
    };
  };

  const win = { jspdf: { jsPDF } };
  const fn = new Function(
    'window', 'document', 'html2canvas', 'fetch', 'setTimeout', 'encodeURIComponent', 'btoa', 'console', 'Uint8Array',
    src + '\nreturn natalExportPdf;',
  )(win, document, html2canvas, fetchImpl, (f) => f(), encodeURIComponent,
    (b) => Buffer.from(b, 'binary').toString('base64'), console, Uint8Array);
  return { fn, log };
}

const doc = (over = {}) => ({
  lang: 'ko', title: '테스트', born: '1990-06-15 12:00 (Asia/Seoul)', place: 'Seoul',
  timeUnknown: false,
  wheelSVG: '<div class="wheelbox"><svg viewBox="0 0 400 400"><circle r="1"/></svg></div>',
  disclaimer: '점성술은 검증된 예측 과학이 아닙니다.<br>의료 결정의 근거로 삼지 마세요.',
  sections: [
    { n: 2, title: '빅3', body: '태양은 **쌍둥이자리**에 있습니다.' },
    { n: 3, title: '기질', body: '두 번째 섹션 본문.' },
  ],
  chartTables: {
    title: '출생차트',
    tabs: [
      { key: 'planets', label: '천체', html: '<div class="plate"><table class="data"><tbody><tr><td>태양</td></tr></tbody></table></div>' },
      { key: 'houses', label: '하우스', html: '<div class="plate"><table class="data"><tbody><tr><td>1</td></tr></tbody></table></div>' },
      { key: 'aspects', label: '어스펙트', html: '<div class="plate"><table class="data"><tbody><tr><td>트라인</td></tr></tbody></table></div>' },
      { key: 'balance', label: '균형·구조', html: '<div class="plate"><table class="data"><tbody><tr><td>불</td></tr></tbody></table></div>' },
    ],
  },
  ...over,
});

const allText = (log) => log.texts.map((t) => t.text).join('\n');

test('refuses to export a reading with no generated sections', async () => {
  const { fn } = harness();
  await assert.rejects(() => fn(doc({ sections: [] })), /nothing to export/);
});

test('refuses when the pdf libraries are missing rather than failing obscurely', async () => {
  const fn = new Function('window', 'document', 'html2canvas', 'fetch', 'setTimeout', 'encodeURIComponent', 'btoa', 'console', 'Uint8Array',
    src + '\nreturn natalExportPdf;')({}, { createElement: () => ({ style: {} }), body: { appendChild() {} } },
    undefined, async () => ({}), (f) => f(), encodeURIComponent, (b) => b, console, Uint8Array);
  await assert.rejects(() => fn(doc()), /pdf libraries unavailable/);
});

test('both font weights are embedded, and the document is compressed', async () => {
  const { fn, log } = harness();
  await fn(doc());
  assert.equal(log.vfs.length, 2, 'regular and bold');
  const styles = log.fonts.map((f) => f[2]).sort();
  assert.deepEqual(styles, ['bold', 'normal'], 'bold was requested, so it is a real face');
  // Without compression the embedded Korean font is the entire file size, which
  // is the thing this rewrite exists to fix.
  assert.equal(log.ctorOpts.compress, true);
  assert.equal(log.fontUrls.length, 2);
  for (const u of log.fontUrls) assert.match(u, /\/natal\/fonts\/GothicA1-KR-(Regular|Bold)\.ttf$/);
});

test('the reading is drawn as text, not captured as pixels', async () => {
  const { fn, log } = harness();
  await fn(doc());
  const t = allText(log);
  assert.match(t, /테스트/, 'title');
  assert.match(t, /Asia\/Seoul/, 'birth data');
  assert.match(t, /빅3/, 'section heading');
  assert.match(t, /쌍둥이자리/, 'section body must be text');
  assert.match(t, /검증된 예측 과학이 아닙니다/, 'disclaimer must survive');
  // The captured page holds the chart block only — no reading prose.
  assert.ok(!/쌍둥이자리/.test(log.captured.innerHTML), 'prose must not be in the image');
});

test('bold markup is drawn with the bold face', async () => {
  const { fn, log } = harness();
  await fn(doc());
  const bold = log.texts.filter((t) => t.bold).map((t) => t.text);
  assert.ok(bold.some((t) => t.includes('쌍둥이자리')), 'inline **bold** should use the bold face');
  assert.ok(bold.some((t) => t.includes('빅3')), 'section headings are bold');
});

test('the chart block is an image and carries the wheel and all four tables', async () => {
  const { fn, log } = harness();
  await fn(doc());
  assert.ok(log.images.length >= 1, 'the chart is placed as an image');
  const h = log.captured.innerHTML;
  const img = /<img[^>]+src="data:image\/svg\+xml;charset=utf-8,([^"]*)"/.exec(h);
  assert.ok(img, 'the wheel must be a data URI image — html2canvas is unreliable with inline svg');
  const svg = decodeURIComponent(img[1]);
  // On screen the stylesheet sizes it; an <img> gets no external CSS, so a
  // viewBox alone leaves it with no intrinsic size and it draws as nothing.
  assert.match(svg, /<svg[^>]*\bwidth="400"/);
  assert.match(svg, /xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  for (const k of ['planets', 'houses', 'aspects', 'balance']) {
    assert.match(h, new RegExp('class="tbl tbl-' + k + '"'), k + ' table missing');
  }
});

test('an svg that already declares a size is left alone', async () => {
  const { fn, log } = harness();
  await fn(doc({ wheelSVG: '<div><svg width="200" height="200" viewBox="0 0 400 400"><circle r="1"/></svg></div>' }));
  const svg = decodeURIComponent(/src="data:image\/svg\+xml;charset=utf-8,([^"]*)"/.exec(log.captured.innerHTML)[1]);
  assert.match(svg, /width="200"/);
  assert.ok(!/width="400"/.test(svg));
});

test('chart table cells may wrap, or wide tables get clipped in the capture', async () => {
  const { fn, log } = harness();
  await fn(doc());
  const style = /<style>([\s\S]*?)<\/style>/.exec(log.captured.innerHTML)[1];
  const cellRule = /\.nc table\.data td\{[^}]*\}/.exec(style)[0];
  assert.ok(!/white-space:nowrap/.test(cellRule), 'cells must not be nowrap: ' + cellRule);
  assert.match(cellRule, /word-break:keep-all/, 'Korean must break between words');
});

test('a reading without a chart block still exports', async () => {
  const { fn, log } = harness();
  await fn(doc({ wheelSVG: '', chartTables: undefined }));
  assert.ok(log.saved);
  assert.equal(log.images.length, 0);
  assert.match(allText(log), /빅3/);
});

test('an unknown birth time is stated, in the reading language', async () => {
  const ko = harness();
  await ko.fn(doc({ timeUnknown: true }));
  assert.match(allText(ko.log), /출생 시각을 모르는/);
  const en = harness();
  await en.fn(doc({ timeUnknown: true, lang: 'en' }));
  assert.match(allText(en.log), /Birth time unknown/);
});

test('the off-screen capture element is removed even when capture fails', async () => {
  const { fn, log } = harness({ captureFail: true });
  await assert.rejects(() => fn(doc()), /capture failed/);
  assert.equal(log.appended, 1);
  assert.equal(log.removed, 1, 'a leaked 700px element would sit in the DOM forever');
});

test('a font that will not load fails loudly rather than producing blank Korean', async () => {
  const { fn } = harness({ fontFail: true });
  await assert.rejects(() => fn(doc()), /font .*404|font/);
});

test('a tall chart is split across pages instead of overflowing one', async () => {
  const { fn, log } = harness({ canvasH: 9000 });
  await fn(doc());
  assert.ok(log.images.length > 1, `expected the chart to span pages, got ${log.images.length}`);
  for (const im of log.images) assert.ok(im.h > 0 && im.h <= 297, `slice height ${im.h}mm`);
});

test('every page is footed with a page number that matches the total', async () => {
  const { fn, log } = harness({ canvasH: 6000 });
  await fn(doc());
  const n = log.pages;
  const t = allText(log);
  assert.match(t, new RegExp('1 / ' + n));
  assert.match(t, new RegExp(n + ' / ' + n));
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

// ── chart page breaks ──────────────────────────────────────────────────────
// The chart is a picture, so a page break takes whatever pixels sit at that
// height. In a table of positions that is usually the middle of a row of text.

test('a chart page break lands in a gap, not through a line of text', async () => {
  // Lines every 40 rows, 24 rows of ink then 16 of background.
  const rowIsText = (y) => (y % 40) < 24;
  const { fn, log } = harness({ canvasH: 9000, rowIsText });
  await fn(doc());
  assert.ok(log.slices.length > 1, 'expected the chart to span pages');
  for (const [sy, sh] of log.slices.slice(0, -1)) {
    const cut = sy + sh;
    assert.ok(!rowIsText(cut), `cut at row ${cut} falls inside a line`);
  }
});

test('the cut is pulled back off a line that straddles the boundary', async () => {
  // Where the cut falls with nowhere to move, so the gap can be placed within
  // reach of it rather than at an arbitrary row.
  const plain = harness({ canvasH: 9000, rowIsText: () => true });
  await plain.fn(doc());
  const natural = plain.log.slices[0][1];

  const gapStart = natural - 40, gapEnd = natural - 20;
  const { fn, log } = harness({
    canvasH: 9000,
    rowIsText: (y) => !(y >= gapStart && y < gapEnd),
  });
  await fn(doc());
  const cut = log.slices[0][0] + log.slices[0][1];
  assert.ok(cut >= gapStart && cut < gapEnd,
    `expected the cut inside ${gapStart}..${gapEnd}, got ${cut}`);
  assert.ok(cut < natural, 'the cut should move up, off the line');
});

test('a gap too far back is left alone — a short page is the worse outcome', async () => {
  const plain = harness({ canvasH: 9000, rowIsText: () => true });
  await plain.fn(doc());
  const natural = plain.log.slices[0][1];

  // Well beyond the quarter-page the search is allowed to reach back.
  const gapStart = Math.floor(natural * 0.4);
  const { fn, log } = harness({
    canvasH: 9000,
    rowIsText: (y) => !(y >= gapStart && y < gapStart + 20),
  });
  await fn(doc());
  assert.equal(log.slices[0][1], natural, 'should take the plain cut rather than a sliver page');
});

test('solid content with no gap still paginates instead of hanging', async () => {
  const { fn, log } = harness({ canvasH: 9000, rowIsText: () => true });
  await fn(doc());
  assert.ok(log.slices.length >= 2);
  for (const [, sh] of log.slices) assert.ok(sh > 0);
});

test('chart slices stay contiguous and cover the whole capture', async () => {
  const rowIsText = (y) => (y % 37) < 20;
  const canvasH = 7777;
  const { fn, log } = harness({ canvasH, rowIsText });
  await fn(doc());
  let covered = 0;
  for (const [sy, sh] of log.slices) {
    assert.equal(sy, covered, 'slices must be contiguous — no rows skipped');
    covered += sh;
  }
  assert.equal(covered, canvasH, 'the last slice must reach the bottom');
});

test('a capture that cannot be read falls back to plain slicing', async () => {
  const { fn, log } = harness({ canvasH: 9000, taint: true });
  await fn(doc());
  assert.ok(log.saved, 'a SecurityError must not break the export');
  assert.ok(log.slices.length >= 2);
});
