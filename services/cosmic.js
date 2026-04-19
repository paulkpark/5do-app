// ─── Cosmic Weather Service ───
// Computes daily astronomical state (sun, moon, planets) using astronomy-engine.
// Fetches geomagnetic Kp index from NOAA SWPC.
// Caches globally in memory, refreshes on KST date change.

import * as Astro from 'astronomy-engine';

const PLANETS = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn'];

const ZODIAC = [
  { ko: '양자리',   en: 'Aries',       symbol: '♈' },
  { ko: '황소자리', en: 'Taurus',      symbol: '♉' },
  { ko: '쌍둥이자리', en: 'Gemini',   symbol: '♊' },
  { ko: '게자리',   en: 'Cancer',      symbol: '♋' },
  { ko: '사자자리', en: 'Leo',         symbol: '♌' },
  { ko: '처녀자리', en: 'Virgo',       symbol: '♍' },
  { ko: '천칭자리', en: 'Libra',       symbol: '♎' },
  { ko: '전갈자리', en: 'Scorpio',     symbol: '♏' },
  { ko: '궁수자리', en: 'Sagittarius', symbol: '♐' },
  { ko: '염소자리', en: 'Capricorn',   symbol: '♑' },
  { ko: '물병자리', en: 'Aquarius',    symbol: '♒' },
  { ko: '물고기자리', en: 'Pisces',   symbol: '♓' },
];

function zodiacFromLongitude(lon) {
  const idx = Math.floor(((lon % 360) + 360) % 360 / 30);
  return { index: idx, ...ZODIAC[idx] };
}

// Moon phase from Sun-Moon elongation
function moonPhaseFromElongation(elongationDeg, illum) {
  // elongationDeg: 0 (new) → 180 (full) → 360 (new again)
  const e = ((elongationDeg % 360) + 360) % 360;
  let phase, name_ko, name_en, waxing;
  if (e < 22.5)        { phase = 'new';           name_ko = '신월';       name_en = 'New Moon';        waxing = true;  }
  else if (e < 67.5)   { phase = 'waxing_crescent'; name_ko = '초승달';   name_en = 'Waxing Crescent'; waxing = true;  }
  else if (e < 112.5)  { phase = 'first_quarter'; name_ko = '상현달';     name_en = 'First Quarter';   waxing = true;  }
  else if (e < 157.5)  { phase = 'waxing_gibbous';name_ko = '차오르는 달';name_en = 'Waxing Gibbous';  waxing = true;  }
  else if (e < 202.5)  { phase = 'full';          name_ko = '보름달';     name_en = 'Full Moon';       waxing = false; }
  else if (e < 247.5)  { phase = 'waning_gibbous';name_ko = '기우는 달';  name_en = 'Waning Gibbous';  waxing = false; }
  else if (e < 292.5)  { phase = 'last_quarter';  name_ko = '하현달';     name_en = 'Last Quarter';    waxing = false; }
  else if (e < 337.5)  { phase = 'waning_crescent';name_ko = '그믐달';    name_en = 'Waning Crescent'; waxing = false; }
  else                 { phase = 'new';           name_ko = '신월';       name_en = 'New Moon';        waxing = true;  }
  return { phase, name_ko, name_en, waxing, illumination: Math.round(illum * 100) };
}

// Detect retrograde motion by comparing ecliptic longitude over 1 day
function isRetrograde(body, date) {
  try {
    const d1 = new Date(date.getTime() - 12 * 3600 * 1000);
    const d2 = new Date(date.getTime() + 12 * 3600 * 1000);
    const lon1 = Astro.EclipticLongitude(body, d1);
    const lon2 = Astro.EclipticLongitude(body, d2);
    let delta = lon2 - lon1;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    return delta < 0;
  } catch {
    return false;
  }
}

// Check if an eclipse occurs within ±2 days of target date
function checkEclipse(date) {
  try {
    const searchDate = new Date(date.getTime() - 3 * 86400 * 1000);
    const solar = Astro.SearchGlobalSolarEclipse(searchDate);
    const lunar = Astro.SearchLunarEclipse(searchDate);
    const events = [];
    const twoDaysMs = 2 * 86400 * 1000;
    if (solar && Math.abs(solar.peak.date.getTime() - date.getTime()) < twoDaysMs) {
      events.push({ type: 'eclipse', kind: 'solar' });
    }
    if (lunar && Math.abs(lunar.peak.date.getTime() - date.getTime()) < twoDaysMs) {
      events.push({ type: 'eclipse', kind: 'lunar' });
    }
    return events;
  } catch { return []; }
}

// Compute full cosmic snapshot for a given Date (UTC)
function computeSnapshot(date) {
  const events = [];

  // Sun — EclipticLongitude() rejects the Sun body; use SunPosition() for
  // geocentric apparent ecliptic longitude instead.
  let sun = { longitude: 0, sign: ZODIAC[0] };
  try {
    const sunPos = Astro.SunPosition(date);
    const sunLon = sunPos.elon;
    sun = { longitude: +sunLon.toFixed(2), sign: zodiacFromLongitude(sunLon) };
  } catch (e) { console.error('[Cosmic] sun calc failed:', e.message); }

  // Moon
  let moon = { longitude: 0, sign: ZODIAC[0], phase: 'unknown', name_ko: '알 수 없음', name_en: 'Unknown', waxing: false, illumination: 0 };
  try {
    const moonLon = Astro.EclipticLongitude(Astro.Body.Moon, date);
    const illum = Astro.Illumination(Astro.Body.Moon, date);
    // Use PairLongitude for proper apparent elongation; raw subtraction diverges by
    // light-time/aberration corrections and gives nonsense phases.
    const elongation = Astro.PairLongitude(Astro.Body.Moon, Astro.Body.Sun, date);
    moon = {
      longitude: +moonLon.toFixed(2),
      sign: zodiacFromLongitude(moonLon),
      ...moonPhaseFromElongation(elongation, illum.phase_fraction),
    };
    if (moon.phase === 'full') events.push({ type: 'full_moon', sign: moon.sign });
    if (moon.phase === 'new')  events.push({ type: 'new_moon',  sign: moon.sign });
  } catch (e) { console.error('[Cosmic] moon calc failed:', e.message, e.stack); }

  // Planets
  const planets = {};
  ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn'].forEach(name => {
    try {
      const body = Astro.Body[name];
      const lon = Astro.EclipticLongitude(body, date);
      const retro = isRetrograde(body, date);
      planets[name.toLowerCase()] = {
        longitude: +lon.toFixed(2),
        sign: zodiacFromLongitude(lon),
        retrograde: retro,
      };
      if (retro) events.push({ type: 'retrograde', planet: name.toLowerCase(), sign: zodiacFromLongitude(lon) });
    } catch (e) {
      console.warn(`[Cosmic] ${name} calc failed:`, e.message);
    }
  });

  // Eclipses (±2 days)
  events.push(...checkEclipse(date));

  return { sun, moon, planets, events };
}

// Fetch current Kp index from NOAA SWPC
// Format: [{"time_tag":"2026-04-11T00:00:00","Kp":2.00,"a_running":7,"station_count":8}, ...]
async function fetchKpIndex() {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json', { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) { console.warn('[Cosmic] Kp HTTP', res.status); return null; }
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) { console.warn('[Cosmic] Kp empty data'); return null; }
    // Find latest entry by time_tag
    let latest = data[data.length - 1];
    for (const row of data) {
      if (row && row.time_tag && (!latest.time_tag || row.time_tag > latest.time_tag)) latest = row;
    }
    const kp = parseFloat(latest.Kp ?? latest.kp);
    if (isNaN(kp)) { console.warn('[Cosmic] Kp parse failed:', JSON.stringify(latest)); return null; }
    console.log(`[Cosmic] Kp fetched: ${kp} (at ${latest.time_tag})`);
    return Math.round(kp);
  } catch (e) {
    console.warn('[Cosmic] Kp fetch failed:', e.message);
    return null;
  }
}

// KST date helper
function getKstDateString(d = new Date()) {
  const kst = new Date(d.getTime() + 9 * 3600 * 1000);
  return kst.toISOString().slice(0, 10); // "YYYY-MM-DD"
}

// ─── Cache ───
let cache = {
  date: null,
  snapshot: null,
  kp: null,
  kp_fetched_at: 0,
};

export async function getCosmicState() {
  const today = getKstDateString();
  const now = Date.now();

  // Recompute snapshot if date changed
  if (cache.date !== today) {
    const utcNoon = new Date(today + 'T03:00:00Z'); // KST noon = UTC 03:00
    cache.snapshot = computeSnapshot(utcNoon);
    cache.date = today;
    console.log(`[Cosmic] Snapshot computed for ${today}`);
  }

  // Refresh Kp every 3 hours
  if (!cache.kp || now - cache.kp_fetched_at > 3 * 3600 * 1000) {
    const kp = await fetchKpIndex();
    if (kp !== null) {
      cache.kp = kp;
      cache.kp_fetched_at = now;
    }
  }

  return {
    date: cache.date,
    ...cache.snapshot,
    kp: cache.kp,
  };
}

export { getKstDateString };
