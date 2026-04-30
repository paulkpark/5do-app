// =============================================================================
// vedic-data.js — Vedic (Jyotisha) chart calculation
//
// Stage 2: Real ephemeris (this commit). Uses astronomy-engine v2 (MIT) for
// geocentric Sun/Moon/planet positions, plus hand-rolled:
//   - Lahiri ayanamsha (linear formula, accuracy ±0.5' for 1900-2100)
//   - Mean lunar ascending node (Meeus eq. 47.7) for Rahu/Ketu
//   - Lagna (ascendant) from Greenwich apparent sidereal time + lat/lon
//   - 27 Nakshatra mapping (each 13°20' of sidereal zodiac)
//   - Vimshottari Mahadasha walk from birth Moon-nakshatra fraction → today
//
// All longitudes are sidereal Lahiri (most common in Indian Vedic tradition).
// Geocentric ecliptic for graha; the tropical zodiac is already covered on
// the Saju/Western side of the app via ZODIAC_SIGNS.
//
// Caveats:
//   - Birth time is currently interpreted as KST (UTC+9). Stage 3 will add a
//     timezone selector for non-Korean users.
//   - Lat/Lon defaults to Seoul if user didn't provide. Lagna can swing 1°
//     per ~4 minutes of LST change, so for non-Seoul births this matters.
//   - Houses use whole-sign system (Lagna sign = House 1, next rashi = H2).
//     Most common Vedic system. Not Placidus/Koch/Equal — those are Western.
// =============================================================================

// 12 rashi (signs), in zodiac order. Sanskrit + English + element.
const VEDIC_RASHI = [
  { kr: '메샤',     en: 'Aries',       sa: 'Mesha',       symbol: '♈', element: 'fire'  },
  { kr: '브리샤바', en: 'Taurus',      sa: 'Vrishabha',   symbol: '♉', element: 'earth' },
  { kr: '미투나',   en: 'Gemini',      sa: 'Mithuna',     symbol: '♊', element: 'air'   },
  { kr: '카르카',   en: 'Cancer',      sa: 'Karka',       symbol: '♋', element: 'water' },
  { kr: '심하',     en: 'Leo',         sa: 'Simha',       symbol: '♌', element: 'fire'  },
  { kr: '칸야',     en: 'Virgo',       sa: 'Kanya',       symbol: '♍', element: 'earth' },
  { kr: '툴라',     en: 'Libra',       sa: 'Tula',        symbol: '♎', element: 'air'   },
  { kr: '브리쉬치카',en: 'Scorpio',     sa: 'Vrishchika',  symbol: '♏', element: 'water' },
  { kr: '다누',     en: 'Sagittarius', sa: 'Dhanu',       symbol: '♐', element: 'fire'  },
  { kr: '마카라',   en: 'Capricorn',   sa: 'Makara',      symbol: '♑', element: 'earth' },
  { kr: '쿰바',     en: 'Aquarius',    sa: 'Kumbha',      symbol: '♒', element: 'air'   },
  { kr: '미나',     en: 'Pisces',      sa: 'Meena',       symbol: '♓', element: 'water' },
];

// 27 nakshatra (lunar mansions). Each spans 13°20' of the sidereal zodiac.
// Lord = planetary ruler driving the Vimshottari dasha cycle.
const VEDIC_NAKSHATRA = [
  { en: 'Ashwini',          kr: '아쉬위니',        lord: 'Ketu'    },
  { en: 'Bharani',          kr: '바라니',         lord: 'Venus'   },
  { en: 'Krittika',         kr: '크리티카',        lord: 'Sun'     },
  { en: 'Rohini',           kr: '로히니',         lord: 'Moon'    },
  { en: 'Mrigashira',       kr: '므리가쉬라',      lord: 'Mars'    },
  { en: 'Ardra',            kr: '아르드라',        lord: 'Rahu'    },
  { en: 'Punarvasu',        kr: '푸나르바수',      lord: 'Jupiter' },
  { en: 'Pushya',           kr: '푸쉬야',         lord: 'Saturn'  },
  { en: 'Ashlesha',         kr: '아쉴레샤',        lord: 'Mercury' },
  { en: 'Magha',            kr: '마가',          lord: 'Ketu'    },
  { en: 'Purva Phalguni',   kr: '푸르바 팔구니',    lord: 'Venus'   },
  { en: 'Uttara Phalguni',  kr: '우타라 팔구니',    lord: 'Sun'     },
  { en: 'Hasta',            kr: '하스타',         lord: 'Moon'    },
  { en: 'Chitra',           kr: '치트라',         lord: 'Mars'    },
  { en: 'Swati',            kr: '스와티',         lord: 'Rahu'    },
  { en: 'Vishakha',         kr: '비샤카',         lord: 'Jupiter' },
  { en: 'Anuradha',         kr: '아누라다',        lord: 'Saturn'  },
  { en: 'Jyeshtha',         kr: '제슈타',         lord: 'Mercury' },
  { en: 'Mula',             kr: '물라',          lord: 'Ketu'    },
  { en: 'Purva Ashadha',    kr: '푸르바 아샤다',    lord: 'Venus'   },
  { en: 'Uttara Ashadha',   kr: '우타라 아샤다',    lord: 'Sun'     },
  { en: 'Shravana',         kr: '슈라바나',        lord: 'Moon'    },
  { en: 'Dhanishta',        kr: '다니쉬타',        lord: 'Mars'    },
  { en: 'Shatabhisha',      kr: '샤타비샤',        lord: 'Rahu'    },
  { en: 'Purva Bhadrapada', kr: '푸르바 바드라파다', lord: 'Jupiter' },
  { en: 'Uttara Bhadrapada',kr: '우타라 바드라파다', lord: 'Saturn'  },
  { en: 'Revati',           kr: '레바티',         lord: 'Mercury' },
];

// 9 graha (luminaries + 5 visible planets + 2 lunar nodes).
const VEDIC_GRAHA = [
  { id: 'Sun',     kr: '태양',  symbol: '☉' },
  { id: 'Moon',    kr: '달',   symbol: '☾' },
  { id: 'Mars',    kr: '화성',  symbol: '♂' },
  { id: 'Mercury', kr: '수성',  symbol: '☿' },
  { id: 'Jupiter', kr: '목성',  symbol: '♃' },
  { id: 'Venus',   kr: '금성',  symbol: '♀' },
  { id: 'Saturn',  kr: '토성',  symbol: '♄' },
  { id: 'Rahu',    kr: '라후',  symbol: '☊' },
  { id: 'Ketu',    kr: '케투',  symbol: '☋' },
];

// Vimshottari mahadasha: ordered list of (lord, years) starting from Ketu.
// Total = 120 years.  The starting lord is determined by the birth-Moon's
// nakshatra; the balance of the first dasha comes from how far the Moon has
// already moved through that nakshatra at birth.
const VIMSHOTTARI = [
  ['Ketu', 7], ['Venus', 20], ['Sun', 6], ['Moon', 10], ['Mars', 7],
  ['Rahu', 18], ['Jupiter', 16], ['Saturn', 19], ['Mercury', 17],
];

// =============================================================================
// Math helpers
// =============================================================================
const NAKSHATRA_ARC = 360 / 27;          // 13.333... degrees per nakshatra
const RASHI_ARC = 30;
const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;
const J2000 = 2451545.0;

const _norm360 = (x) => { x = x % 360; return x < 0 ? x + 360 : x; };

// Julian Day for a JS Date (UTC).  Standard Meeus algorithm.
function _julianDay(date) {
  const Y = date.getUTCFullYear();
  const M = date.getUTCMonth() + 1;
  const D = date.getUTCDate()
          + (date.getUTCHours() + date.getUTCMinutes()/60 + date.getUTCSeconds()/3600) / 24;
  let y = Y, m = M;
  if (m <= 2) { y -= 1; m += 12; }
  const A = Math.floor(y / 100);
  const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + D + B - 1524.5;
}

// =============================================================================
// Lahiri ayanamsha (sidereal correction).  Linear approximation; accuracy
// ±~0.5 arcmin for 1900-2100 — well within nakshatra-pada precision.
// =============================================================================
function lahiriAyanamsha(date) {
  // Year as a fractional value (Jan 1 = year, Jul 2 = year + 0.5, ...)
  const y = date.getUTCFullYear()
          + (date.getUTCMonth() * 30.44 + date.getUTCDate()) / 365.25;
  return 23.85 + 0.0139657 * (y - 2000);
}

// =============================================================================
// Mean lunar ascending node (Rahu) — Meeus eq. 47.7.  Returns tropical
// longitude in degrees.  Mean (not "true") node is the canonical Vedic value.
// =============================================================================
function _meanRahuTropical(jd) {
  const T = (jd - J2000) / 36525;
  const omega = 125.04452 - 1934.136261 * T + 0.0020708 * T*T + (T*T*T)/450000;
  return _norm360(omega);
}

// =============================================================================
// Mean obliquity of ecliptic (Meeus eq. 22.2 simplified).  Used by ascendant.
// =============================================================================
function _meanObliquity(jd) {
  const T = (jd - J2000) / 36525;
  // 23°26'21.448" - 46.8150"·T - 0.00059"·T² + 0.001813"·T³
  const eps = 23 + 26/60 + 21.448/3600
            - (46.8150 * T + 0.00059 * T*T - 0.001813 * T*T*T) / 3600;
  return eps;
}

// =============================================================================
// Lagna (Ascendant): tropical ecliptic longitude of the eastern horizon.
// Standard formula from observer's local sidereal time + geographic latitude.
// =============================================================================
function _ascendantTropical(jd, lat, lon) {
  const time = Astronomy.MakeTime(new Date((jd - 2440587.5) * 86400 * 1000));
  // Astronomy.SiderealTime returns Greenwich apparent sidereal time in HOURS.
  const gmstHours = Astronomy.SiderealTime(time);
  const lstDeg = _norm360(gmstHours * 15 + lon);
  const lstRad = lstDeg * D2R;
  const phi = lat * D2R;
  const eps = _meanObliquity(jd) * D2R;

  // λ_asc = atan2(-cos(LST), sin(ε)·tan(φ) + cos(ε)·sin(LST))
  const numer = -Math.cos(lstRad);
  const denom = Math.sin(eps) * Math.tan(phi) + Math.cos(eps) * Math.sin(lstRad);
  let asc = Math.atan2(numer, denom) * R2D;
  return _norm360(asc);
}

// =============================================================================
// Geocentric ecliptic longitudes (tropical) via astronomy-engine.
// =============================================================================
function _tropicalLongitudes(date) {
  const time = Astronomy.MakeTime(date);

  // Sun: direct API, ecliptic spherical
  const sun = Astronomy.SunPosition(time);
  const sunLong = sun.elon;   // tropical, geocentric

  // Moon: GeoMoon returns geocentric equatorial vector
  const moonVec = Astronomy.GeoMoon(time);
  const moonEcl = Astronomy.Ecliptic(moonVec);
  const moonLong = moonEcl.elon;

  // Planets: GeoVector + Ecliptic conversion (aberration corrected)
  const planet = (body) => {
    const vec = Astronomy.GeoVector(body, time, true);
    return Astronomy.Ecliptic(vec).elon;
  };

  return {
    Sun:     sunLong,
    Moon:    moonLong,
    Mars:    planet(Astronomy.Body.Mars),
    Mercury: planet(Astronomy.Body.Mercury),
    Jupiter: planet(Astronomy.Body.Jupiter),
    Venus:   planet(Astronomy.Body.Venus),
    Saturn:  planet(Astronomy.Body.Saturn),
  };
}

// =============================================================================
// Sidereal mappings
// =============================================================================
function _rashiFromLongitude(longitude) {
  const idx = Math.floor(longitude / RASHI_ARC) % 12;
  const degreeIn = longitude - idx * RASHI_ARC;
  return { ...VEDIC_RASHI[idx], degree: degreeIn };
}

function _nakshatraFromLongitude(longitude) {
  const idx = Math.floor(longitude / NAKSHATRA_ARC) % 27;
  const fraction = (longitude - idx * NAKSHATRA_ARC) / NAKSHATRA_ARC;  // 0..1
  const pada = Math.min(4, Math.floor(fraction * 4) + 1);
  return { ...VEDIC_NAKSHATRA[idx], pada, fraction, idx };
}

// =============================================================================
// Vimshottari Mahadasha — walk from birth → today.
// Starting lord = Moon-nakshatra's lord; balance of first dasha = remaining
// fraction of nakshatra × lord's full years.
// =============================================================================
function _currentVimshottari(birthDate, todayDate, nakshatraIdx, nakshatraFraction) {
  const startLord = VEDIC_NAKSHATRA[nakshatraIdx].lord;
  const startIdx = VIMSHOTTARI.findIndex(([lord]) => lord === startLord);
  const elapsedYears = (todayDate - birthDate) / (1000 * 60 * 60 * 24 * 365.25);

  // Balance of the first (birth) dasha.
  const firstYears = VIMSHOTTARI[startIdx][1] * (1 - nakshatraFraction);

  if (elapsedYears < firstYears) {
    return {
      lord: startLord,
      years: VIMSHOTTARI[startIdx][1],
      remainingYears: firstYears - elapsedYears,
      elapsedYears,
    };
  }

  // Walk forward through subsequent dashas.
  let cursor = (startIdx + 1) % VIMSHOTTARI.length;
  let consumed = firstYears;
  // Safety bound — we should never need more than 9 walks per 120 years.
  for (let i = 0; i < 100; i++) {
    const [lord, years] = VIMSHOTTARI[cursor];
    if (consumed + years > elapsedYears) {
      return {
        lord,
        years,
        remainingYears: consumed + years - elapsedYears,
        elapsedYears,
      };
    }
    consumed += years;
    cursor = (cursor + 1) % VIMSHOTTARI.length;
  }
  // Shouldn't reach here for any plausible birth date.
  return { lord: startLord, years: VIMSHOTTARI[startIdx][1], remainingYears: 0, elapsedYears };
}

// =============================================================================
// Public entry point — same return shape as the Stage 1 stub, so the React
// callers in index.html don't need to change.
// =============================================================================
function calcVedic(y, m, d, hourStr, lat, lon) {
  // Parse birth time. Default 12:00 (noon, hour-unknown).  Birth time is
  // interpreted as KST (UTC+9) — Stage 3 may add timezone selection.
  const [hh, mm] = (hourStr || '12:00').split(':').map(s => parseInt(s, 10) || 0);
  const birthDate = new Date(Date.UTC(y, m - 1, d, hh - 9, mm));   // KST → UTC
  const jd = _julianDay(birthDate);

  // Defaults: Seoul (37.57°N, 126.98°E) if user left lat/lon empty.
  const latNum = parseFloat(lat);
  const lonNum = parseFloat(lon);
  const lat0 = Number.isFinite(latNum) ? latNum : 37.57;
  const lon0 = Number.isFinite(lonNum) ? lonNum : 126.98;

  if (typeof Astronomy === 'undefined') {
    console.warn('[vedic] astronomy-engine not loaded — Vedic calc unavailable');
    return null;
  }

  const ayan = lahiriAyanamsha(birthDate);
  const trop = _tropicalLongitudes(birthDate);

  // Sidereal subtraction
  const toSidereal = (l) => _norm360(l - ayan);
  const sun     = toSidereal(trop.Sun);
  const moon    = toSidereal(trop.Moon);
  const mars    = toSidereal(trop.Mars);
  const mercury = toSidereal(trop.Mercury);
  const jupiter = toSidereal(trop.Jupiter);
  const venus   = toSidereal(trop.Venus);
  const saturn  = toSidereal(trop.Saturn);

  // Lunar nodes — mean ascending node (Rahu); Ketu is exactly 180° opposite.
  const rahu  = toSidereal(_meanRahuTropical(jd));
  const ketu  = _norm360(rahu + 180);

  // Lagna — only meaningful if we have a real birth time.
  // (If user left time empty we used 12:00, which gives a "rough" lagna.)
  const lagnaTrop = _ascendantTropical(jd, lat0, lon0);
  const lagna = toSidereal(lagnaTrop);
  const lagnaSignIdx = Math.floor(lagna / RASHI_ARC) % 12;

  // Whole-sign houses: rashi index relative to lagna sign.
  const houseOf = (longitude) =>
    ((Math.floor(longitude / RASHI_ARC) - lagnaSignIdx + 12) % 12) + 1;

  // 9 graha — order matches VEDIC_GRAHA so the UI can iterate consistently.
  const grahaLongs = [sun, moon, mars, mercury, jupiter, venus, saturn, rahu, ketu];
  const planets = VEDIC_GRAHA.map((info, i) => {
    const long = grahaLongs[i];
    return {
      ...info,
      rashi: _rashiFromLongitude(long),
      house: houseOf(long),
      degree: long - Math.floor(long / RASHI_ARC) * RASHI_ARC,
      longitude: long,
    };
  });

  // Moon nakshatra + Vimshottari from there.
  const moonNak = _nakshatraFromLongitude(moon);
  const dasha = _currentVimshottari(birthDate, new Date(), moonNak.idx, moonNak.fraction);

  return {
    _stub: false,
    ayanamsha: ayan,
    lagna: { sign: _rashiFromLongitude(lagna), degree: lagna - Math.floor(lagna / RASHI_ARC) * RASHI_ARC, longitude: lagna },
    moonSign: _rashiFromLongitude(moon),
    sunSign: _rashiFromLongitude(sun),
    moonNakshatra: { ...moonNak, longitude: moon },
    planets,
    currentDasha: dasha,
    birthDate: birthDate.toISOString(),
    location: { lat: lat0, lon: lon0 },
    note: (!hourStr || hourStr === '12:00')
      ? 'Lagna approximated — birth time unknown, used 12:00 KST.'
      : (!Number.isFinite(latNum) ? 'Lagna approximated — used Seoul coordinates.' : null),
  };
}

// Browser globals (no module system in this app)
window.calcVedic = calcVedic;
window.lahiriAyanamsha = lahiriAyanamsha;   // exposed so dev console can sanity-check
window.VEDIC_RASHI = VEDIC_RASHI;
window.VEDIC_NAKSHATRA = VEDIC_NAKSHATRA;
window.VEDIC_GRAHA = VEDIC_GRAHA;
window.VIMSHOTTARI = VIMSHOTTARI;
