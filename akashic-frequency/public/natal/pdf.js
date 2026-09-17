/* natal/pdf.js — the reading as a PDF.
 *
 * Lifted out of the 5DO Soul Code page so the standalone app runs the same
 * exporter rather than a second copy of it. The layout below was tuned against
 * real output over several rounds (page breaks mid-sentence, clipped table
 * columns, file size); treat changes to the geometry as changes to a document
 * someone has already accepted.
 *
 * Hybrid, on purpose.
 *
 * The chart block — the wheel and the four data tables — is captured as an
 * image, because it is the only part carrying astrological symbols (♈-♓, ☽ ☿
 * ♃ ♄ …) and no Korean font ships those; as text they would come out as blanks.
 *
 * The written reading is real text, drawn with an embedded Korean font. That is
 * what makes the file small and the words selectable, searchable and sharp at
 * any zoom — an image of a page of prose costs several hundred KB per sheet and
 * none of that.
 */

const NATAL_FONT = {
  regular: { file: 'GothicA1-KR-Regular.ttf', vfs: 'GothicA1-R.ttf', style: 'normal' },
  bold: { file: 'GothicA1-KR-Bold.ttf', vfs: 'GothicA1-B.ttf', style: 'bold' },
};
// Gothic A1 covers Korean and Latin but has no Hanja and no astrological
// symbols — which is why the chart block is captured as an image instead.
export const FONT_NAME = 'GothicA1KR';
let natalFontCache = null;

// Fetched as binary and base64'd here rather than shipped as a .js blob, so the
// browser caches the .ttf and the 3MB never sits in the page source.
async function loadNatalFonts() {
  if (natalFontCache) return natalFontCache;
  const read = async (file) => {
    // Resolved against this module's own URL. Hardcoding the 5DO mount path
    // here is what would break the standalone app, which serves the same file
    // from /lib/natal/ — and it would fail only at export time, long after the
    // page looked fine.
    const res = await fetch(new URL('./fonts/' + file, import.meta.url).href);
    if (!res.ok) throw new Error('font ' + file + ' ' + res.status);
    const buf = new Uint8Array(await res.arrayBuffer());
    let bin = '';
    for (let i = 0; i < buf.length; i += 0x8000) {
      bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    }
    return btoa(bin);
  };
  natalFontCache = {
    regular: await read(NATAL_FONT.regular.file),
    bold: await read(NATAL_FONT.bold.file),
  };
  return natalFontCache;
}

/**
 * Load the Korean font and register it on a jsPDF instance, returning its name.
 *
 * Shared with the Soul Code exporter, which embeds the same face: two copies of
 * these four calls is how the two documents end up with different typography
 * after someone tunes one of them.
 */
export async function registerFonts(pdf) {
  const fonts = await loadNatalFonts();
  pdf.addFileToVFS(NATAL_FONT.regular.vfs, fonts.regular);
  pdf.addFont(NATAL_FONT.regular.vfs, FONT_NAME, 'normal');
  pdf.addFileToVFS(NATAL_FONT.bold.vfs, fonts.bold);
  pdf.addFont(NATAL_FONT.bold.vfs, FONT_NAME, 'bold');
  return FONT_NAME;
}

/** Split markdown into blocks the PDF writer can lay out. */
export function parseBlocks(md) {
  const lines = String(md || '').replace(/\r/g, '').split('\n');
  const blocks = [];
  let para = [];
  const flush = () => { if (para.length) { blocks.push({ type: 'p', text: para.join(' ') }); para = []; } };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l.trim()) { flush(); continue; }
    if (/^\s*(---|\*\*\*|___)\s*$/.test(l)) { flush(); blocks.push({ type: 'hr' }); continue; }
    if (/^\s*>\s?/.test(l)) { flush(); blocks.push({ type: 'quote', text: l.replace(/^\s*>\s?/, '') }); continue; }
    const li = /^\s*(?:[-*+]|\d+\.)\s+(.*)$/.exec(l);
    if (li) { flush(); blocks.push({ type: 'li', text: li[1], ordered: /^\s*\d/.test(l) }); continue; }
    const h = /^\s*(#{2,4})\s+(.*)$/.exec(l);
    if (h) { flush(); blocks.push({ type: 'sub', text: h[2] }); continue; }
    // A markdown table inside a section is rare; keep the row readable rather
    // than attempting column layout for a one-off.
    if (/^\s*\|/.test(l)) {
      flush();
      if (!/^\s*\|?[\s:|-]+\|/.test(l)) {
        blocks.push({ type: 'p', text: l.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim()).join('  ·  ') });
      }
      continue;
    }
    para.push(l.trim());
  }
  flush();
  return blocks;
}

/** Inline markdown → runs of {text, bold, italic}. */
export function inlineRuns(text) {
  const runs = [];
  const re = /(\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`]+`)/g;
  let last = 0, m;
  const push = (t, bold, italic) => { if (t) runs.push({ text: t, bold: !!bold, italic: !!italic }); };
  while ((m = re.exec(text)) !== null) {
    push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith('**')) push(tok.slice(2, -2), true, false);
    else if (tok.startsWith('`')) push(tok.slice(1, -1), false, true);
    else push(tok.slice(1, -1), false, true);
    last = m.index + tok.length;
  }
  push(text.slice(last));
  return runs.length ? runs : [{ text: String(text || ''), bold: false, italic: false }];
}

// Exported because it defines where a line may break, which the layout tests
// have to measure the same way the wrapper does.
export const CJK = /[ᄀ-ᇿ　-ヿ㄰-㆏一-鿿가-힯＀-￯]/;

/**
 * Wrap runs to `width`, returning lines of runs.
 *
 * Korean does not put spaces between every word, so wrapping only at spaces
 * overflows badly. Latin words stay whole; CJK may break between any two
 * characters, which is what Korean typesetting does anyway.
 */
export function wrapRuns(pdf, runs, width, fontSize, setFont) {
  const lines = [];
  let line = [], lineW = 0;
  const startRun = (r) => ({ text: '', bold: r.bold, italic: r.italic });
  const pushLine = () => { if (line.length) lines.push(line); line = []; lineW = 0; };

  for (const run of runs) {
    setFont(run);
    let cur = startRun(run);
    const tokens = String(run.text).match(/[^\S\n]+|[^\s]/g) || [];
    let buf = '';
    const emit = (piece) => {
      const w = pdf.getTextWidth(piece);
      if (lineW + w > width && (line.length || cur.text)) {
        if (cur.text) { line.push(cur); cur = startRun(run); }
        pushLine();
        setFont(run);
        if (/^\s+$/.test(piece)) return;       // do not open a line with a space
      }
      cur.text += piece;
      lineW += w;
    };
    // Group Latin letters into words; let CJK break per character.
    for (const ch of tokens) {
      if (CJK.test(ch) || /\s/.test(ch)) {
        if (buf) { emit(buf); buf = ''; }
        emit(ch);
      } else {
        buf += ch;
        if (pdf.getTextWidth(buf) > width) { emit(buf); buf = ''; }
      }
    }
    if (buf) emit(buf);
    if (cur.text) line.push(cur);
  }
  pushLine();
  return lines;
}

/* The two PDF libraries, fetched the first time someone exports.
 *
 * The Soul Code page loads them with <script> tags in <head>; the standalone
 * app loads nothing up front on purpose, and most sittings never export at all.
 * Where the globals are already present this resolves immediately, so the
 * existing page pays nothing for the change. */
const PDF_LIBS = [
  { has: () => window.jspdf && window.jspdf.jsPDF,
    src: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js' },
  { has: () => typeof window.html2canvas === 'function',
    src: 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js' },
];
let pdfLibsPromise = null;
export function ensurePdfLibs() {
  if (PDF_LIBS.every((l) => l.has())) return Promise.resolve();
  if (pdfLibsPromise) return pdfLibsPromise;
  pdfLibsPromise = Promise.all(PDF_LIBS.filter((l) => !l.has()).map((l) => new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = l.src;
    s.async = true;
    s.onload = () => (l.has() ? resolve() : reject(new Error('pdf: ' + l.src + ' loaded but global missing')));
    s.onerror = () => reject(new Error('pdf: failed to load ' + l.src));
    document.head.appendChild(s);
  })));
  // A flaky connection must not make the export button dead for the session.
  pdfLibsPromise.catch(() => { pdfLibsPromise = null; });
  return pdfLibsPromise;
}

/**
 * The reading as a PDF.
 *
 * `opts.brand` names the product in the page footer. It has no default: this
 * module is shared by two products, and a default is how the wrong name ends up
 * on the other one's document.
 */
export async function exportReadingPdf(doc, opts = {}) {
  await ensurePdfLibs();
  const jsPDFCtor = window.jspdf && window.jspdf.jsPDF;
  if (!jsPDFCtor || typeof html2canvas !== 'function') throw new Error('pdf libraries unavailable');
  if (!doc || !doc.sections || !doc.sections.length) throw new Error('nothing to export');

  const esc = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // compress: true flate-compresses the font streams; without it the embedded
  // Korean font is the whole file size.
  const pdf = new jsPDFCtor({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
  await registerFonts(pdf);

  const W = 210, H = 297, M = 16, FOOT = 10;
  const CW = W - M * 2;
  const BOTTOM = H - M - FOOT;
  const INK = [28, 26, 23], MUTED = [107, 99, 87], BRASS = [138, 101, 41];

  let y = M;
  let pageCount = 1;
  const setFont = (r) => {
    pdf.setFont(FONT_NAME, r && r.bold ? 'bold' : 'normal');
  };
  const newPage = () => { pdf.addPage(); pageCount++; y = M; };
  const need = (h) => { if (y + h > BOTTOM) newPage(); };

  function writeRuns(runs, { size = 10.5, lead = 1.65, color = INK, indent = 0, gap = 2.6 } = {}) {
    pdf.setFontSize(size);
    const width = CW - indent;
    const lines = wrapRuns(pdf, runs, width, size, setFont);
    const lineH = size * lead * 0.3528;               // pt -> mm
    for (const line of lines) {
      need(lineH);
      let x = M + indent;
      for (const run of line) {
        setFont(run);
        pdf.setTextColor(color[0], color[1], color[2]);
        pdf.text(run.text, x, y + lineH * 0.74, { baseline: 'alphabetic' });
        x += pdf.getTextWidth(run.text);
      }
      y += lineH;
    }
    y += gap;
  }

  // ── 1. cover line ──
  pdf.setFont(FONT_NAME, 'bold');
  pdf.setFontSize(19);
  pdf.setTextColor(INK[0], INK[1], INK[2]);
  need(10);
  pdf.text(String(doc.title || ''), M, y + 7);
  y += 11;
  pdf.setFont(FONT_NAME, 'normal');
  pdf.setFontSize(9);
  pdf.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
  pdf.text(String(doc.born || '') + (doc.place ? ' · ' + doc.place : ''), M, y + 3);
  y += 9;
  if (doc.timeUnknown) {
    writeRuns(inlineRuns(doc.lang === 'ko'
      ? '출생 시각을 모르는 차트입니다 — 하우스와 상승점 해석은 적용되지 않습니다.'
      : 'Birth time unknown — house and ascendant readings do not apply.'),
      { size: 9, color: BRASS, gap: 3 });
  }

  // ── 2. the chart block, as an image ──
  // Captured rather than drawn because it is where the astrological symbols
  // live, and the embedded Korean font has none of them.
  const chartImg = await renderChartImage(doc, esc);
  if (chartImg) {
    const imgW = CW;
    const mmPerRow = imgW / chartImg.width;          // the capture is drawn to width
    const imgH = chartImg.height * mmPerRow;
    let row = 0;
    let guard = 0;
    while (row < chartImg.height && guard++ < 200) {
      const room = BOTTOM - y;
      // Less than this and the slice is a sliver; start the next page instead.
      if (room < 30) { newPage(); continue; }
      const maxRows = Math.floor(room / mmPerRow);
      if (maxRows < 4) { newPage(); continue; }
      let rows = Math.min(maxRows, chartImg.height - row);
      if (row + rows < chartImg.height) rows = safeCutRows(chartImg, row, rows);

      const slice = document.createElement('canvas');
      slice.width = chartImg.width;
      slice.height = rows;
      slice.getContext('2d').drawImage(chartImg, 0, row, chartImg.width, rows, 0, 0, chartImg.width, rows);
      pdf.addImage(slice.toDataURL('image/jpeg', 0.88), 'JPEG', M, y, imgW, rows * mmPerRow);
      y += rows * mmPerRow + 1;
      row += rows;
      if (row < chartImg.height) newPage();
    }
    y += 4;
  }

  // ── 3. the written reading, as text ──
  for (const sec of doc.sections) {
    need(16);
    if (y > M + 2) y += 4;
    pdf.setDrawColor(222, 213, 196);
    pdf.setLineWidth(0.2);
    pdf.setFont(FONT_NAME, 'bold');
    pdf.setFontSize(13);
    pdf.setTextColor(BRASS[0], BRASS[1], BRASS[2]);
    pdf.text(String(sec.n) + '.  ' + String(sec.title || ''), M, y + 5);
    y += 7.5;
    pdf.line(M, y, W - M, y);
    y += 4.5;

    for (const b of parseBlocks(sec.body)) {
      if (b.type === 'hr') { need(5); pdf.setDrawColor(230, 223, 210); pdf.line(M, y + 1, W - M, y + 1); y += 5; continue; }
      if (b.type === 'sub') { writeRuns(inlineRuns(b.text), { size: 11, color: INK, gap: 1.8 }); continue; }
      if (b.type === 'quote') { writeRuns(inlineRuns(b.text), { size: 10, color: MUTED, indent: 5, gap: 2.4 }); continue; }
      if (b.type === 'li') {
        const runs = inlineRuns(b.text);
        runs.unshift({ text: '· ', bold: false, italic: false });
        writeRuns(runs, { size: 10.5, indent: 4, gap: 1.4 });
        continue;
      }
      writeRuns(inlineRuns(b.text));
    }
  }

  // ── 4. disclaimer + footers ──
  y += 3;
  need(14);
  pdf.setDrawColor(222, 213, 196);
  pdf.line(M, y, W - M, y);
  y += 4;
  writeRuns(inlineRuns(String(doc.disclaimer || '').replace(/<br\s*\/?>/gi, ' ')),
    { size: 8.5, color: MUTED, gap: 0 });

  const readingLabel = doc.lang === 'ko' ? '천궁도 리딩' : 'Natal Reading';
  const label = (opts.brand ? opts.brand + ' · ' : '') + readingLabel;
  for (let i = 1; i <= pageCount; i++) {
    pdf.setPage(i);
    pdf.setFont(FONT_NAME, 'normal');
    pdf.setFontSize(7.5);
    pdf.setTextColor(150, 140, 125);
    pdf.text(label, W / 2, H - 8, { align: 'center' });
    pdf.text(i + ' / ' + pageCount, W - M, H - 8, { align: 'right' });
  }

  const safe = String(doc.title || 'natal').replace(/[^\w가-힣 .-]/g, '').trim() || 'natal';
  pdf.save(safe + '_' + (doc.lang === 'ko' ? '천궁도' : 'Natal') + '.pdf');
}

/**
 * How many rows of a captured report may go on this page without cutting
 * through a line of text.
 *
 * A captured report is a picture, so a page break takes whatever pixels sit at
 * that height — which in a paragraph or a table is usually the middle of a line.
 * The cut is pulled up to the nearest row that is uniform across its width: the
 * gap between two lines, whether that gap is page background or the inside of a
 * card. Testing for uniformity rather than one known colour is what lets this
 * serve both the cream natal capture and the dark Soul Code report, where most
 * gaps are card-coloured rather than page-coloured.
 *
 * It reaches back at most a quarter page. Past that a ragged short page is the
 * worse outcome, so the plain cut stands.
 */
export function safeCutRows(canvas, from, rows) {
  let ctx;
  try { ctx = canvas.getContext('2d'); } catch (_) { return rows; }
  if (!ctx || typeof ctx.getImageData !== 'function') return rows;

  const reach = Math.max(8, Math.min(Math.floor(rows * 0.25), Math.round(140 * (canvas.width / 1400))));
  const top = from + rows - reach;
  if (top <= from) return rows;

  let data;
  try {
    data = ctx.getImageData(0, top, canvas.width, reach).data;
  } catch (_) {
    return rows;      // a tainted canvas cannot be read; take the plain cut
  }
  const w = canvas.width;
  for (let r = reach - 1; r >= 0; r--) {
    const base = r * w * 4;
    const r0 = data[base], g0 = data[base + 1], b0 = data[base + 2];
    let uniform = true;
    for (let x = 1; x < w; x++) {
      const i = base + x * 4;
      if (Math.abs(data[i] - r0) > 10 || Math.abs(data[i + 1] - g0) > 10 || Math.abs(data[i + 2] - b0) > 10) {
        uniform = false; break;
      }
    }
    if (uniform) return (top + r) - from;
  }
  return rows;        // solid content (the wheel, an image) — nowhere better to cut
}

/**
 * The chart block as a canvas: wheel plus the four data tables.
 *
 * Still html2canvas, and still off-screen in the light DOM — the natal UI lives
 * in a shadow root, which html2canvas cannot see into, and the on-screen view is
 * a dark interface that does not belong in a document.
 */
async function renderChartImage(doc, esc) {
  const sheet = `
    .nc{font-family:'Noto Sans KR',-apple-system,sans-serif;color:#1C1A17;background:#FBF8F2}
    .nc h3{font-size:12px;margin:16px 0 6px;color:#6B6357;font-weight:600;letter-spacing:.3px}
    .nc table.data{width:100%;border-collapse:collapse;font-size:10.5px;min-width:0!important;table-layout:auto}
    .nc table.data th{text-align:left;color:#6B6357;font-weight:600;border-bottom:1px solid #DED5C4;padding:4px 7px 4px 0;
                      white-space:normal;word-break:keep-all;vertical-align:bottom}
    .nc table.data td{border-bottom:1px solid #EFE9DE;padding:4px 7px 4px 0;
                      white-space:normal;word-break:keep-all;vertical-align:top}
    .nc table.data td.b{color:#12100E;font-weight:600}
    .nc table.data td.g{color:#8A6529}
    .nc table.data td.dim{color:#6B6357}
    .nc table.data td.r{color:#B4453F}
    .nc .tbl-planets th:nth-child(3),.nc .tbl-planets td:nth-child(3),
    .nc .tbl-planets th:nth-child(4),.nc .tbl-planets td:nth-child(4),
    .nc .tbl-planets th:nth-child(5),.nc .tbl-planets td:nth-child(5){width:1%;white-space:nowrap}
    .nc .tbl-planets th:nth-child(7),.nc .tbl-planets td:nth-child(7){width:22%}
    .nc .tbl-planets th:nth-child(8),.nc .tbl-planets td:nth-child(8){width:14%}
    .nc .tbl-aspects th:nth-child(1),.nc .tbl-aspects td:nth-child(1){width:38%}
    .nc .tbl-aspects th:nth-child(2),.nc .tbl-aspects td:nth-child(2),
    .nc .tbl-aspects th:nth-child(3),.nc .tbl-aspects td:nth-child(3){width:1%;white-space:nowrap}
    .nc .tbl-houses th:nth-child(1),.nc .tbl-houses td:nth-child(1){width:1%;white-space:nowrap}
    .nc .tbl-houses th:nth-child(6),.nc .tbl-houses td:nth-child(6){width:26%}
    .nc .plate{overflow:visible;margin:0 0 4px}
    .nc .mini{font-size:10px;color:#6B6357;margin:5px 0 0;line-height:1.6}
    .nc .chips{display:flex;flex-wrap:wrap;gap:5px;margin:7px 0 0}
    .nc .chip{font-size:10px;border:1px solid #DED5C4;border-radius:3px;padding:2px 7px;color:#4A4338}
    .nc .chip b{color:#8A6529}
  `;

  let wheelImg = '';
  const m = /<svg[\s\S]*<\/svg>/i.exec(doc.wheelSVG || '');
  if (m) {
    let svg = m[0];
    if (!/xmlns=/.test(svg)) svg = svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
    // The wheel carries only a viewBox; an <img> gets no external CSS, so
    // without explicit width and height it has no intrinsic size and draws
    // as nothing.
    if (!/<svg[^>]*\swidth=/i.test(svg)) svg = svg.replace('<svg', '<svg width="400" height="400"');
    wheelImg = `<img alt="" style="width:330px;height:330px;display:block;margin:0 auto 18px" src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}">`;
  }

  const tables = doc.chartTables
    ? doc.chartTables.tabs.map((t) =>
        `<h3>${esc(t.label)}</h3><div class="tbl tbl-${esc(t.key || '')}">${t.html || ''}</div>`).join('')
    : '';
  if (!wheelImg && !tables) return null;

  const page = document.createElement('div');
  page.className = 'nc';
  page.style.cssText = 'position:fixed;left:-10000px;top:0;width:700px;padding:0;background:#FBF8F2;z-index:-1';
  page.innerHTML = `<style>${sheet}</style>` + wheelImg + tables;

  document.body.appendChild(page);
  try {
    await new Promise((r) => setTimeout(r, 120));   // let the data-URI wheel decode
    return await html2canvas(page, { backgroundColor: '#FBF8F2', scale: 2, useCORS: true, logging: false, windowWidth: 700 });
  } finally {
    page.remove();
  }
}
