// ─── Cosmic Live Service ───
// Real-time space-weather + solar-system data feed for the Cosmic Monitor page.
// Uses NOAA SWPC + Open Notify + astronomy-engine (local compute for planets).
// Server-side cached 60s to respect upstream rate limits.

import * as Astro from 'astronomy-engine';

const ZODIAC = [
  { ko: '양자리',     en: 'Aries',       symbol: '♈' },
  { ko: '황소자리',   en: 'Taurus',      symbol: '♉' },
  { ko: '쌍둥이자리', en: 'Gemini',      symbol: '♊' },
  { ko: '게자리',     en: 'Cancer',      symbol: '♋' },
  { ko: '사자자리',   en: 'Leo',         symbol: '♌' },
  { ko: '처녀자리',   en: 'Virgo',       symbol: '♍' },
  { ko: '천칭자리',   en: 'Libra',       symbol: '♎' },
  { ko: '전갈자리',   en: 'Scorpio',     symbol: '♏' },
  { ko: '궁수자리',   en: 'Sagittarius', symbol: '♐' },
  { ko: '염소자리',   en: 'Capricorn',   symbol: '♑' },
  { ko: '물병자리',   en: 'Aquarius',    symbol: '♒' },
  { ko: '물고기자리', en: 'Pisces',      symbol: '♓' },
];

function zodiacFromLongitude(lon) {
  const idx = Math.floor((((lon % 360) + 360) % 360) / 30);
  const deg = ((lon % 30) + 30) % 30;
  return { index: idx, ...ZODIAC[idx], degree: +deg.toFixed(1) };
}

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
  } catch { return false; }
}

// ─── Fetch helper with timeout ───
async function fetchJson(url, timeoutMs = 6000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': '5DO/1.0' } });
    clearTimeout(timer);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

// ─── Kp Index (current geomagnetic activity) ───
// Scale: 0-1 quiet, 2-3 unsettled, 4 active, 5-6 storm, 7-9 severe storm
async function fetchKp() {
  try {
    const data = await fetchJson('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json');
    if (!Array.isArray(data) || data.length === 0) return null;
    let latest = data[data.length - 1];
    for (const row of data) {
      if (row && row.time_tag && (!latest.time_tag || row.time_tag > latest.time_tag)) latest = row;
    }
    const value = parseFloat(latest.Kp ?? latest.kp);
    if (isNaN(value)) return null;
    let level = 'quiet';
    if (value >= 7) level = 'severe';
    else if (value >= 5) level = 'storm';
    else if (value >= 4) level = 'active';
    else if (value >= 2) level = 'unsettled';
    // Build 24h history (last 8 3-hour readings)
    const history = data.slice(-9, -1).map(r => ({
      t: r.time_tag,
      value: parseFloat(r.Kp ?? r.kp) || 0,
    }));
    return { value: +value.toFixed(1), level, time_tag: latest.time_tag, history };
  } catch (e) {
    console.warn('[CosmicLive] Kp fetch failed:', e.message);
    return null;
  }
}

// ─── Solar Wind Plasma (speed + density + temperature) ───
async function fetchSolarWindPlasma() {
  try {
    const data = await fetchJson('https://services.swpc.noaa.gov/products/solar-wind/plasma-1-day.json');
    if (!Array.isArray(data) || data.length < 2) return null;
    // Format: [header, ...rows]. Headers: ["time_tag","density","speed","temperature"]
    // Find the latest valid row (some may be nulls)
    for (let i = data.length - 1; i >= 1; i--) {
      const row = data[i];
      const density = parseFloat(row[1]);
      const speed = parseFloat(row[2]);
      const temp = parseFloat(row[3]);
      if (!isNaN(density) && !isNaN(speed)) {
        return {
          time_tag: row[0],
          density: +density.toFixed(2),   // protons/cm³
          speed: Math.round(speed),        // km/s
          temperature: isNaN(temp) ? null : Math.round(temp),
        };
      }
    }
    return null;
  } catch (e) {
    console.warn('[CosmicLive] solar wind plasma failed:', e.message);
    return null;
  }
}

// ─── Interplanetary Magnetic Field (Bz critical for aurora) ───
async function fetchSolarWindMag() {
  try {
    const data = await fetchJson('https://services.swpc.noaa.gov/products/solar-wind/mag-1-day.json');
    if (!Array.isArray(data) || data.length < 2) return null;
    // Headers: ["time_tag","bx_gsm","by_gsm","bz_gsm","lon_gsm","lat_gsm","bt"]
    for (let i = data.length - 1; i >= 1; i--) {
      const row = data[i];
      const bz = parseFloat(row[3]);
      const bt = parseFloat(row[6]);
      if (!isNaN(bz)) {
        return {
          time_tag: row[0],
          bz: +bz.toFixed(2),        // nT (negative = stronger aurora potential)
          bt: isNaN(bt) ? null : +bt.toFixed(2),
        };
      }
    }
    return null;
  } catch (e) {
    console.warn('[CosmicLive] solar wind mag failed:', e.message);
    return null;
  }
}

// ─── X-ray Flux (solar flare activity from GOES) ───
async function fetchXrayFlux() {
  try {
    const data = await fetchJson('https://services.swpc.noaa.gov/json/goes/primary/xrays-1-day.json');
    if (!Array.isArray(data) || data.length === 0) return null;
    // Entries: {time_tag, satellite, flux, observed_flux, energy: "0.1-0.8nm"}
    // We want the long-band (0.1-0.8 nm) latest reading.
    const long = data.filter(d => d.energy && d.energy.indexOf('0.1-0.8') !== -1);
    if (long.length === 0) return null;
    const latest = long[long.length - 1];
    const flux = latest.flux || latest.observed_flux;
    if (flux == null) return null;
    // Class: A < 1e-7, B 1e-7 to 1e-6, C 1e-6 to 1e-5, M 1e-5 to 1e-4, X ≥ 1e-4
    let cls = 'A', num = 0;
    if (flux >= 1e-4)      { cls = 'X'; num = flux / 1e-4; }
    else if (flux >= 1e-5) { cls = 'M'; num = flux / 1e-5; }
    else if (flux >= 1e-6) { cls = 'C'; num = flux / 1e-6; }
    else if (flux >= 1e-7) { cls = 'B'; num = flux / 1e-7; }
    else                   { cls = 'A'; num = flux / 1e-8; }
    return {
      time_tag: latest.time_tag,
      flux,
      class_letter: cls,
      class_number: +num.toFixed(1),
      class_label: cls + num.toFixed(1), // e.g. "C2.3"
    };
  } catch (e) {
    console.warn('[CosmicLive] x-ray failed:', e.message);
    return null;
  }
}

// ─── ISS Position (cheap, updates every few seconds) ───
async function fetchISS() {
  try {
    const data = await fetchJson('http://api.open-notify.org/iss-now.json', 3000);
    if (!data || !data.iss_position) return null;
    return {
      lat: +data.iss_position.latitude,
      lon: +data.iss_position.longitude,
      time_tag: new Date(data.timestamp * 1000).toISOString(),
    };
  } catch (e) {
    console.warn('[CosmicLive] ISS failed:', e.message);
    return null;
  }
}

// ─── Planet positions (local compute) ───
function computePlanets(date) {
  const planets = {};

  try {
    // Sun uses SunPosition() (geocentric apparent), not EclipticLongitude() which rejects the Sun body.
    const sunPos = Astro.SunPosition(date);
    const sunLon = sunPos.elon;
    planets.sun = {
      longitude: +sunLon.toFixed(2),
      sign: zodiacFromLongitude(sunLon),
      retrograde: false,
    };
  } catch (e) { console.warn('[CosmicLive] sun calc failed:', e.message); }

  try {
    const moonLon = Astro.EclipticLongitude(Astro.Body.Moon, date);
    const illum = Astro.Illumination(Astro.Body.Moon, date);
    // PairLongitude gives proper apparent elongation (handles light-time, aberration)
    // instead of the raw subtraction of EclipticLongitude outputs which diverges.
    const elongation = Astro.PairLongitude(Astro.Body.Moon, Astro.Body.Sun, date);
    let phase, name_ko, name_en, waxing;
    if (elongation < 22.5)        { phase = 'new';             name_ko = '신월';       name_en = 'New Moon';        waxing = true;  }
    else if (elongation < 67.5)   { phase = 'waxing_crescent'; name_ko = '초승달';     name_en = 'Waxing Crescent'; waxing = true;  }
    else if (elongation < 112.5)  { phase = 'first_quarter';   name_ko = '상현달';     name_en = 'First Quarter';   waxing = true;  }
    else if (elongation < 157.5)  { phase = 'waxing_gibbous';  name_ko = '차오르는 달'; name_en = 'Waxing Gibbous';  waxing = true;  }
    else if (elongation < 202.5)  { phase = 'full';            name_ko = '보름달';     name_en = 'Full Moon';       waxing = false; }
    else if (elongation < 247.5)  { phase = 'waning_gibbous';  name_ko = '기우는 달';   name_en = 'Waning Gibbous';  waxing = false; }
    else if (elongation < 292.5)  { phase = 'last_quarter';    name_ko = '하현달';     name_en = 'Last Quarter';    waxing = false; }
    else if (elongation < 337.5)  { phase = 'waning_crescent'; name_ko = '그믐달';     name_en = 'Waning Crescent'; waxing = false; }
    else                           { phase = 'new';            name_ko = '신월';       name_en = 'New Moon';        waxing = true;  }
    planets.moon = {
      longitude: +moonLon.toFixed(2),
      sign: zodiacFromLongitude(moonLon),
      phase, name_ko, name_en, waxing,
      illumination: Math.round(illum.phase_fraction * 100),
      elongation: +elongation.toFixed(1),
    };
  } catch (_) {}

  ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'].forEach(name => {
    try {
      const body = Astro.Body[name];
      const lon = Astro.EclipticLongitude(body, date);
      const retro = isRetrograde(body, date);
      // Heliocentric distance in AU (approximate — from vector)
      const vec = Astro.HelioVector(body, date);
      const dist = Math.sqrt(vec.x*vec.x + vec.y*vec.y + vec.z*vec.z);
      planets[name.toLowerCase()] = {
        longitude: +lon.toFixed(2),
        sign: zodiacFromLongitude(lon),
        retrograde: retro,
        distance_au: +dist.toFixed(3),
      };
    } catch (_) {}
  });

  return planets;
}

// ─── Earthquakes (USGS) ───
// Returns recent earthquakes M2.5+ from the last 24 hours.
async function fetchEarthquakes() {
  try {
    const data = await fetchJson('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson');
    if (!data || !Array.isArray(data.features)) return [];
    return data.features
      .map(f => {
        const g = f.geometry && f.geometry.coordinates;
        const p = f.properties || {};
        if (!g || g.length < 2 || p.mag == null) return null;
        return {
          id: f.id,
          lon: +g[0],
          lat: +g[1],
          depth_km: +(g[2] || 0),
          mag: +p.mag,
          place: p.place || '',
          time: p.time ? new Date(p.time).toISOString() : null,
          url: p.url || '',
        };
      })
      .filter(Boolean)
      // biggest/newest first for display priority
      .sort((a, b) => b.mag - a.mag)
      .slice(0, 80);
  } catch (e) {
    console.warn('[CosmicLive] earthquakes failed:', e.message);
    return [];
  }
}

// ─── Volcanoes (currently-active watchlist) ───
// Smithsonian GVP has no public JSON feed. Using a curated list of 25 volcanoes
// that are currently erupting or in "warning/advisory" status per GVP weekly
// reports (updated manually when needed).
function activeVolcanoes() {
  return [
    { name:'Kilauea',        country:'USA',          lat: 19.42, lon:-155.29 },
    { name:'Etna',           country:'Italy',        lat: 37.75, lon:  15.00 },
    { name:'Stromboli',      country:'Italy',        lat: 38.79, lon:  15.21 },
    { name:'Sakurajima',     country:'Japan',        lat: 31.58, lon: 130.66 },
    { name:'Suwanosejima',   country:'Japan',        lat: 29.53, lon: 129.71 },
    { name:'Popocatepetl',   country:'Mexico',       lat: 19.02, lon: -98.62 },
    { name:'Fuego',          country:'Guatemala',    lat: 14.47, lon: -90.88 },
    { name:'Santa Maria',    country:'Guatemala',    lat: 14.76, lon: -91.55 },
    { name:'Sangay',         country:'Ecuador',      lat: -2.01, lon: -78.33 },
    { name:'Reventador',     country:'Ecuador',      lat: -0.08, lon: -77.66 },
    { name:'Semeru',         country:'Indonesia',    lat: -8.11, lon: 112.92 },
    { name:'Merapi',         country:'Indonesia',    lat: -7.54, lon: 110.45 },
    { name:'Krakatau',       country:'Indonesia',    lat: -6.10, lon: 105.42 },
    { name:'Lewotobi',       country:'Indonesia',    lat: -8.53, lon: 122.78 },
    { name:'Ibu',            country:'Indonesia',    lat:  1.49, lon: 127.63 },
    { name:'Dukono',         country:'Indonesia',    lat:  1.69, lon: 127.88 },
    { name:'Shiveluch',      country:'Russia',       lat: 56.65, lon: 161.36 },
    { name:'Klyuchevskoy',   country:'Russia',       lat: 56.06, lon: 160.64 },
    { name:'Erebus',         country:'Antarctica',   lat:-77.53, lon: 167.15 },
    { name:'Nyamuragira',    country:'DR Congo',     lat: -1.41, lon:  29.20 },
    { name:'Nyiragongo',     country:'DR Congo',     lat: -1.52, lon:  29.25 },
    { name:'Cleveland',      country:'Alaska, USA',  lat: 52.82, lon:-169.95 },
    { name:'Great Sitkin',   country:'Alaska, USA',  lat: 52.08, lon:-176.13 },
    { name:'Whakaari',       country:'New Zealand',  lat:-37.52, lon: 177.18 },
    { name:'Villarrica',     country:'Chile',        lat:-39.42, lon: -71.93 },
  ];
}

// ─── Schumann resonance reference (no reliable live API) ───
// Public real-time numeric feeds are not freely available. We return the well-known
// base frequencies + a disclaimer that the UI can display.
function schumannReference() {
  return {
    base_hz: 7.83,
    harmonics_hz: [14.3, 20.8, 27.3, 33.8],
    note_ko: '슈만 공명의 기본 진동수는 7.83Hz이며, 실시간 스펙트럼 수치는 공개 API가 없어 기준값을 표시합니다.',
    note_en: 'Base Schumann resonance is 7.83Hz. Live spectrogram numeric feeds are not publicly available, so reference values are shown.',
  };
}

// ─── Cache (60s) ───
const CACHE_MS = 60 * 1000;
let cache = { at: 0, data: null };

export async function getCosmicLive() {
  const now = Date.now();
  if (cache.data && now - cache.at < CACHE_MS) return cache.data;

  const date = new Date();
  // Run all external fetches in parallel — each returns null on failure, nothing blocks the rest.
  const [kp, windPlasma, windMag, xray, iss, quakes] = await Promise.all([
    fetchKp(),
    fetchSolarWindPlasma(),
    fetchSolarWindMag(),
    fetchXrayFlux(),
    fetchISS(),
    fetchEarthquakes(),
  ]);

  const planets = computePlanets(date);

  const data = {
    timestamp: date.toISOString(),
    kp,
    solar_wind: windPlasma && windMag
      ? { ...windPlasma, ...windMag }
      : (windPlasma || windMag || null),
    xray,
    iss,
    planets,
    schumann: schumannReference(),
    aurora_image_url_north: 'https://services.swpc.noaa.gov/images/animations/ovation/north/latest.jpg',
    aurora_image_url_south: 'https://services.swpc.noaa.gov/images/animations/ovation/south/latest.jpg',
    earthquakes: quakes,
    volcanoes: activeVolcanoes(),
  };

  cache = { at: now, data };
  return data;
}
