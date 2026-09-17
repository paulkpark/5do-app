/* 5D Astro Chart Builder — assembles the full chart from the ephemeris.
 Emits KEYS and numbers only; label with engine/i18n.js.

 The ephemeris library is injected so this module works with or without a
 bundler:
   import { Origin, Horoscope } from 'circular-natal-horoscope-js';
   setEphemeris({ Origin, Horoscope });
*/
import * as C from './core.js';

var Origin = null, Horoscope = null;
export function setEphemeris(lib) {
  var m = (lib && lib.Origin) ? lib : (lib && lib.default) || lib;
  Origin = m.Origin; Horoscope = m.Horoscope;
}

function mkOrigin(o) {
  return new Origin({
    year: o.year, month: o.month - 1, date: o.date, hour: o.hour, minute: o.minute,
    latitude: o.lat, longitude: o.lon
  });
}
function mkHoro(origin, system) {
  return new Horoscope({
    origin: origin, houseSystem: system, zodiac: 'tropical',
    aspectPoints: ['bodies'], aspectWithPoints: ['bodies'], aspectTypes: ['major'], language: 'en'
  });
}
function lonOf(x) { return x.ChartPosition.Ecliptic.DecimalDegrees; }

function rawPositions(o) {
  var org = mkOrigin(o);
  var hp = mkHoro(org, 'placidus');
  var hw = mkHoro(org, 'whole-sign');
  var out = { origin: org, lst: org.localSiderealTime, jd: org.julianDate, utc: org.utcTime, bodies: {}, placidusCusps: [], wholeCusps: [] };
  hp.CelestialBodies.all.forEach(function (b) {
    if (b.key === 'sirius') return;
    out.bodies[b.key] = { lon: lonOf(b), retro: !!b.isRetrograde, plHouse: b.House ? b.House.id : null };
  });
  hp.CelestialPoints.all.forEach(function (b) {
    var k = b.key.toLowerCase().replace(/[^a-z]/g, '');
    out.bodies[k] = { lon: lonOf(b), retro: !!b.isRetrograde, plHouse: b.House ? b.House.id : null };
  });
  hw.CelestialBodies.all.forEach(function (b) {
    if (out.bodies[b.key]) out.bodies[b.key].wsHouse = b.House ? b.House.id : null;
  });
  hw.CelestialPoints.all.forEach(function (b) {
    var k = b.key.toLowerCase().replace(/[^a-z]/g, '');
    if (out.bodies[k]) out.bodies[k].wsHouse = b.House ? b.House.id : null;
  });
  out.placidusCusps = hp.Houses.map(function (h) { return h.ChartPosition.StartPosition.Ecliptic.DecimalDegrees; });
  out.wholeCusps = hw.Houses.map(function (h) { return h.ChartPosition.StartPosition.Ecliptic.DecimalDegrees; });
  out.ascLib = lonOf(hp.Ascendant); out.mcLib = lonOf(hp.Midheaven);
  return out;
}

export var ORDER = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto', 'chiron', 'northnode', 'southnode', 'lilith'];

function build(input) {
  var base = rawPositions(input);
  // speeds via ±6h finite difference
  var dtH = 6;
  var before = rawPositions(shiftHours(input, -dtH)), after = rawPositions(shiftHours(input, dtH));
  var ang = C.angles(base.lst, input.lat);
  var asc = base.ascLib, mc = base.mcLib;

  var sunLon = base.bodies.sun.lon;
  // sect: day chart when Sun is above the horizon (ASC→DSC through MC)
  var relSun = C.norm(sunLon - asc);
  var isDay = relSun > 180;

  var points = [];
  function push(key, lon, extra) {
    var si = C.signIdx(lon), d = C.dms(lon);
    var p = {
      key: key, glyph: C.GLYPH[key] || '',
      lon: lon, signIndex: si, signEn: C.SIGNS[si].en, signGlyph: C.SIGNS[si].gl,
      deg: d.d, min: d.m, element: C.SIGNS[si].el, modality: C.SIGNS[si].mo
    };
    for (var k in extra) p[k] = extra[k];
    points.push(p); return p;
  }

  ORDER.forEach(function (k) {
    var b = base.bodies[k]; if (!b) return;
    var sp = ((C.norm(after.bodies[k].lon - before.bodies[k].lon + 180) - 180) / (2 * dtH / 24));
    var dg = C.dignity(k, b.lon, isDay);
    var solar = null;
    if (['moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn'].indexOf(k) >= 0) {
      var s = C.sep(b.lon, sunLon);
      solar = s <= 0.2833 ? 'cazimi' : s <= 8.5 ? 'combust' : s <= 15 ? 'underBeams' : null;
    }
    push(k, b.lon, {
      kind: 'body', retro: b.retro || sp < -0.0002, speed: +sp.toFixed(4),
      motion: (k === 'sun' || k === 'moon') ? 'D' : (sp < -0.0002 ? 'R' : (Math.abs(sp) < 0.003 ? 'S' : 'D')),
      wsHouse: b.wsHouse, plHouse: b.plHouse,
      dignity: dg ? dg.marks : ['none'], dignityScore: dg ? dg.score : null,
      solarPhase: solar
    });
  });

  // angles
  push('asc', asc, { kind: 'angle', speed: 360, wsHouse: 1, plHouse: 1 });
  push('mc', mc, { kind: 'angle', speed: 360, wsHouse: houseOfWS(mc, asc), plHouse: 10 });
  push('dsc', C.norm(asc + 180), { kind: 'angle', wsHouse: 7, plHouse: 7 });
  push('ic', C.norm(mc + 180), { kind: 'angle', wsHouse: houseOfWS(C.norm(mc + 180), asc), plHouse: 4 });

  // lots
  var moonLon = base.bodies.moon.lon;
  var fortune = isDay ? C.norm(asc + moonLon - sunLon) : C.norm(asc + sunLon - moonLon);
  push('fortune', fortune, { kind: 'derived', wsHouse: houseOfWS(fortune, asc), plHouse: houseOfPL(fortune, base.placidusCusps) });
  push('vertex', ang.vertex, { kind: 'derived', wsHouse: houseOfWS(ang.vertex, asc), plHouse: houseOfPL(ang.vertex, base.placidusCusps) });

  var aspPoints = points.filter(function (p) { return ['dsc', 'ic'].indexOf(p.key) < 0; });
  var asps = C.findAspects(aspPoints);
  var patPoints = aspPoints.filter(function (p) {
    return ['northnode', 'southnode', 'lilith', 'fortune', 'vertex'].indexOf(p.key) < 0;
  });
  var pats = C.patterns(patPoints, C.findAspects(patPoints));

  // whole sign houses
  var ascSign = C.signIdx(asc);
  var wsHouses = [];
  for (var i = 0; i < 12; i++) {
    var si = (ascSign + i) % 12;
    var lordKey = C.TRAD_LORD[si];
    var lord = points.filter(function (p) { return p.key === lordKey; })[0];
    wsHouses.push({
      house: i + 1, signIndex: si, signEn: C.SIGNS[si].en,
      lord: lordKey, lordModern: C.MODERN_LORD[si],
      lordSignIndex: lord ? lord.signIndex : null, lordHouseWS: lord ? lord.wsHouse : null,
      lordHousePL: lord ? lord.plHouse : null, lordDignity: lord ? lord.dignity : null,
      lordRetro: lord ? lord.retro : null,
      occupants: points.filter(function (p) { return p.kind === 'body' && p.wsHouse === i + 1; }).map(function (p) { return p.key; })
    });
  }
  // placidus houses + interceptions
  var plHouses = [], signsOnCusps = {};
  for (var j = 0; j < 12; j++) {
    var cusp = base.placidusCusps[j], nx = base.placidusCusps[(j + 1) % 12];
    var d2 = C.dms(cusp);
    signsOnCusps[C.signIdx(cusp)] = true;
    plHouses.push({
      house: j + 1, cuspSignIndex: C.signIdx(cusp), cuspDeg: d2.d, cuspMin: d2.m,
      span: +C.norm(nx - cusp).toFixed(1),
      occupants: points.filter(function (p) { return p.kind === 'body' && p.plHouse === j + 1; }).map(function (p) { return p.key; })
    });
  }
  var intercepted = [];
  for (var s2 = 0; s2 < 12; s2++) if (!signsOnCusps[s2]) intercepted.push(s2);
  // house differences between systems
  var diffs = points.filter(function (p) {
    return p.kind === 'body' && p.wsHouse && p.plHouse && p.wsHouse !== p.plHouse;
  }).map(function (p) { return { body: p.key, whole: p.wsHouse, placidus: p.plHouse, signIndex: p.signIndex, deg: p.deg, min: p.min }; });

  var bodies = points.filter(function (p) { return p.kind === 'body'; });
  return {
    meta: {
      name: input.name || '', placeLabel: input.placeLabel, lat: input.lat, lon: input.lon,
      local: pad(input.year) + '-' + pad2(input.month) + '-' + pad2(input.date) + ' ' + pad2(input.hour) + ':' + pad2(input.minute),
      utc: base.utc.toISOString ? base.utc.toISOString() : String(base.utc),
      tz: base.origin.timezone && base.origin.timezone.name ? base.origin.timezone.name : '',
      julianDay: base.jd, siderealTime: +base.lst.toFixed(3),
      isDay: isDay, sectLight: isDay ? 'sun' : 'moon',
      benefic: isDay ? 'jupiter' : 'venus', malefic: isDay ? 'mars' : 'saturn'
    },
    points: points, bodies: bodies, aspects: asps, patterns: pats,
    wholeHouses: wsHouses, placidusHouses: plHouses, intercepted: intercepted, houseDiffs: diffs,
    dispositors: C.dispositors(bodies), balance: C.balance(points),
    chartRuler: (function () {
      var k = C.TRAD_LORD[ascSign], p = points.filter(function (x) { return x.key === k; })[0];
      return p ? { key: k, signIndex: p.signIndex, deg: p.deg, min: p.min, wsHouse: p.wsHouse, plHouse: p.plHouse, dignity: p.dignity, retro: p.retro, modern: C.MODERN_LORD[ascSign] } : null;
    })(),
    _raw: { asc: asc, mc: mc, cuspsPL: base.placidusCusps, cuspsWS: base.wholeCusps, isDay: isDay, input: input }
  };
}

function houseOfWS(lon, asc) { return ((C.signIdx(lon) - C.signIdx(asc) + 12) % 12) + 1; }
function houseOfPL(lon, cusps) {
  for (var i = 0; i < 12; i++) {
    var a = cusps[i], b = cusps[(i + 1) % 12];
    var span = C.norm(b - a), pos = C.norm(lon - a);
    if (pos < span) return i + 1;
  }
  return 1;
}
function pad(n) { return String(n); }
function pad2(n) { return (n < 10 ? '0' : '') + n; }

function shiftHours(input, h) {
  var d = new Date(Date.UTC(input.year, input.month - 1, input.date, input.hour, input.minute));
  d = new Date(d.getTime() + h * 3600000);
  return {
    year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, date: d.getUTCDate(),
    hour: d.getUTCHours(), minute: d.getUTCMinutes(), lat: input.lat, lon: input.lon,
    placeLabel: input.placeLabel
  };
}

/* ── timing: profection, solar return, progression, transits ─────────── */
function timing(chart, nowDate) {
  var input = chart._raw.input;
  var birth = new Date(Date.UTC(input.year, input.month - 1, input.date, input.hour, input.minute));
  var now = nowDate || new Date();
  var age = now.getUTCFullYear() - input.year;
  var hadBirthday = (now.getUTCMonth() + 1 > input.month) || (now.getUTCMonth() + 1 === input.month && now.getUTCDate() >= input.date);
  if (!hadBirthday) age--;

  // annual profection
  var hIdx = age % 12;
  var ws = chart.wholeHouses[hIdx];
  var lordPt = chart.points.filter(function (p) { return p.key === ws.lord; })[0];
  var profection = {
    age: age, house: hIdx + 1, signIndex: ws.signIndex, yearLord: ws.lord,
    yearLordSignIndex: lordPt ? lordPt.signIndex : null, yearLordHouseWS: lordPt ? lordPt.wsHouse : null,
    yearLordHousePL: lordPt ? lordPt.plHouse : null, yearLordDignity: lordPt ? lordPt.dignity : null,
    periodFrom: fmtDate(new Date(Date.UTC(input.year + age, input.month - 1, input.date))),
    periodTo: fmtDate(new Date(Date.UTC(input.year + age + 1, input.month - 1, input.date))),
    nextYear: { house: ((age + 1) % 12) + 1, signIndex: chart.wholeHouses[(age + 1) % 12].signIndex, yearLord: chart.wholeHouses[(age + 1) % 12].lord },
    threeYears: [0, 1, 2].map(function (k) {
      var w = chart.wholeHouses[(age + k) % 12];
      return { year: input.year + age + k, house: ((age + k) % 12) + 1, signIndex: w.signIndex, lord: w.lord };
    })
  };

  // solar return — bisect Sun longitude back to natal value
  var natalSun = chart.bodies.filter(function (b) { return b.key === 'sun'; })[0].lon;
  var srYear = hadBirthday ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  var sr = solarReturn(natalSun, srYear, input);

  // secondary progression: 1 day = 1 year
  var elapsedYears = (now - birth) / (365.2422 * 86400000);
  var progDate = new Date(birth.getTime() + elapsedYears * 86400000);
  var progIn = { year: progDate.getUTCFullYear(), month: progDate.getUTCMonth() + 1, date: progDate.getUTCDate(), hour: progDate.getUTCHours(), minute: progDate.getUTCMinutes(), lat: input.lat, lon: input.lon };
  var prog = rawPositions(progIn);
  var progAng = C.angles(prog.lst, input.lat);
  function fmtPt(lon) { var d = C.dms(lon); return { signIndex: C.signIdx(lon), deg: d.d, min: d.m }; }
  var progression = {
    progressedDate: fmtDate(progDate),
    sun: fmtPt(prog.bodies.sun.lon), sunHouseWS: houseOfWS(prog.bodies.sun.lon, chart._raw.asc),
    moon: fmtPt(prog.bodies.moon.lon), moonHouseWS: houseOfWS(prog.bodies.moon.lon, chart._raw.asc),
    asc: fmtPt(prog.ascLib), mc: fmtPt(prog.mcLib),
    venus: fmtPt(prog.bodies.venus.lon), mars: fmtPt(prog.bodies.mars.lon),
    mercury: fmtPt(prog.bodies.mercury.lon),
    progressedNewMoonPhase: +C.norm(prog.bodies.moon.lon - prog.bodies.sun.lon).toFixed(1)
  };

  // current transits of slow movers to natal points
  var tIn = { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1, date: now.getUTCDate(), hour: now.getUTCHours(), minute: now.getUTCMinutes(), lat: input.lat, lon: input.lon };
  var tr = rawPositions(tIn);
  var slow = ['jupiter', 'saturn', 'uranus', 'neptune', 'pluto', 'chiron', 'northnode'];
  var natalTargets = chart.points.filter(function (p) {
    return ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto', 'asc', 'mc', 'chiron'].indexOf(p.key) >= 0;
  });
  var majorAng = [{ a: 0, key: 'conjunction' }, { a: 60, key: 'sextile' }, { a: 90, key: 'square' }, { a: 120, key: 'trine' }, { a: 180, key: 'opposition' }];
  var transits = [];
  slow.forEach(function (tk) {
    if (!tr.bodies[tk]) return;
    var tl = tr.bodies[tk].lon;
    natalTargets.forEach(function (np) {
      var s = C.sep(tl, np.lon);
      majorAng.forEach(function (ma) {
        var orb = Math.abs(s - ma.a);
        if (orb <= 2) transits.push({
          transiting: tk, aspect: ma.key, natal: np.key,
          orb: +orb.toFixed(2), transitPos: fmtPt(tl),
          natalHouseWS: np.wsHouse || houseOfWS(np.lon, chart._raw.asc),
          transitHouseWS: houseOfWS(tl, chart._raw.asc)
        });
      });
    });
  });
  transits.sort(function (a, b) { return a.orb - b.orb; });

  // upcoming slow transits over the next 36 months (monthly scan)
  var upcoming = [], seen = {};
  for (var mth = 1; mth <= 36; mth++) {
    var dd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + mth, 15));
    var f = rawPositions({ year: dd.getUTCFullYear(), month: dd.getUTCMonth() + 1, date: 15, hour: 12, minute: 0, lat: input.lat, lon: input.lon });
    ['jupiter', 'saturn', 'uranus', 'neptune', 'pluto', 'chiron'].forEach(function (tk) {
      var tl = f.bodies[tk].lon;
      natalTargets.forEach(function (np) {
        if (['sun', 'moon', 'asc', 'mc', 'saturn', 'pluto', 'uranus'].indexOf(np.key) < 0) return;
        var s = C.sep(tl, np.lon);
        majorAng.forEach(function (ma) {
          if (Math.abs(s - ma.a) <= 1) {
            var ky = tk + ma.a + np.key;
            if (!seen[ky]) {
              seen[ky] = 1;
              upcoming.push({
                year: dd.getUTCFullYear(), month: dd.getUTCMonth() + 1,
                transiting: tk, aspect: ma.key, natal: np.key,
                natalHouseWS: np.wsHouse || houseOfWS(np.lon, chart._raw.asc)
              });
            }
          }
        });
      });
    });
  }

  return { profection: profection, solarReturn: sr, progression: progression, transitsNow: transits.slice(0, 18), upcoming: upcoming.slice(0, 24), calculatedAt: fmtDate(now) };
}

function solarReturn(natalSunLon, year, input) {
  var lo = new Date(Date.UTC(year, input.month - 1, input.date - 2, 0, 0));
  var hi = new Date(Date.UTC(year, input.month - 1, input.date + 2, 0, 0));
  function sunAt(d) {
    var p = rawPositions({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, date: d.getUTCDate(), hour: d.getUTCHours(), minute: d.getUTCMinutes(), lat: input.lat, lon: input.lon });
    return p.bodies.sun.lon;
  }
  function diff(d) { var x = C.norm(sunAt(d) - natalSunLon); return x > 180 ? x - 360 : x; }
  var a = lo.getTime(), b = hi.getTime();
  if (diff(new Date(a)) > 0) a -= 4 * 86400000;
  for (var i = 0; i < 40; i++) {
    var mid = (a + b) / 2;
    if (diff(new Date(mid)) < 0) a = mid; else b = mid;
    if (b - a < 30000) break;
  }
  var t = new Date((a + b) / 2);
  var srIn = { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1, date: t.getUTCDate(), hour: t.getUTCHours(), minute: t.getUTCMinutes(), lat: input.lat, lon: input.lon };
  var p = rawPositions(srIn);
  function fmtPt(lon) { var d = C.dms(lon); return { signIndex: C.signIdx(lon), deg: d.d, min: d.m }; }
  var ascS = p.ascLib;
  var out = { exactUTC: t.toISOString().slice(0, 16).replace('T', ' ') + ' UTC', asc: fmtPt(ascS), mc: fmtPt(p.mcLib), placements: [] };
  ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn'].forEach(function (k) {
    var pos = fmtPt(p.bodies[k].lon);
    out.placements.push({ body: k, signIndex: pos.signIndex, deg: pos.deg, min: pos.min, srHouse: houseOfWS(p.bodies[k].lon, ascS) });
  });
  return out;
}

function fmtDate(d) { return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate()); }

export { build, timing, rawPositions };
