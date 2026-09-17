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

function harness({ canvasHeight = 2000, canvasFail = false } = {}) {
  const log = { added: [], saved: null, pages: 1, texts: [], appended: 0, removed: 0, captured: null };

  const makeCanvas = (w, h) => ({
    width: w, height: h,
    getContext: () => ({ drawImage() {} }),
    toDataURL: () => 'data:image/jpeg;base64,AA',
  });

  const el = () => {
    const node = {
      className: '', style: { cssText: '' }, innerHTML: '',
      width: 0, height: 0,
      getContext: () => ({ drawImage() {} }),
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
