/* ── Chart wheel ─────────────────────────────────────────────────────────
   Renders the natal wheel as inline SVG. Language-neutral: only glyphs.
   Pass chart = null for the empty ring used on the entry screen.
   ─────────────────────────────────────────────────────────────────────── */
import * as C from '../engine/core.js';

const CX = 200, CY = 200, R_OUT = 192, R_ZOD = 166, R_HOUSE = 140, R_GLYPH = 122, R_IN = 100;

export function wheelSVG(chart, opts = {}) {
  const asc = chart ? chart._raw.asc : 0;
  const xy = (lon, r) => {
    const f = (180 + (lon - asc)) * Math.PI / 180;
    return [CX + r * Math.cos(f), CY - r * Math.sin(f)];
  };
  const n = v => Math.round(v * 10) / 10;
  const p = [];

  p.push(`<circle cx="200" cy="200" r="${R_OUT}" fill="none" stroke="#3A4C68"/>`);
  p.push(`<circle cx="200" cy="200" r="${R_ZOD}" fill="none" stroke="#3A4C68"/>`);
  p.push(`<circle cx="200" cy="200" r="${R_HOUSE}" fill="none" stroke="#27374F"/>`);
  p.push(`<circle cx="200" cy="200" r="${R_IN}" fill="none" stroke="#27374F"/>`);

  const zg = ['<g class="zring">'];
  for (let s = 0; s < 12; s++) {
    const start = s * 30;
    const [x1, y1] = xy(start, R_ZOD), [x2, y2] = xy(start, R_OUT);
    zg.push(`<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" stroke="#3A4C68"/>`);
    const [gx, gy] = xy(start + 15, (R_ZOD + R_OUT) / 2);
    zg.push(`<text x="${n(gx)}" y="${n(gy + 6)}" text-anchor="middle" font-size="16" fill="#C08B3E" opacity=".9">${C.SIGNS[s].gl}</text>`);
    for (let d = 5; d < 30; d += 5) {
      const [a1, b1] = xy(start + d, R_ZOD), [a2, b2] = xy(start + d, R_ZOD + (d % 10 === 0 ? 7 : 4));
      zg.push(`<line x1="${n(a1)}" y1="${n(b1)}" x2="${n(a2)}" y2="${n(b2)}" stroke="#3A4C68" stroke-width=".6"/>`);
    }
  }
  zg.push('</g>');
  p.push(zg.join(''));

  if (!chart) return frame(p.join(''), true);

  chart._raw.cuspsPL.forEach((cu, i) => {
    const [ax, ay] = xy(cu, R_IN), [bx, by] = xy(cu, R_ZOD);
    const isAngle = i % 3 === 0;
    p.push(`<line x1="${n(ax)}" y1="${n(ay)}" x2="${n(bx)}" y2="${n(by)}" stroke="${isAngle ? '#C08B3E' : '#31425C'}" stroke-width="${isAngle ? 1.4 : .8}"/>`);
    const [lx, ly] = xy(cu + 3, R_HOUSE - 12);
    p.push(`<text x="${n(lx)}" y="${n(ly + 3)}" text-anchor="middle" font-size="9" fill="#5C6C87">${i + 1}</text>`);
  });
  chart._raw.cuspsWS.forEach(cu => {
    const [ax, ay] = xy(cu, R_IN), [bx, by] = xy(cu, R_HOUSE);
    p.push(`<line x1="${n(ax)}" y1="${n(ay)}" x2="${n(bx)}" y2="${n(by)}" stroke="#31425C" stroke-width=".7" stroke-dasharray="2 3"/>`);
  });

  const col = { conjunction: '#C08B3E', opposition: '#C4565B', square: '#C4565B', trine: '#5B86C4', sextile: '#5B86C4' };
  chart.aspects.forEach(a => {
    if (!col[a.type] || a.level !== 'major') return;
    const pa = chart.points.find(x => x.key === a.a), pb = chart.points.find(x => x.key === a.b);
    if (!pa || !pb || pa.kind === 'derived' || pb.kind === 'derived') return;
    const [x1, y1] = xy(pa.lon, R_IN), [x2, y2] = xy(pb.lon, R_IN);
    p.push(`<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" stroke="${col[a.type]}" stroke-width="${a.type === 'conjunction' ? .7 : .9}" opacity="${(0.2 + 0.5 * a.exactness).toFixed(2)}"/>`);
  });

  // spread overlapping glyphs
  const pts = chart.points.filter(x => x.kind === 'body')
    .map(x => ({ gl: x.glyph, lon: x.lon, retro: x.retro, adj: x.lon }))
    .sort((a, b) => C.norm(a.lon - asc) - C.norm(b.lon - asc));
  for (let pass = 0; pass < 24; pass++) {
    let moved = false;
    for (let k = 0; k < pts.length; k++) {
      const q = pts[(k + 1) % pts.length], gap = C.norm(q.adj - pts[k].adj);
      if (gap < 7.5 && gap >= 0) {
        pts[k].adj = C.norm(pts[k].adj - (7.5 - gap) / 2);
        q.adj = C.norm(q.adj + (7.5 - gap) / 2);
        moved = true;
      }
    }
    if (!moved) break;
  }
  pts.forEach(q => {
    const [gx, gy] = xy(q.adj, R_GLYPH), [t1x, t1y] = xy(q.lon, R_HOUSE), [t2x, t2y] = xy(q.adj, R_GLYPH + 12);
    p.push(`<line x1="${n(t1x)}" y1="${n(t1y)}" x2="${n(t2x)}" y2="${n(t2y)}" stroke="#4A5C78" stroke-width=".7"/>`);
    p.push(`<text x="${n(gx)}" y="${n(gy + 6)}" text-anchor="middle" font-size="16" fill="#E2E8F3">${q.gl}</text>`);
    if (q.retro) {
      const [rx, ry] = xy(q.adj, R_GLYPH - 15);
      p.push(`<text x="${n(rx)}" y="${n(ry + 3)}" text-anchor="middle" font-size="8" fill="#C4565B">R</text>`);
    }
  });

  [['AC', chart._raw.asc], ['MC', chart._raw.mc], ['DC', C.norm(chart._raw.asc + 180)], ['IC', C.norm(chart._raw.mc + 180)]]
    .forEach(([label, lon]) => {
      const [gx, gy] = xy(lon, R_OUT - 9);
      p.push(`<text x="${n(gx)}" y="${n(gy + 4)}" text-anchor="middle" font-size="9" fill="#C08B3E" font-weight="600">${label}</text>`);
    });

  return frame(p.join(''), false, opts.ariaLabel);
}

function frame(inner, idle, aria = 'natal chart') {
  return `<div class="wheelbox${idle ? ' idle' : ''}"><svg viewBox="0 0 400 400" role="img" aria-label="${aria}">` +
    `<style>text{font-family:'IBM Plex Sans KR',sans-serif}</style>${inner}</svg></div>`;
}
