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

// 12 rashi (signs), in zodiac order. Sanskrit + English + element + a one-line
// keyword pair (ko/en) capturing the sign's core archetype — used by the
// Vedic report card so a placement isn't just a label.
const VEDIC_RASHI = [
  { kr: '메샤',     en: 'Aries',       sa: 'Mesha',       symbol: '♈', element: 'fire',  keyword: { ko: '개척·용기·시작',     en: 'pioneer · courage · initiative' } },
  { kr: '브리샤바', en: 'Taurus',      sa: 'Vrishabha',   symbol: '♉', element: 'earth', keyword: { ko: '안정·감각·끈기',      en: 'stability · sensuality · persistence' } },
  { kr: '미투나',   en: 'Gemini',      sa: 'Mithuna',     symbol: '♊', element: 'air',   keyword: { ko: '소통·호기심·이중성',  en: 'communication · curiosity · duality' } },
  { kr: '카르카',   en: 'Cancer',      sa: 'Karka',       symbol: '♋', element: 'water', keyword: { ko: '돌봄·감정·집',       en: 'nurture · emotion · home' } },
  { kr: '심하',     en: 'Leo',         sa: 'Simha',       symbol: '♌', element: 'fire',  keyword: { ko: '리더십·창조·자존',    en: 'leadership · creativity · pride' } },
  { kr: '칸야',     en: 'Virgo',       sa: 'Kanya',       symbol: '♍', element: 'earth', keyword: { ko: '정밀·봉사·분석',      en: 'precision · service · analysis' } },
  { kr: '툴라',     en: 'Libra',       sa: 'Tula',        symbol: '♎', element: 'air',   keyword: { ko: '균형·관계·정의',      en: 'balance · partnership · justice' } },
  { kr: '브리쉬치카',en: 'Scorpio',     sa: 'Vrishchika',  symbol: '♏', element: 'water', keyword: { ko: '깊이·변용·강렬',      en: 'depth · transformation · intensity' } },
  { kr: '다누',     en: 'Sagittarius', sa: 'Dhanu',       symbol: '♐', element: 'fire',  keyword: { ko: '철학·확장·자유',      en: 'philosophy · expansion · freedom' } },
  { kr: '마카라',   en: 'Capricorn',   sa: 'Makara',      symbol: '♑', element: 'earth', keyword: { ko: '규율·야망·구조',      en: 'discipline · ambition · structure' } },
  { kr: '쿰바',     en: 'Aquarius',    sa: 'Kumbha',      symbol: '♒', element: 'air',   keyword: { ko: '혁신·인류애·초연',    en: 'innovation · humanity · detachment' } },
  { kr: '미나',     en: 'Pisces',      sa: 'Meena',       symbol: '♓', element: 'water', keyword: { ko: '상상·자비·영성',      en: 'imagination · compassion · spirituality' } },
];

// 27 nakshatra (lunar mansions). Each spans 13°20' of the sidereal zodiac.
// Lord = planetary ruler driving the Vimshottari dasha cycle. The deity
// (devata) and keyword carry the lunar mansion's traditional flavor —
// the report card surfaces these as the chart's most personal lens.
const VEDIC_NAKSHATRA = [
  { en: 'Ashwini',          kr: '아쉬위니',        lord: 'Ketu',    deity: 'Ashwins',     keyword: { ko: '치유·신속·시작',     en: 'healing · swiftness · new beginnings' } },
  { en: 'Bharani',          kr: '바라니',         lord: 'Venus',   deity: 'Yama',        keyword: { ko: '인내·변용·산고',     en: 'restraint · transformation · birth-pangs' } },
  { en: 'Krittika',         kr: '크리티카',        lord: 'Sun',     deity: 'Agni',        keyword: { ko: '예리함·정화·불꽃',    en: 'sharpness · purification · flame' } },
  { en: 'Rohini',           kr: '로히니',         lord: 'Moon',    deity: 'Brahma',      keyword: { ko: '아름다움·풍요·성장',  en: 'beauty · abundance · growth' } },
  { en: 'Mrigashira',       kr: '므리가쉬라',      lord: 'Mars',    deity: 'Soma',        keyword: { ko: '탐색·온화·갈망',     en: 'searching · gentleness · longing' } },
  { en: 'Ardra',            kr: '아르드라',        lord: 'Rahu',    deity: 'Rudra',       keyword: { ko: '폭풍·격변·혁신',     en: 'storm · upheaval · breakthrough' } },
  { en: 'Punarvasu',        kr: '푸나르바수',      lord: 'Jupiter', deity: 'Aditi',       keyword: { ko: '귀환·풍요·재생',     en: 'return · abundance · renewal' } },
  { en: 'Pushya',           kr: '푸쉬야',         lord: 'Saturn',  deity: 'Brihaspati',  keyword: { ko: '양육·번영·보호',     en: 'nourishment · prosperity · protection' } },
  { en: 'Ashlesha',         kr: '아쉴레샤',        lord: 'Mercury', deity: 'Naga',        keyword: { ko: '엮임·신비·통찰',     en: 'entwinement · mystery · insight' } },
  { en: 'Magha',            kr: '마가',          lord: 'Ketu',    deity: 'Pitris',      keyword: { ko: '조상·왕권·유산',     en: 'ancestors · royalty · legacy' } },
  { en: 'Purva Phalguni',   kr: '푸르바 팔구니',    lord: 'Venus',   deity: 'Bhaga',       keyword: { ko: '즐거움·창조·관계',    en: 'pleasure · creativity · romance' } },
  { en: 'Uttara Phalguni',  kr: '우타라 팔구니',    lord: 'Sun',     deity: 'Aryaman',     keyword: { ko: '우정·약속·관대함',    en: 'friendship · contracts · generosity' } },
  { en: 'Hasta',            kr: '하스타',         lord: 'Moon',    deity: 'Savitr',      keyword: { ko: '솜씨·치유·손',       en: 'skill · craft · healing hands' } },
  { en: 'Chitra',           kr: '치트라',         lord: 'Mars',    deity: 'Vishvakarma', keyword: { ko: '찬란함·창조·매력',    en: 'brilliance · craftsmanship · charisma' } },
  { en: 'Swati',            kr: '스와티',         lord: 'Rahu',    deity: 'Vayu',        keyword: { ko: '독립·움직임·균형',    en: 'independence · movement · balance' } },
  { en: 'Vishakha',         kr: '비샤카',         lord: 'Jupiter', deity: 'Indra-Agni',  keyword: { ko: '목적·집중·성취',     en: 'purpose · focus · achievement' } },
  { en: 'Anuradha',         kr: '아누라다',        lord: 'Saturn',  deity: 'Mitra',       keyword: { ko: '헌신·우정·조화',     en: 'devotion · friendship · harmony' } },
  { en: 'Jyeshtha',         kr: '제슈타',         lord: 'Mercury', deity: 'Indra',       keyword: { ko: '연장자·용기·지위',    en: 'eldership · courage · status' } },
  { en: 'Mula',             kr: '물라',          lord: 'Ketu',    deity: 'Nirriti',     keyword: { ko: '뿌리·해체·진리',     en: 'root · dissolution · truth-seeking' } },
  { en: 'Purva Ashadha',    kr: '푸르바 아샤다',    lord: 'Venus',   deity: 'Apas',        keyword: { ko: '불굴·정화·에너지',    en: 'invincibility · cleansing · vigor' } },
  { en: 'Uttara Ashadha',   kr: '우타라 아샤다',    lord: 'Sun',     deity: 'Vishvedevas', keyword: { ko: '리더십·지속·승리',    en: 'leadership · endurance · final victory' } },
  { en: 'Shravana',         kr: '슈라바나',        lord: 'Moon',    deity: 'Vishnu',      keyword: { ko: '경청·학습·연결',     en: 'listening · learning · connection' } },
  { en: 'Dhanishta',        kr: '다니쉬타',        lord: 'Mars',    deity: 'Vasus',       keyword: { ko: '풍요·음악·리듬',     en: 'wealth · music · rhythm' } },
  { en: 'Shatabhisha',      kr: '샤타비샤',        lord: 'Rahu',    deity: 'Varuna',      keyword: { ko: '치유·신비·고독',     en: 'healing · mystery · solitude' } },
  { en: 'Purva Bhadrapada', kr: '푸르바 바드라파다', lord: 'Jupiter', deity: 'Aja Ekapada', keyword: { ko: '영적불꽃·강렬·정화',  en: 'spiritual fire · intensity · purification' } },
  { en: 'Uttara Bhadrapada',kr: '우타라 바드라파다', lord: 'Saturn',  deity: 'Ahir Budhnya',keyword: { ko: '깊이·쿤달리니·지혜',  en: 'depth · kundalini · cosmic wisdom' } },
  { en: 'Revati',           kr: '레바티',         lord: 'Mercury', deity: 'Pushan',      keyword: { ko: '보호·여정·완성',     en: 'protection · journey · completion' } },
];

// 9 graha (luminaries + 5 visible planets + 2 lunar nodes).
// `domain` is the planet's traditional sphere of influence — what its
// position colors in a person's life when interpreted.
const VEDIC_GRAHA = [
  { id: 'Sun',     kr: '태양',  symbol: '☉', sa: 'Surya',     domain: { ko: '영혼·자아·생명력·아버지·권위',    en: 'soul · ego · vitality · father · authority' } },
  { id: 'Moon',    kr: '달',   symbol: '☾', sa: 'Chandra',   domain: { ko: '마음·감정·어머니·안식',         en: 'mind · emotion · mother · comfort' } },
  { id: 'Mars',    kr: '화성',  symbol: '♂', sa: 'Mangala',   domain: { ko: '에너지·용기·행동·갈등',         en: 'energy · courage · action · conflict' } },
  { id: 'Mercury', kr: '수성',  symbol: '☿', sa: 'Budha',     domain: { ko: '지성·소통·학습·사업',          en: 'intellect · communication · learning · business' } },
  { id: 'Jupiter', kr: '목성',  symbol: '♃', sa: 'Guru',      domain: { ko: '지혜·확장·행운·스승',          en: 'wisdom · expansion · fortune · teachers' } },
  { id: 'Venus',   kr: '금성',  symbol: '♀', sa: 'Shukra',    domain: { ko: '사랑·아름다움·관계·예술',        en: 'love · beauty · relationships · arts' } },
  { id: 'Saturn',  kr: '토성',  symbol: '♄', sa: 'Shani',     domain: { ko: '규율·시간·카르마·제약',         en: 'discipline · time · karma · restriction' } },
  { id: 'Rahu',    kr: '라후',  symbol: '☊', sa: 'Rahu',      domain: { ko: '욕망·집착·물질·이방·확장',       en: 'desire · obsession · materialism · foreign' } },
  { id: 'Ketu',    kr: '케투',  symbol: '☋', sa: 'Ketu',      domain: { ko: '초연·영성·과거카르마·해탈',      en: 'detachment · spirituality · past karma · moksha' } },
];

// 12 houses (Bhava): the life-area each house governs.  Whole-sign system —
// House 1 = Lagna's rashi, House 2 = next rashi, etc.
const VEDIC_HOUSE_MEANINGS = [
  null,   // 0 unused; houses are 1-indexed
  { ko: '자아·신체·외형',          en: 'self · body · personality' },
  { ko: '재물·가족·언변',          en: 'wealth · family · speech' },
  { ko: '소통·형제·용기',          en: 'communication · siblings · courage' },
  { ko: '집·어머니·기반',          en: 'home · mother · foundation' },
  { ko: '창조·자녀·연애',          en: 'creativity · children · romance' },
  { ko: '봉사·건강·일상',          en: 'service · health · daily routine' },
  { ko: '결혼·동업·관계',          en: 'marriage · partnership · others' },
  { ko: '변용·비밀·유산',          en: 'transformation · secrets · inheritance' },
  { ko: '다르마·영성·여행',         en: 'dharma · spirituality · long journeys' },
  { ko: '직업·명예·지위',          en: 'career · reputation · status' },
  { ko: '이익·공동체·성취',         en: 'gains · community · fulfillment' },
  { ko: '해탈·고독·손실',          en: 'liberation · solitude · expenses' },
];

// What a Vimshottari mahadasha period of each lord traditionally brings.
// Used to give the "current dasha" card in the report card a one-line context.
const VEDIC_DASHA_THEMES = {
  Sun:     { ko: '자기실현·리더십·인정의 시기',         en: 'self-realization, leadership, recognition' },
  Moon:    { ko: '감정 성장·관계·안식의 시기',          en: 'emotional growth, relationships, comfort' },
  Mars:    { ko: '행동·갈등 해결·생명력의 시기',         en: 'action, conflict resolution, vitality' },
  Mercury: { ko: '학습·사업·소통의 시기',              en: 'learning, business, communication' },
  Jupiter: { ko: '지혜·확장·가족과 스승의 시기',         en: 'wisdom, expansion, teachers and mentors' },
  Venus:   { ko: '사랑·예술·풍요의 시기',              en: 'love, arts, abundance, comfort' },
  Saturn:  { ko: '규율·노력·카르마 정산의 시기',         en: 'discipline, hard work, karmic settling' },
  Rahu:    { ko: '욕망·물질·이방·격변의 시기',          en: 'desire, materialism, foreign elements, upheaval' },
  Ketu:    { ko: '초연·영성·갑작스러운 변화의 시기',     en: 'detachment, spirituality, sudden change' },
};

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

// =============================================================================
// Rule-based Vedic synthesis fallback — used when the Claude API call fails
// or doesn't return a [VEDIC_KO]/[VEDIC_EN] block. Produces a coherent 4-5
// sentence reading from chart features alone, so the card always has
// integrated context even with no AI.
// =============================================================================
function buildVedicFallbackSynthesis(v, name, lang) {
  if (!v) return null;
  const dashaTheme = (VEDIC_DASHA_THEMES[v.currentDasha.lord] || {});
  const lagnaKw = (lang === 'ko' ? v.lagna.sign.keyword?.ko : v.lagna.sign.keyword?.en) || '';
  const moonKw  = (lang === 'ko' ? v.moonSign.keyword?.ko  : v.moonSign.keyword?.en) || '';
  const nakKw   = (lang === 'ko' ? v.moonNakshatra.keyword?.ko : v.moonNakshatra.keyword?.en) || '';
  const sunKw   = (lang === 'ko' ? v.sunSign.keyword?.ko   : v.sunSign.keyword?.en) || '';
  const dashaT  = (lang === 'ko' ? dashaTheme.ko : dashaTheme.en) || '';
  const who = name && name.trim() ? name.trim() : (lang === 'ko' ? '당신' : 'You');

  if (lang === 'ko') {
    return `${who}은(는) **${v.lagna.sign.kr} 라그나** — ${lagnaKw} — 의 결로 외부 세계와 만납니다. 마음의 본바탕은 **${v.moonSign.kr}** (${moonKw}) 라쉬에 있고, 그 안의 더 미세한 결인 **${v.moonNakshatra.kr} 나크샤트라** (${v.moonNakshatra.deity} 신성)는 ${nakKw}을(를) 품고 있습니다. 영혼의 의지는 **${v.sunSign.kr}** (${sunKw}) 에서 빛나며, 라그나·달·태양의 세 축이 외적 존재 방식·내적 감정 본바탕·삶의 사명을 함께 형성합니다. 현재 **${v.currentDasha.lord} 마하다샤** (남은 ${v.currentDasha.remainingYears.toFixed(1)}년 / 총 ${v.currentDasha.years}년) 시기로, ${dashaT}의 흐름이 펼쳐지고 있습니다. 이 시기의 행성 에너지는 차트의 다른 요소와 어떻게 결합되는지에 따라 도전 또는 기회로 작용합니다.`;
  } else {
    return `${who} meets the world through a **${v.lagna.sign.en} Lagna** — ${lagnaKw}. The inner emotional landscape is held by the **${v.moonSign.en}** rashi (${moonKw}), with the finer texture of **${v.moonNakshatra.en} nakshatra** (deity ${v.moonNakshatra.deity}) carrying ${nakKw}. The soul's will shines through **${v.sunSign.en}** (${sunKw}), and these three axes — Lagna, Moon, Sun — together shape outer mode, inner feeling, and life's calling. You are currently in the **${v.currentDasha.lord} mahadasha** (${v.currentDasha.remainingYears.toFixed(1)} of ${v.currentDasha.years} years remaining), a period of ${dashaT}. How this period's energy lands depends on how the lord interacts with the rest of the chart — challenge or opportunity, often both.`;
  }
}
window.buildVedicFallbackSynthesis = buildVedicFallbackSynthesis;

// =============================================================================
// Geocoding helper — turns "Seoul" / "서울" / "Tokyo" / etc. into {lat, lon}
// via OpenStreetMap Nominatim (free, no key, ~1 req/sec).  Results are
// cached in localStorage so repeat lookups don't re-hit the API.  Used by
// the Vedic input form so the user doesn't have to look up coordinates by
// hand for the Lagna calculation.
// =============================================================================
async function geocodePlace(query) {
  const q = (query || '').trim();
  if (!q) return null;

  // localStorage cache
  const CACHE_KEY = '_geocode_cache_v1';
  let cache = {};
  try { cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); } catch (_) {}
  if (cache[q]) return cache[q];

  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&accept-language=ko,en`;
    const resp = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!resp.ok) return null;
    const arr = await resp.json();
    if (!Array.isArray(arr) || arr.length === 0) return null;
    const r = arr[0];
    const out = {
      lat: parseFloat(r.lat),
      lon: parseFloat(r.lon),
      display: r.display_name || q,
    };
    if (!Number.isFinite(out.lat) || !Number.isFinite(out.lon)) return null;
    cache[q] = out;
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch (_) {}
    return out;
  } catch (e) {
    console.warn('[geocode] lookup failed:', e);
    return null;
  }
}
window.geocodePlace = geocodePlace;

// Browser globals (no module system in this app)
window.calcVedic = calcVedic;
window.lahiriAyanamsha = lahiriAyanamsha;   // exposed so dev console can sanity-check
window.VEDIC_RASHI = VEDIC_RASHI;
window.VEDIC_NAKSHATRA = VEDIC_NAKSHATRA;
window.VEDIC_GRAHA = VEDIC_GRAHA;
window.VIMSHOTTARI = VIMSHOTTARI;
window.VEDIC_HOUSE_MEANINGS = VEDIC_HOUSE_MEANINGS;
window.VEDIC_DASHA_THEMES = VEDIC_DASHA_THEMES;
