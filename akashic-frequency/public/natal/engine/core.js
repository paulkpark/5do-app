/* ── 5D Astro Core ─────────────────────────────────────────────────────────
 Pure computation layer. Wraps circular-natal-horoscope-js (Origin/Horoscope)
 and adds: essential dignity (Lilly scoring), sect, solar phase, speed,
 aspects + orbs + applying, aspect patterns, dispositor trees, element/mode
 balance, annual profection, solar return, secondary progression, transits.
 ─────────────────────────────────────────────────────────────────────────*/
/* 5D Astro Core — pure computation. Emits KEYS only (sign index, body key,
 dignity key); never display text. Use engine/i18n.js to label the output. */

var R = Math.PI / 180, DEG = 180 / Math.PI;

export var SIGNS = [
{ en: 'Aries', gl: '♈', el: 'fire', mo: 'cardinal', pol: 'yang' },
{ en: 'Taurus', gl: '♉', el: 'earth', mo: 'fixed', pol: 'yin' },
{ en: 'Gemini', gl: '♊', el: 'air', mo: 'mutable', pol: 'yang' },
{ en: 'Cancer', gl: '♋', el: 'water', mo: 'cardinal', pol: 'yin' },
{ en: 'Leo', gl: '♌', el: 'fire', mo: 'fixed', pol: 'yang' },
{ en: 'Virgo', gl: '♍', el: 'earth', mo: 'mutable', pol: 'yin' },
{ en: 'Libra', gl: '♎', el: 'air', mo: 'cardinal', pol: 'yang' },
{ en: 'Scorpio', gl: '♏', el: 'water', mo: 'fixed', pol: 'yin' },
{ en: 'Sagittarius', gl: '♐', el: 'fire', mo: 'mutable', pol: 'yang' },
{ en: 'Capricorn', gl: '♑', el: 'earth', mo: 'cardinal', pol: 'yin' },
{ en: 'Aquarius', gl: '♒', el: 'air', mo: 'fixed', pol: 'yang' },
{ en: 'Pisces', gl: '♓', el: 'water', mo: 'mutable', pol: 'yin' }
];

export var GLYPH = {
sun: '☉', moon: '☽', mercury: '☿', venus: '♀', mars: '♂',
jupiter: '♃', saturn: '♄', uranus: '♅', neptune: '♆', pluto: '♇',
chiron: '⚷', lilith: '⚸', northnode: '☊', southnode: '☋',
asc: 'AC', mc: 'MC', dsc: 'DC', ic: 'IC', fortune: '⊗', vertex: 'Vx'
};
export var POINT_KEYS = ['sun','moon','mercury','venus','mars','jupiter','saturn','uranus','neptune','pluto','chiron','northnode','southnode','lilith','asc','mc','dsc','ic','fortune','vertex'];

// traditional (Hellenistic) domicile lords — used for house lords & dispositors
var TRAD_LORD = ['mars', 'venus', 'mercury', 'moon', 'sun', 'mercury', 'venus', 'mars',
  'jupiter', 'saturn', 'saturn', 'jupiter'];
var MODERN_LORD = ['mars', 'venus', 'mercury', 'moon', 'sun', 'mercury', 'venus', 'pluto',
  'jupiter', 'saturn', 'uranus', 'neptune'];

// exaltation: body -> [signIndex, degree]
var EXALT = { sun: [0, 19], moon: [1, 3], mercury: [5, 15], venus: [11, 27], mars: [9, 28], jupiter: [3, 15], saturn: [6, 21] };
// Egyptian terms: signIndex -> [[lord, upToDegree], ...]
var TERMS = [
  [['jupiter', 6], ['venus', 12], ['mercury', 20], ['mars', 25], ['saturn', 30]],
  [['venus', 8], ['mercury', 14], ['jupiter', 22], ['saturn', 27], ['mars', 30]],
  [['mercury', 6], ['jupiter', 12], ['venus', 17], ['mars', 24], ['saturn', 30]],
  [['mars', 7], ['venus', 13], ['mercury', 19], ['jupiter', 26], ['saturn', 30]],
  [['jupiter', 6], ['venus', 11], ['saturn', 18], ['mercury', 24], ['mars', 30]],
  [['mercury', 7], ['venus', 17], ['jupiter', 21], ['mars', 28], ['saturn', 30]],
  [['saturn', 6], ['mercury', 14], ['jupiter', 21], ['venus', 28], ['mars', 30]],
  [['mars', 7], ['venus', 11], ['mercury', 19], ['jupiter', 24], ['saturn', 30]],
  [['jupiter', 12], ['venus', 17], ['mercury', 21], ['saturn', 26], ['mars', 30]],
  [['mercury', 7], ['jupiter', 14], ['venus', 22], ['saturn', 26], ['mars', 30]],
  [['mercury', 7], ['venus', 13], ['jupiter', 20], ['mars', 25], ['saturn', 30]],
  [['venus', 12], ['jupiter', 16], ['mercury', 19], ['mars', 28], ['saturn', 30]]
];
// Chaldean faces (decans)
var FACES = [
  ['mars', 'sun', 'venus'], ['mercury', 'moon', 'saturn'], ['jupiter', 'mars', 'sun'],
  ['venus', 'mercury', 'moon'], ['saturn', 'jupiter', 'mars'], ['sun', 'venus', 'mercury'],
  ['moon', 'saturn', 'jupiter'], ['mars', 'sun', 'venus'], ['mercury', 'moon', 'saturn'],
  ['jupiter', 'mars', 'sun'], ['venus', 'mercury', 'moon'], ['saturn', 'jupiter', 'mars']
];
// Dorothean triplicity: element -> {day, night, part}
var TRIPLICITY = {
  fire: { day: 'sun', night: 'jupiter', part: 'saturn' },
  earth: { day: 'venus', night: 'moon', part: 'mars' },
  air: { day: 'saturn', night: 'mercury', part: 'jupiter' },
  water: { day: 'venus', night: 'mars', part: 'moon' }
};

export var ASPECTS = [
{ key: 'conjunction', gl: '☌', ang: 0, base: 8, level: 'major', rank: 1 },
{ key: 'opposition', gl: '☍', ang: 180, base: 8, level: 'major', rank: 2 },
{ key: 'square', gl: '□', ang: 90, base: 7, level: 'major', rank: 3 },
{ key: 'trine', gl: '△', ang: 120, base: 7, level: 'major', rank: 4 },
{ key: 'sextile', gl: '⚹', ang: 60, base: 5, level: 'major', rank: 5 },
{ key: 'quincunx', gl: '⚻', ang: 150, base: 3, level: 'minor', rank: 6 },
{ key: 'semisquare', gl: '∠', ang: 45, base: 2, level: 'minor', rank: 7 },
{ key: 'sesquiquadrate', gl: '⚼', ang: 135, base: 2, level: 'minor', rank: 8 },
{ key: 'semisextile', gl: '⚺', ang: 30, base: 2, level: 'minor', rank: 9 },
{ key: 'quintile', gl: 'Q', ang: 72, base: 1.5, level: 'minor', rank: 10 },
{ key: 'biquintile', gl: 'bQ', ang: 144, base: 1.5, level: 'minor', rank: 11 }
];

function norm(d) { d %= 360; return d < 0 ? d + 360 : d; }
function signIdx(lon) { return Math.floor(norm(lon) / 30); }
function inSign(lon) { return norm(lon) % 30; }
function dms(lon) {
  var x = inSign(lon), d = Math.floor(x), m = Math.floor((x - d) * 60);
  return { d: d, m: m };
}
function sep(a, b) { var x = Math.abs(norm(a) - norm(b)); return x > 180 ? 360 - x : x; }

/* ── essential dignity ───────────────────────────────────────────────── */
function dignity(key, lon, isDay) {
  var si = signIdx(lon), deg = inSign(lon), out = { score: 0, marks: [] };
  if (!GLYPH[key] || ['chiron', 'lilith', 'northnode', 'southnode', 'asc', 'mc', 'dsc', 'ic', 'fortune', 'vertex'].indexOf(key) >= 0) return null;
  var modern = ['uranus', 'neptune', 'pluto'].indexOf(key) >= 0;
  if (!modern) {
    if (TRAD_LORD[si] === key) { out.score += 5; out.marks.push('domicile'); }
    if (TRAD_LORD[(si + 6) % 12] === key) { out.score -= 5; out.marks.push('detriment'); }
    var ex = EXALT[key];
    if (ex && ex[0] === si) { out.score += 4; out.marks.push('exaltation'); }
    if (ex && (ex[0] + 6) % 12 === si) { out.score -= 4; out.marks.push('fall'); }
    var tri = TRIPLICITY[SIGNS[si].el];
    if (tri[isDay ? 'day' : 'night'] === key) { out.score += 3; out.marks.push('triplicity'); }
    else if (tri.part === key) { out.score += 1; out.marks.push('triplicityPart'); }
    var t = TERMS[si];
    for (var i = 0; i < t.length; i++) { if (deg < t[i][1]) { if (t[i][0] === key) { out.score += 2; out.marks.push('term'); } break; } }
    if (FACES[si][Math.floor(deg / 10)] === key) { out.score += 1; out.marks.push('face'); }
    if (!out.marks.length) out.marks.push('peregrine');
  } else {
    if (MODERN_LORD[si] === key) out.marks.push('modernDomicile');
    if (MODERN_LORD[(si + 6) % 12] === key) out.marks.push('modernDetriment');
    if (!out.marks.length) out.marks.push('none');
    out.score = null;
  }
  return out;
}

/* ── angles from sidereal time ───────────────────────────────────────── */
function angles(lstDeg, latDeg) {
  var ramc = lstDeg * R, eps = 23.4397 * R, phi = latDeg * R;
  var mc = norm(Math.atan2(Math.sin(ramc), Math.cos(ramc) * Math.cos(eps)) * DEG);
  var asc = norm(Math.atan2(Math.cos(ramc), -(Math.sin(ramc) * Math.cos(eps) + Math.tan(phi) * Math.sin(eps))) * DEG);
  // Vertex: ascendant of the co-latitude for RAMC+180
  var r2 = (lstDeg + 180) * R, p2 = (90 - Math.abs(latDeg)) * R;
  var vx = norm(Math.atan2(Math.cos(r2), -(Math.sin(r2) * Math.cos(eps) + Math.tan(p2) * Math.sin(eps))) * DEG);
  if (latDeg < 0) vx = norm(vx + 180);
  // vertex must sit in the western half (between DSC and IC..DSC range 5th–8th)
  var rel = norm(vx - asc);
  if (rel < 150 || rel > 330) vx = norm(vx + 180);
  return { asc: asc, mc: mc, vertex: vx };
}

/* ── aspects ─────────────────────────────────────────────────────────── */
function orbFor(a, k1, k2) {
  var lum = ['sun', 'moon'], ang = ['asc', 'mc'];
  var o = a.base;
  if (lum.indexOf(k1) >= 0 || lum.indexOf(k2) >= 0) o += a.level === 'major' ? 2 : 0.5;
  if (ang.indexOf(k1) >= 0 || ang.indexOf(k2) >= 0) o += a.level === 'major' ? 1 : 0.5;
  if (['chiron', 'lilith', 'northnode', 'southnode', 'fortune', 'vertex'].indexOf(k1) >= 0 ||
    ['chiron', 'lilith', 'northnode', 'southnode', 'fortune', 'vertex'].indexOf(k2) >= 0) o = Math.min(o, 3);
  return o;
}

function findAspects(points) {
  var out = [];
  for (var i = 0; i < points.length; i++) for (var j = i + 1; j < points.length; j++) {
    var p = points[i], q = points[j];
    if ((p.key === 'northnode' && q.key === 'southnode') || (p.key === 'southnode' && q.key === 'northnode')) continue;
    if ((p.key === 'asc' && q.key === 'dsc') || (p.key === 'mc' && q.key === 'ic')) continue;
    var s = sep(p.lon, q.lon);
    for (var a = 0; a < ASPECTS.length; a++) {
      var A = ASPECTS[a], orb = Math.abs(s - A.ang), max = orbFor(A, p.key, q.key);
      if (orb <= max) {
        var applying = null;
        if (typeof p.speed === 'number' && typeof q.speed === 'number') {
          var d = 1 / 24;
          var s2 = sep(p.lon + p.speed * d, q.lon + q.speed * d);
          applying = Math.abs(s2 - A.ang) < orb;
        }
        out.push({
          a: p.key, b: q.key, type: A.key, gl: A.gl,
          level: A.level, rank: A.rank, angle: A.ang, orb: +orb.toFixed(2), maxOrb: max,
          applying: applying, exactness: +(1 - orb / max).toFixed(2)
        });
        break;
      }
    }
  }
  out.sort(function (x, y) {
    var la = x.level === 'major' ? 0 : 1, lb = y.level === 'major' ? 0 : 1;
    return la - lb || x.orb - y.orb;
  });
  return out;
}

/* ── aspect patterns ─────────────────────────────────────────────────── */
function patterns(points, asps) {
  var res = [], has = {};
  asps.forEach(function (a) { has[a.a + '|' + a.b + '|' + a.type] = a; has[a.b + '|' + a.a + '|' + a.type] = a; });
  function rel(x, y, t) { return has[x + '|' + y + '|' + t]; }
  var keys = points.map(function (p) { return p.key; });

  // stellium — 3+ bodies in one sign
  var bySign = {};
  points.forEach(function (p) {
    if (p.kind === 'angle' || p.kind === 'derived') return;
    var s = signIdx(p.lon); (bySign[s] = bySign[s] || []).push(p.key);
  });
  Object.keys(bySign).forEach(function (s) {
    if (bySign[s].length >= 3) res.push({ type: 'Stellium', members: bySign[s], signIndex: +s });
  });

  var n = keys.length;
  for (var i = 0; i < n; i++) for (var j = i + 1; j < n; j++) {
    var A = keys[i], B = keys[j];
    // grand trine / kite
    if (rel(A, B, 'trine')) {
      for (var k = j + 1; k < n; k++) {
        var C = keys[k];
        if (rel(A, C, 'trine') && rel(B, C, 'trine')) {
          res.push({ type: 'Grand Trine', members: [A, B, C], element: SIGNS[signIdx(points[i].lon)].el });
          for (var m = 0; m < n; m++) {
            var D = keys[m]; if ([A, B, C].indexOf(D) >= 0) continue;
            if ((rel(D, A, 'opposition') && rel(D, B, 'sextile') && rel(D, C, 'sextile')) ||
              (rel(D, B, 'opposition') && rel(D, A, 'sextile') && rel(D, C, 'sextile')) ||
              (rel(D, C, 'opposition') && rel(D, A, 'sextile') && rel(D, B, 'sextile')))
              res.push({ type: 'Kite', members: [A, B, C, D], apex: D });
          }
        }
      }
    }
    // t-square / grand cross
    if (rel(A, B, 'opposition')) {
      for (var k2 = 0; k2 < n; k2++) {
        var E = keys[k2]; if (E === A || E === B) continue;
        if (rel(E, A, 'square') && rel(E, B, 'square')) {
          res.push({ type: 'T-Square', members: [A, B, E], apex: E });
          for (var m2 = 0; m2 < n; m2++) {
            var F = keys[m2]; if ([A, B, E].indexOf(F) >= 0) continue;
            if (rel(F, E, 'opposition') && rel(F, A, 'square') && rel(F, B, 'square'))
              res.push({ type: 'Grand Cross', members: [A, B, E, F] });
          }
        }
      }
      // mystic rectangle
      for (var k3 = 0; k3 < n; k3++) for (var k4 = k3 + 1; k4 < n; k4++) {
        var G = keys[k3], H = keys[k4]; if ([A, B].indexOf(G) >= 0 || [A, B].indexOf(H) >= 0) continue;
        if (rel(G, H, 'opposition') && rel(A, G, 'trine') && rel(B, H, 'trine') && rel(A, H, 'sextile') && rel(B, G, 'sextile'))
          res.push({ type: 'Mystic Rectangle', members: [A, B, G, H] });
      }
    }
    // yod / thor's hammer (apex = third point)
    if (rel(A, B, 'sextile')) {
      for (var k5 = 0; k5 < n; k5++) {
        var Y = keys[k5]; if (Y === A || Y === B) continue;
        if (rel(Y, A, 'quincunx') && rel(Y, B, 'quincunx'))
          res.push({ type: 'Yod', members: [A, B, Y], apex: Y });
      }
    }
    if (rel(A, B, 'square')) {
      for (var k6 = 0; k6 < n; k6++) {
        var T = keys[k6]; if (T === A || T === B) continue;
        if (rel(T, A, 'sesquiquadrate') && rel(T, B, 'sesquiquadrate'))
          res.push({ type: "Thor's Hammer", members: [A, B, T], apex: T });
      }
    }
  }
  // dedupe
  var seen = {}, uniq = [];
  res.forEach(function (p) {
    var k = p.type + ':' + p.members.slice().sort().join(',');
    if (!seen[k]) { seen[k] = 1; uniq.push(p); }
  });
  return uniq;
}

/* ── dispositor tree ─────────────────────────────────────────────────── */
function dispositors(bodies) {
  var pos = {}, chains = {}, finals = [], mutual = [];
  bodies.forEach(function (b) { pos[b.key] = b; });
  var planets = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn'];
  planets.forEach(function (k) {
    if (!pos[k]) return;
    var path = [k], cur = k, guard = 0;
    while (guard++ < 12) {
      var lord = TRAD_LORD[signIdx(pos[cur].lon)];
      if (lord === cur) { chains[k] = { path: path, final: cur }; break; }
      if (path.indexOf(lord) >= 0) { chains[k] = { path: path, loop: lord }; break; }
      path.push(lord); cur = lord;
      if (!pos[cur]) break;
    }
    if (!chains[k]) chains[k] = { path: path };
  });
  planets.forEach(function (k) {
    if (pos[k] && TRAD_LORD[signIdx(pos[k].lon)] === k) finals.push(k);
  });
  for (var i = 0; i < planets.length; i++) for (var j = i + 1; j < planets.length; j++) {
    var a = planets[i], b = planets[j];
    if (!pos[a] || !pos[b]) continue;
    if (TRAD_LORD[signIdx(pos[a].lon)] === b && TRAD_LORD[signIdx(pos[b].lon)] === a)
      mutual.push({ a: a, b: b, kind: 'domicile' });
    var ea = EXALT[a], eb = EXALT[b];
    if (ea && eb && ea[0] === signIdx(pos[b].lon) && eb[0] === signIdx(pos[a].lon))
      mutual.push({ a: a, b: b, kind: 'exaltation' });
  }
  return { chains: chains, finals: finals, mutualReception: mutual };
}

/* ── balance ─────────────────────────────────────────────────────────── */
function balance(points) {
  var W = { sun: 3, moon: 3, asc: 3, mercury: 2, venus: 2, mars: 2, jupiter: 1.5, saturn: 1.5, mc: 1.5, uranus: 1, neptune: 1, pluto: 1 };
  var el = { fire: 0, earth: 0, air: 0, water: 0 }, mo = { cardinal: 0, fixed: 0, mutable: 0 }, pol = { yang: 0, yin: 0 };
  var cnt = { fire: 0, earth: 0, air: 0, water: 0 }, cmo = { cardinal: 0, fixed: 0, mutable: 0 }, tot = 0, ctot = 0;
  points.forEach(function (p) {
    var w = W[p.key]; if (!w) return;
    var s = SIGNS[signIdx(p.lon)];
    el[s.el] += w; mo[s.mo] += w; pol[s.pol] += w; tot += w;
    cnt[s.el]++; cmo[s.mo]++; ctot++;
  });
  function pct(o, t) { var r = {}; Object.keys(o).forEach(function (k) { r[k] = { w: +o[k].toFixed(1), pct: +(o[k] / t * 100).toFixed(1) }; }); return r; }
  return {
    elements: pct(el, tot), modalities: pct(mo, tot), polarity: pct(pol, tot),
    countsElement: cnt, countsModality: cmo, weighting: W
  };
}

export {
TRAD_LORD, MODERN_LORD, EXALT, TERMS, FACES, TRIPLICITY,
norm, signIdx, inSign, dms, sep,
dignity, angles, findAspects, patterns, dispositors, balance
};
