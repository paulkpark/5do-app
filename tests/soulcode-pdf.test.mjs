import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// The Soul Analysis export is rebuilt for A4 rather than photographed: prose
// cards are drawn as text with the embedded font, designed cards are captured
// one at a time, and the resonance-frequency block is left out. None of that is
// observable without running it, so jsPDF, html2canvas and a DOM are faked.

const html = fs.readFileSync(new URL('../akashic-frequency/public/index.html', import.meta.url), 'utf8');

const block = (start, end) => {
  const i = html.indexOf(start);
  assert.ok(i > 0, 'not found: ' + start);
  return html.slice(i, html.indexOf(end, i));
};
// The exporter depends on helpers defined elsewhere in the file.
const deps = block('const NATAL_FONT = {', 'async function natalExportPdf(doc)')
  + block('function pdfSafeCutRows(canvas, from, rows)', '\n/**\n * The chart block as a canvas');
const body = block('  const generatePdf = useCallback(async () => {', '  const shareReport = useCallback');

// Strip the React wrapper so the function can be called directly.
const inner = body.slice(body.indexOf('{') + 1, body.lastIndexOf('}, [pdfGenerating'));
const fnSrc = deps + '\nasync function generatePdf(ctx) {\n'
  + 'const { reportRef, pdfGenerating, setPdfGenerating, name, lang, result, t } = ctx;\n'
  + inner.replace(/^\s*if \(!reportRef\.current \|\| pdfGenerating\) return;/m, '')
  + '\n}\nreturn generatePdf;';

function node({ attrs = {}, text = '', children = [], tag = 'div' } = {}) {
  const n = {
    tagName: tag, style: {}, children, innerText: text, textContent: text,
    getAttribute: (k) => (k in attrs ? attrs[k] : null),
    querySelector: (sel) => (/svg|img|canvas/.test(sel) && attrs.visual ? {} : null),
    querySelectorAll: () => [],
    width: 0, height: 0,
    getContext: () => ({ drawImage() {} }),
    toDataURL: () => 'data:image/jpeg;base64,AA',
    remove() {},
  };
  return n;
}

function harness(reportChildren, { canvasH = 600 } = {}) {
  const log = { texts: [], images: [], saved: null, pages: 1, captured: [], ctorOpts: null, fonts: [] };
  function jsPDF(opts) {
    log.ctorOpts = opts;
    let style = null;
    return {
      addFileToVFS() {}, addFont(v, f, st) { log.fonts.push(st); },
      setFont(f, st) { style = st; }, setFontSize() {}, setTextColor() {}, setDrawColor() {}, setLineWidth() {}, line() {},
      getTextWidth: (t) => [...String(t)].length * 2,
      text(t) { log.texts.push({ text: String(t), bold: style === 'bold' }); },
      addImage() { log.images.push(1); },
      addPage() { log.pages++; }, setPage() {},
      save(n) { log.saved = n; },
    };
  }
  const document = { createElement: () => node(), body: { appendChild() {} } };
  const html2canvas = async (el) => {
    log.captured.push(el.innerText || '(visual)');
    return {
      width: 1400, height: canvasH,
      getContext: () => ({ drawImage() {}, getImageData: (x, top, w, h) => ({ data: new Uint8ClampedArray(w * h * 4).fill(200) }) }),
      toDataURL: () => 'data:image/jpeg;base64,AA',
    };
  };
  const fetchImpl = async () => ({ ok: true, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer });
  const win = { jspdf: { jsPDF } };
  const fn = new Function('window', 'document', 'html2canvas', 'fetch', 'setTimeout', 'btoa', 'console', 'Uint8Array', fnSrc)(
    win, document, html2canvas, fetchImpl, (f) => f(), (b) => Buffer.from(b, 'binary').toString('base64'), console, Uint8Array);

  const ctx = {
    reportRef: { current: { children: reportChildren, querySelector: () => null } },
    pdfGenerating: false, setPdfGenerating() {},
    name: '박폴', lang: 'ko',
    result: { zodiac: { name: '쌍둥이자리' }, element: '바람', mbti: 'INFJ', bloodType: 'A' },
    t: (v) => (typeof v === 'string' ? v : (v && v.ko) || ''),
  };
  return { fn, ctx, log };
}

const allText = (log) => log.texts.map((t) => t.text).join('\n');

test('a prose card is drawn as text, not captured', async () => {
  const card = node({ attrs: { 'data-pdf': 'text' }, text: '아카식 레코드\n당신의 테마는 확장입니다.\n사명은 연결입니다.' });
  const { fn, ctx, log } = harness([node({ children: [card] })]);
  await fn(ctx);
  const t = allText(log);
  assert.match(t, /아카식 레코드/);
  assert.match(t, /당신의 테마는 확장입니다/);
  assert.equal(log.images.length, 0, 'prose must not be captured');
});

test('a designed card is captured whole rather than drawn as text', async () => {
  const card = node({ attrs: { visual: true }, text: '오행 균형' });
  const { fn, ctx, log } = harness([node({ children: [card] })]);
  await fn(ctx);
  assert.ok(log.images.length >= 1, 'the visual card should be an image');
});

test('the resonance-frequency block is left out of the document', async () => {
  const freq = node({ attrs: { 'data-pdf': 'skip' }, text: '공명 주파수 프로파일 432Hz' });
  const prose = node({ attrs: { 'data-pdf': 'text' }, text: '제목\n본문입니다.' });
  const { fn, ctx, log } = harness([freq, node({ children: [prose] })]);
  await fn(ctx);
  assert.ok(!/공명 주파수/.test(allText(log)), 'skipped block must not be drawn');
  assert.ok(!log.captured.some((c) => /공명 주파수/.test(c)), 'skipped block must not be captured');
});

test('text the embedded font cannot draw is captured instead of coming out blank', async () => {
  // Gothic A1 carries no Hanja, so a saju card marked as prose must still be
  // captured rather than drawn as a row of empty boxes.
  const card = node({ attrs: { 'data-pdf': 'text' }, text: '사주팔자\n甲子 丙寅 戊辰 庚午' });
  const { fn, ctx, log } = harness([node({ children: [card] })]);
  await fn(ctx);
  assert.ok(log.images.length >= 1, 'undrawable text must fall back to a capture');
  assert.ok(!/甲子/.test(allText(log)), 'it must not be drawn as text');
});

test('the cover carries the name and the headline attributes', async () => {
  const { fn, ctx, log } = harness([node({ children: [node({ attrs: { 'data-pdf': 'text' }, text: 'T\nbody' })] })]);
  await fn(ctx);
  const t = allText(log);
  assert.match(t, /박폴/);
  assert.match(t, /쌍둥이자리/);
  assert.match(t, /INFJ/);
});

test('both font weights are registered and the document is compressed', async () => {
  const { fn, ctx, log } = harness([node({ children: [node({ attrs: { 'data-pdf': 'text' }, text: 'T\nb' })] })]);
  await fn(ctx);
  assert.deepEqual(log.fonts.sort(), ['bold', 'normal']);
  assert.equal(log.ctorOpts.compress, true);
});

test('every page is footed with a matching page number', async () => {
  const cards = Array.from({ length: 6 }, (_, i) => node({ attrs: { visual: true }, text: 'card' + i }));
  const { fn, ctx, log } = harness([node({ children: cards })], { canvasH: 4000 });
  await fn(ctx);
  const t = allText(log);
  assert.match(t, new RegExp('1 / ' + log.pages));
  assert.match(t, new RegExp(log.pages + ' / ' + log.pages));
});

test('the filename drops characters a filesystem rejects', async () => {
  const { fn, ctx, log } = harness([node({ children: [node({ attrs: { 'data-pdf': 'text' }, text: 'T\nb' })] })]);
  ctx.name = '박/폴: 리포트*';
  await fn(ctx);
  assert.ok(!/[/:*]/.test(log.saved), log.saved);
  assert.match(log.saved, /\.pdf$/);
});
