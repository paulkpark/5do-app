// =============================================================================
// vedic-data.js — Vedic (Jyotisha) chart calculation
//
// STAGE 1 (current): Placeholder/stub. Returns deterministic sample data so the
//   UI can render and the Claude prompt branch can be wired up end-to-end.
// STAGE 2 (next): Replace _stubChart() with real ephemeris:
//   - VSOP87 truncated for Sun/Mars/Mercury/Jupiter/Venus/Saturn (geocentric)
//   - Meeus chapter 47 for Moon
//   - Lunar nodes (Rahu/Ketu) — Meeus eq. 47.7 mean ascending node
//   - Lahiri ayanamsha (linear formula valid 1900-2100):
//         ayan = 23.85037° + 0.0139657° × (yr - 2000) + finer corrections
//   - Ascendant (Lagna) from local sidereal time + observer latitude
//   - 27 nakshatra from Moon's sidereal longitude
//     (each nakshatra = 13°20'; pada = quarter of a nakshatra)
//   - Vimshottari Mahadasha — 120-year cycle, lord determined by birth-Moon
//     nakshatra; balance computed from how far Moon traveled into nakshatra.
//
// All values returned use Lahiri sidereal zodiac (the most common in Indian
// Vedic tradition). Tropical zodiac is not supported here — the Saju side of
// the app already covers Western/tropical via ZODIAC_SIGNS.
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
// Stub chart — deterministic sample data based on birth-date hash so the UI
// shows different-looking output for different inputs while real ephemeris
// isn't wired in yet. Replace with calcVedicAccurate() in Stage 2.
// =============================================================================
function _stubChart(y, m, d, hourStr, lat, lon) {
  // Tiny deterministic hash so different birth dates yield different samples.
  const seed = ((y * 12 + m) * 31 + d) ^ Math.round((parseFloat(lat) || 0) * 7);
  const pick = (arr, off) => arr[((seed + off) % arr.length + arr.length) % arr.length];

  const moonNakshatra = pick(VEDIC_NAKSHATRA, 0);
  const moonSign = pick(VEDIC_RASHI, 1);   // moon rashi
  const lagnaSign = pick(VEDIC_RASHI, 5);  // ascendant
  const sunSign = pick(VEDIC_RASHI, 3);
  const dashaLord = moonNakshatra.lord;    // canonical: dasha starts with moon's nakshatra-lord
  const dashaIdx = VIMSHOTTARI.findIndex(d => d[0] === dashaLord);
  const dashaYears = VIMSHOTTARI[dashaIdx >= 0 ? dashaIdx : 0][1];

  // Place all 9 graha across the 12 rashi; just deterministic spread.
  const planets = VEDIC_GRAHA.map((g, i) => ({
    ...g,
    rashi: pick(VEDIC_RASHI, i + 7),
    house: ((seed + i * 3) % 12) + 1,
    degree: ((seed * 13 + i * 31) % 30) + ((seed * 7) % 60) / 60,  // 0–30°
  }));

  return {
    _stub: true,            // stripped in Stage 2
    ayanamsha: 24.18,       // Lahiri value approx for 2026
    lagna: { sign: lagnaSign, degree: ((seed * 11) % 30) + 0.5 },
    moonSign,
    sunSign,
    moonNakshatra: { ...moonNakshatra, pada: ((seed % 4) + 1) },
    planets,
    currentDasha: {
      lord: dashaLord,
      years: dashaYears,
      remainingYears: Math.max(1, dashaYears - ((y - 1900) % dashaYears)),
    },
  };
}

// Public entry point. Same shape will be returned by the Stage 2 accurate
// version, so callers don't need to change.
function calcVedic(y, m, d, hourStr, lat, lon) {
  return _stubChart(y, m, d, hourStr || '12:00', lat || 0, lon || 0);
}

// Browser globals (no module system in this app)
window.calcVedic = calcVedic;
window.VEDIC_RASHI = VEDIC_RASHI;
window.VEDIC_NAKSHATRA = VEDIC_NAKSHATRA;
window.VEDIC_GRAHA = VEDIC_GRAHA;
window.VIMSHOTTARI = VIMSHOTTARI;
