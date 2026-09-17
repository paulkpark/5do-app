/* ── Geocoders ───────────────────────────────────────────────────────────
   A geocoder is `async (query, lang) => [{ name, region, lat, lon }]`.
   Pass one to mount() as `geocode`. Without it the UI falls back to the
   built-in place list plus manual coordinate entry.
   ─────────────────────────────────────────────────────────────────────── */

/* Open-Meteo geocoding (GeoNames data, no API key).
   Accepts "Greenville, NC" — a comma plus a country or first-level admin
   area narrows the result set, which is exactly what disambiguates the
   thirty-odd Greenvilles in the United States.

   LICENCE: free for non-commercial use. 5do.app is a paid product, so use
   Open-Meteo's commercial plan, self-host their open-source geocoding
   binary, or swap in another provider before shipping. Set `endpoint` to
   your own proxy to keep the call same-origin and cacheable. */
export function openMeteoGeocoder(opts = {}) {
  const endpoint = opts.endpoint || 'https://geocoding-api.open-meteo.com/v1/search';
  return async function (query, lang) {
    const url = `${endpoint}?name=${encodeURIComponent(query)}&count=8&language=${lang === 'ko' ? 'ko' : 'en'}&format=json`;
    const res = await fetch(url, { signal: opts.signal });
    if (!res.ok) throw new Error('geocoder ' + res.status);
    const data = await res.json();
    return (data.results || []).map(r => ({
      name: r.name,
      region: [r.admin1, r.country].filter(Boolean).join(', '),
      lat: r.latitude,
      lon: r.longitude
    }));
  };
}

/* Claude-backed geocoder, for environments where outbound fetch is blocked
   (the claude.ai artifact sandbox). City-level accuracy is ample here: a
   0.05° longitude error moves the Ascendant by roughly 12 arc-seconds.
   `getSample` returns the sample capability, or null while it is loading. */
export function claudeGeocoder(getSample) {
  return async function (query, lang) {
    const sample = getSample();
    if (!sample || !sample.json) return [];
    const prompt =
      `Return the geographic coordinates of places matching this search: "${query}"\n\n` +
      `Rules:\n` +
      `- Up to 5 matches, most likely first. If the query names a place unambiguously, return one.\n` +
      `- A comma-qualified query ("Greenville, NC") means the place in that state or country only.\n` +
      `- "name" and "region" must be written in ${lang === 'ko' ? 'Korean' : 'English'}. "region" is the state or province plus the country.\n` +
      `- Coordinates are the city or town centre, in decimal degrees. South and west are negative.\n` +
      `- If nothing plausibly matches, return an empty array.\n\n` +
      `Reply with JSON only, no prose and no code fence:\n` +
      `[{"name":"...","region":"...","lat":0.0,"lon":0.0}]`;
    const out = await sample.json(prompt, { modelTier: 'quick', cache: true });
    const arr = Array.isArray(out) ? out : (out && Array.isArray(out.results) ? out.results : []);
    return arr
      .filter(r => r && typeof r.lat === 'number' && typeof r.lon === 'number' &&
        Math.abs(r.lat) <= 90 && Math.abs(r.lon) <= 180)
      .slice(0, 5)
      .map(r => ({ name: String(r.name || query), region: String(r.region || ''), lat: r.lat, lon: r.lon }));
  };
}

/* Tries each geocoder in turn until one returns results. */
export function chainGeocoders(...geocoders) {
  return async function (query, lang) {
    for (const g of geocoders) {
      if (!g) continue;
      try {
        const r = await g(query, lang);
        if (r && r.length) return r;
      } catch (e) { /* try the next one */ }
    }
    return [];
  };
}
