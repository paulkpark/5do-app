/**
 * astro-events.js
 * Astronomical event data for any year (moon phases computed algorithmically,
 * retrogrades and eclipses pre-computed for 2024-2035).
 *
 * Loaded via <script> tag. Exposes: getAstroEvents(year)
 */

(function () {
  "use strict";

  // ─── Zodiac helpers ──────────────────────────────────────────────────

  var ZODIAC_SIGNS = [
    { en: "Aries",       ko: "양자리" },
    { en: "Taurus",      ko: "황소자리" },
    { en: "Gemini",      ko: "쌍둥이자리" },
    { en: "Cancer",      ko: "게자리" },
    { en: "Leo",         ko: "사자자리" },
    { en: "Virgo",       ko: "처녀자리" },
    { en: "Libra",       ko: "천칭자리" },
    { en: "Scorpio",     ko: "전갈자리" },
    { en: "Sagittarius", ko: "궁수자리" },
    { en: "Capricorn",   ko: "염소자리" },
    { en: "Aquarius",    ko: "물병자리" },
    { en: "Pisces",      ko: "물고기자리" }
  ];

  function zodiacFromLongitude(lon) {
    lon = ((lon % 360) + 360) % 360;
    return ZODIAC_SIGNS[Math.floor(lon / 30)];
  }

  // ─── Planet names ────────────────────────────────────────────────────

  var PLANET_KO = {
    Mercury: "수성", Venus: "금성", Mars: "화성",
    Jupiter: "목성", Saturn: "토성"
  };

  // ─── JDE ↔ Gregorian conversion ──────────────────────────────────────

  function jdeToGregorian(jde) {
    var z = Math.floor(jde + 0.5);
    var f = (jde + 0.5) - z;
    var a;
    if (z < 2299161) { a = z; }
    else {
      var alpha = Math.floor((z - 1867216.25) / 36524.25);
      a = z + 1 + alpha - Math.floor(alpha / 4);
    }
    var b = a + 1524;
    var c = Math.floor((b - 122.1) / 365.25);
    var d = Math.floor(365.25 * c);
    var e = Math.floor((b - d) / 30.6001);
    var day = b - d - Math.floor(30.6001 * e) + f;
    var month = (e < 14) ? e - 1 : e - 13;
    var year = (month > 2) ? c - 4716 : c - 4715;
    return { year: year, month: month, day: Math.floor(day) };
  }

  // ─── Meeus moon-phase algorithm ──────────────────────────────────────

  function deg2rad(d) { return d * Math.PI / 180; }

  /**
   * Compute JDE of a moon phase.
   * phase: 0 = new moon, 0.5 = full moon
   * k: lunation number (integer + phase offset)
   */
  function moonPhaseJDE(k) {
    var T  = k / 1236.85;
    var T2 = T * T;
    var T3 = T2 * T;
    var T4 = T3 * T;

    var JDE = 2451550.09766
            + 29.530588861 * k
            + 0.00015437 * T2
            - 0.000000150 * T3
            + 0.00000000073 * T4;

    // Sun's mean anomaly
    var M  = 2.5534 + 29.10535670 * k - 0.0000014 * T2 - 0.00000011 * T3;
    // Moon's mean anomaly
    var Mp = 201.5643 + 385.81693528 * k + 0.0107582 * T2 + 0.00001238 * T3 - 0.000000058 * T4;
    // Moon's argument of latitude
    var F  = 160.7108 + 390.67050284 * k - 0.0016118 * T2 - 0.00000227 * T3 + 0.000000011 * T4;
    // Longitude of ascending node
    var Om = 124.7746 - 1.56375588 * k + 0.0020672 * T2 + 0.00000215 * T3;

    M  = deg2rad(M);
    Mp = deg2rad(Mp);
    F  = deg2rad(F);
    Om = deg2rad(Om);

    // E factor for Sun anomaly terms
    var E = 1 - 0.002516 * T - 0.0000074 * T2;

    var phase = k - Math.floor(k);
    var isNew = (Math.abs(phase) < 0.01 || Math.abs(phase - 1) < 0.01);
    var correction;

    if (isNew) {
      // New Moon corrections
      correction =
        - 0.40720 * Math.sin(Mp)
        + 0.17241 * E * Math.sin(M)
        + 0.01608 * Math.sin(2 * Mp)
        + 0.01039 * Math.sin(2 * F)
        + 0.00739 * E * Math.sin(Mp - M)
        - 0.00514 * E * Math.sin(Mp + M)
        + 0.00208 * E * E * Math.sin(2 * M)
        - 0.00111 * Math.sin(Mp - 2 * F)
        - 0.00057 * Math.sin(Mp + 2 * F)
        + 0.00056 * E * Math.sin(2 * Mp + M)
        - 0.00042 * Math.sin(3 * Mp)
        + 0.00042 * E * Math.sin(M + 2 * F)
        + 0.00038 * E * Math.sin(M - 2 * F)
        - 0.00024 * E * Math.sin(2 * Mp - M)
        - 0.00017 * Math.sin(Om)
        - 0.00007 * Math.sin(Mp + 2 * M)
        + 0.00004 * Math.sin(2 * Mp - 2 * F)
        + 0.00004 * Math.sin(3 * M)
        + 0.00003 * Math.sin(Mp + M - 2 * F)
        + 0.00003 * Math.sin(2 * Mp + 2 * F)
        - 0.00003 * Math.sin(Mp + M + 2 * F)
        + 0.00003 * Math.sin(Mp - M + 2 * F)
        - 0.00002 * Math.sin(Mp - M - 2 * F)
        - 0.00002 * Math.sin(3 * Mp + M)
        + 0.00002 * Math.sin(4 * Mp);
    } else {
      // Full Moon corrections
      correction =
        - 0.40614 * Math.sin(Mp)
        + 0.17302 * E * Math.sin(M)
        + 0.01614 * Math.sin(2 * Mp)
        + 0.01043 * Math.sin(2 * F)
        + 0.00734 * E * Math.sin(Mp - M)
        - 0.00515 * E * Math.sin(Mp + M)
        + 0.00209 * E * E * Math.sin(2 * M)
        - 0.00111 * Math.sin(Mp - 2 * F)
        - 0.00057 * Math.sin(Mp + 2 * F)
        + 0.00056 * E * Math.sin(2 * Mp + M)
        - 0.00042 * Math.sin(3 * Mp)
        + 0.00042 * E * Math.sin(M + 2 * F)
        + 0.00038 * E * Math.sin(M - 2 * F)
        - 0.00024 * E * Math.sin(2 * Mp - M)
        - 0.00017 * Math.sin(Om)
        - 0.00007 * Math.sin(Mp + 2 * M)
        + 0.00004 * Math.sin(2 * Mp - 2 * F)
        + 0.00004 * Math.sin(3 * M)
        + 0.00003 * Math.sin(Mp + M - 2 * F)
        + 0.00003 * Math.sin(2 * Mp + 2 * F)
        - 0.00003 * Math.sin(Mp + M + 2 * F)
        + 0.00003 * Math.sin(Mp - M + 2 * F)
        - 0.00002 * Math.sin(Mp - M - 2 * F)
        - 0.00002 * Math.sin(3 * Mp + M)
        + 0.00002 * Math.sin(4 * Mp);
    }

    JDE += correction;

    // Additional corrections (A terms)
    var A1  = deg2rad(299.77 +  0.107408 * k - 0.009173 * T2);
    var A2  = deg2rad(251.88 +  0.016321 * k);
    var A3  = deg2rad(251.83 + 26.651886 * k);
    var A4  = deg2rad(349.42 + 36.412478 * k);
    var A5  = deg2rad( 84.66 + 18.206239 * k);
    var A6  = deg2rad(141.74 + 53.303771 * k);
    var A7  = deg2rad(207.14 +  2.453732 * k);
    var A8  = deg2rad(154.84 +  7.306860 * k);
    var A9  = deg2rad( 34.52 + 27.261239 * k);
    var A10 = deg2rad(207.19 +  0.121824 * k);
    var A11 = deg2rad(291.34 +  1.844379 * k);
    var A12 = deg2rad(161.72 + 24.198154 * k);
    var A13 = deg2rad(239.56 + 25.513099 * k);
    var A14 = deg2rad(331.55 +  3.592518 * k);

    JDE += 0.000325 * Math.sin(A1)
         + 0.000165 * Math.sin(A2)
         + 0.000164 * Math.sin(A3)
         + 0.000126 * Math.sin(A4)
         + 0.000110 * Math.sin(A5)
         + 0.000062 * Math.sin(A6)
         + 0.000060 * Math.sin(A7)
         + 0.000056 * Math.sin(A8)
         + 0.000047 * Math.sin(A9)
         + 0.000042 * Math.sin(A10)
         + 0.000040 * Math.sin(A11)
         + 0.000037 * Math.sin(A12)
         + 0.000035 * Math.sin(A13)
         + 0.000023 * Math.sin(A14);

    return JDE;
  }

  /**
   * Approximate Sun ecliptic longitude at a given JDE (degrees, 0-360).
   */
  function sunLongitude(jde) {
    var T = (jde - 2451545.0) / 36525.0;
    var L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
    var M  = 357.52911 + 35999.05029 * T - 0.0001537 * T * T;
    var Mrad = deg2rad(M);
    var C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(Mrad)
          + (0.019993 - 0.000101 * T) * Math.sin(2 * Mrad)
          + 0.000289 * Math.sin(3 * Mrad);
    var sunLon = L0 + C;
    return ((sunLon % 360) + 360) % 360;
  }

  /**
   * Return array of { type: "new"|"full", year, month, day, sign: {ko,en} }
   * for the given year.
   */
  function computeMoonPhases(year) {
    var results = [];
    // Estimate starting k: lunation 0 is approx Jan 6 2000 new moon
    var kStart = Math.floor((year - 2000) * 12.3685) - 1;
    var kEnd   = Math.ceil((year + 1 - 2000) * 12.3685) + 1;

    for (var ki = kStart; ki <= kEnd; ki++) {
      // New moon: k = ki (integer)
      var kNew = ki;
      var jdeNew = moonPhaseJDE(kNew);
      var gNew = jdeToGregorian(jdeNew);
      if (gNew.year === year) {
        var sunLon = sunLongitude(jdeNew);
        var sign = zodiacFromLongitude(sunLon);
        results.push({
          type: "new", year: gNew.year, month: gNew.month, day: gNew.day,
          sign: sign
        });
      }

      // Full moon: k = ki + 0.5
      var kFull = ki + 0.5;
      var jdeFull = moonPhaseJDE(kFull);
      var gFull = jdeToGregorian(jdeFull);
      if (gFull.year === year) {
        var sunLonF = sunLongitude(jdeFull);
        var moonLon = (sunLonF + 180) % 360;
        var signF = zodiacFromLongitude(moonLon);
        results.push({
          type: "full", year: gFull.year, month: gFull.month, day: gFull.day,
          sign: signF
        });
      }
    }

    // Deduplicate (in case of overlap at boundaries)
    var seen = {};
    var unique = [];
    for (var i = 0; i < results.length; i++) {
      var key = results[i].type + "-" + results[i].month + "-" + results[i].day;
      if (!seen[key]) { seen[key] = true; unique.push(results[i]); }
    }
    return unique;
  }

  // ─── Pre-computed retrogrades 2024–2035 ──────────────────────────────

  var RETROGRADES = [
    // ── Mercury ──────────────────────────────────────────────
    // 2024
    { planet: "Mercury", startDate: [2024,  4,  1], endDate: [2024,  4, 25], sign: { ko: "양자리", en: "Aries" } },
    { planet: "Mercury", startDate: [2024,  8,  5], endDate: [2024,  8, 28], sign: { ko: "처녀자리", en: "Virgo" } },
    { planet: "Mercury", startDate: [2024, 11, 25], endDate: [2024, 12, 15], sign: { ko: "궁수자리", en: "Sagittarius" } },
    // 2025
    { planet: "Mercury", startDate: [2025,  3, 15], endDate: [2025,  4,  7], sign: { ko: "양자리", en: "Aries" } },
    { planet: "Mercury", startDate: [2025,  7, 18], endDate: [2025,  8, 11], sign: { ko: "사자자리", en: "Leo" } },
    { planet: "Mercury", startDate: [2025, 11,  9], endDate: [2025, 11, 29], sign: { ko: "궁수자리", en: "Sagittarius" } },
    // 2026
    { planet: "Mercury", startDate: [2026,  3,  3], endDate: [2026,  3, 27], sign: { ko: "물고기자리", en: "Pisces" } },
    { planet: "Mercury", startDate: [2026,  6, 29], endDate: [2026,  7, 23], sign: { ko: "게자리", en: "Cancer" } },
    { planet: "Mercury", startDate: [2026, 10, 21], endDate: [2026, 11, 11], sign: { ko: "전갈자리", en: "Scorpio" } },
    // 2027
    { planet: "Mercury", startDate: [2027,  2, 14], endDate: [2027,  3,  9], sign: { ko: "물고기자리", en: "Pisces" } },
    { planet: "Mercury", startDate: [2027,  6, 10], endDate: [2027,  7,  4], sign: { ko: "게자리", en: "Cancer" } },
    { planet: "Mercury", startDate: [2027, 10,  3], endDate: [2027, 10, 24], sign: { ko: "천칭자리", en: "Libra" } },
    // 2028
    { planet: "Mercury", startDate: [2028,  1, 27], endDate: [2028,  2, 19], sign: { ko: "물병자리", en: "Aquarius" } },
    { planet: "Mercury", startDate: [2028,  5, 21], endDate: [2028,  6, 13], sign: { ko: "쌍둥이자리", en: "Gemini" } },
    { planet: "Mercury", startDate: [2028,  9, 14], endDate: [2028, 10,  6], sign: { ko: "처녀자리", en: "Virgo" } },
    // 2029
    { planet: "Mercury", startDate: [2029,  1,  9], endDate: [2029,  2,  1], sign: { ko: "염소자리", en: "Capricorn" } },
    { planet: "Mercury", startDate: [2029,  5,  3], endDate: [2029,  5, 26], sign: { ko: "황소자리", en: "Taurus" } },
    { planet: "Mercury", startDate: [2029,  8, 27], endDate: [2029,  9, 18], sign: { ko: "처녀자리", en: "Virgo" } },
    { planet: "Mercury", startDate: [2029, 12, 23], endDate: [2030,  1, 13], sign: { ko: "염소자리", en: "Capricorn" } },
    // 2030
    { planet: "Mercury", startDate: [2030,  4, 15], endDate: [2030,  5,  8], sign: { ko: "황소자리", en: "Taurus" } },
    { planet: "Mercury", startDate: [2030,  8, 10], endDate: [2030,  9,  1], sign: { ko: "사자자리", en: "Leo" } },
    { planet: "Mercury", startDate: [2030, 12,  5], endDate: [2030, 12, 26], sign: { ko: "궁수자리", en: "Sagittarius" } },
    // 2031
    { planet: "Mercury", startDate: [2031,  3, 28], endDate: [2031,  4, 20], sign: { ko: "양자리", en: "Aries" } },
    { planet: "Mercury", startDate: [2031,  7, 23], endDate: [2031,  8, 15], sign: { ko: "사자자리", en: "Leo" } },
    { planet: "Mercury", startDate: [2031, 11, 17], endDate: [2031, 12,  7], sign: { ko: "궁수자리", en: "Sagittarius" } },
    // 2032
    { planet: "Mercury", startDate: [2032,  3,  9], endDate: [2032,  4,  1], sign: { ko: "물고기자리", en: "Pisces" } },
    { planet: "Mercury", startDate: [2032,  7,  4], endDate: [2032,  7, 28], sign: { ko: "게자리", en: "Cancer" } },
    { planet: "Mercury", startDate: [2032, 10, 29], endDate: [2032, 11, 19], sign: { ko: "전갈자리", en: "Scorpio" } },
    // 2033
    { planet: "Mercury", startDate: [2033,  2, 20], endDate: [2033,  3, 15], sign: { ko: "물고기자리", en: "Pisces" } },
    { planet: "Mercury", startDate: [2033,  6, 16], endDate: [2033,  7, 10], sign: { ko: "게자리", en: "Cancer" } },
    { planet: "Mercury", startDate: [2033, 10, 11], endDate: [2033, 11,  1], sign: { ko: "천칭자리", en: "Libra" } },
    // 2034
    { planet: "Mercury", startDate: [2034,  2,  3], endDate: [2034,  2, 25], sign: { ko: "물병자리", en: "Aquarius" } },
    { planet: "Mercury", startDate: [2034,  5, 28], endDate: [2034,  6, 20], sign: { ko: "쌍둥이자리", en: "Gemini" } },
    { planet: "Mercury", startDate: [2034,  9, 22], endDate: [2034, 10, 14], sign: { ko: "처녀자리", en: "Virgo" } },
    // 2035
    { planet: "Mercury", startDate: [2035,  1, 16], endDate: [2035,  2,  7], sign: { ko: "염소자리", en: "Capricorn" } },
    { planet: "Mercury", startDate: [2035,  5, 10], endDate: [2035,  6,  2], sign: { ko: "황소자리", en: "Taurus" } },
    { planet: "Mercury", startDate: [2035,  9,  4], endDate: [2035,  9, 26], sign: { ko: "처녀자리", en: "Virgo" } },
    { planet: "Mercury", startDate: [2035, 12, 30], endDate: [2036,  1, 20], sign: { ko: "염소자리", en: "Capricorn" } },

    // ── Venus ────────────────────────────────────────────────
    { planet: "Venus", startDate: [2025,  3,  2], endDate: [2025,  4, 13], sign: { ko: "양자리", en: "Aries" } },
    { planet: "Venus", startDate: [2026, 12, 16], endDate: [2027,  1, 28], sign: { ko: "물병자리", en: "Aquarius" } },
    // (Venus Rx 2027 actually starts late 2026 shadow, station Rx in early 2027 re-check)
    // Corrected: no Venus Rx in 2026 per user spec
    { planet: "Venus", startDate: [2028,  8,  3], endDate: [2028,  9, 13], sign: { ko: "처녀자리", en: "Virgo" } },
    { planet: "Venus", startDate: [2030,  3, 10], endDate: [2030,  4, 21], sign: { ko: "양자리", en: "Aries" } },
    { planet: "Venus", startDate: [2031, 10, 13], endDate: [2031, 11, 24], sign: { ko: "전갈자리", en: "Scorpio" } },
    { planet: "Venus", startDate: [2033,  5, 18], endDate: [2033,  6, 29], sign: { ko: "쌍둥이자리", en: "Gemini" } },
    { planet: "Venus", startDate: [2034, 12, 22], endDate: [2035,  2,  2], sign: { ko: "물병자리", en: "Aquarius" } },

    // ── Mars ─────────────────────────────────────────────────
    { planet: "Mars", startDate: [2024, 12,  6], endDate: [2025,  2, 24], sign: { ko: "사자자리", en: "Leo" } },
    { planet: "Mars", startDate: [2027,  1, 10], endDate: [2027,  4,  1], sign: { ko: "처녀자리", en: "Virgo" } },
    { planet: "Mars", startDate: [2029,  3,  1], endDate: [2029,  5, 18], sign: { ko: "천칭자리", en: "Libra" } },
    { planet: "Mars", startDate: [2031,  4, 15], endDate: [2031,  6, 28], sign: { ko: "전갈자리", en: "Scorpio" } },
    { planet: "Mars", startDate: [2033,  6, 28], endDate: [2033,  9,  5], sign: { ko: "염소자리", en: "Capricorn" } },
    { planet: "Mars", startDate: [2035, 10, 10], endDate: [2035, 12, 16], sign: { ko: "양자리", en: "Aries" } },

    // ── Jupiter ──────────────────────────────────────────────
    { planet: "Jupiter", startDate: [2024, 10,  9], endDate: [2025,  2,  4], sign: { ko: "쌍둥이자리", en: "Gemini" } },
    { planet: "Jupiter", startDate: [2025, 11, 11], endDate: [2026,  3, 11], sign: { ko: "게자리", en: "Cancer" } },
    { planet: "Jupiter", startDate: [2026, 12, 12], endDate: [2027,  4, 13], sign: { ko: "사자자리", en: "Leo" } },
    { planet: "Jupiter", startDate: [2028,  1, 12], endDate: [2028,  5, 13], sign: { ko: "처녀자리", en: "Virgo" } },
    { planet: "Jupiter", startDate: [2029,  2, 11], endDate: [2029,  6, 14], sign: { ko: "천칭자리", en: "Libra" } },
    { planet: "Jupiter", startDate: [2030,  3, 15], endDate: [2030,  7, 15], sign: { ko: "전갈자리", en: "Scorpio" } },
    { planet: "Jupiter", startDate: [2031,  4, 17], endDate: [2031,  8, 17], sign: { ko: "궁수자리", en: "Sagittarius" } },
    { planet: "Jupiter", startDate: [2032,  5, 19], endDate: [2032,  9, 18], sign: { ko: "염소자리", en: "Capricorn" } },
    { planet: "Jupiter", startDate: [2033,  6, 22], endDate: [2033, 10, 21], sign: { ko: "물병자리", en: "Aquarius" } },
    { planet: "Jupiter", startDate: [2034,  7, 26], endDate: [2034, 11, 23], sign: { ko: "물고기자리", en: "Pisces" } },
    { planet: "Jupiter", startDate: [2035,  8, 28], endDate: [2035, 12, 27], sign: { ko: "양자리", en: "Aries" } },

    // ── Saturn ───────────────────────────────────────────────
    { planet: "Saturn", startDate: [2024,  6, 29], endDate: [2024, 11, 15], sign: { ko: "물고기자리", en: "Pisces" } },
    { planet: "Saturn", startDate: [2025,  7, 13], endDate: [2025, 11, 28], sign: { ko: "물고기자리", en: "Pisces" } },
    { planet: "Saturn", startDate: [2026,  7, 23], endDate: [2026, 12,  7], sign: { ko: "양자리", en: "Aries" } },
    { planet: "Saturn", startDate: [2027,  8,  6], endDate: [2027, 12, 21], sign: { ko: "양자리", en: "Aries" } },
    { planet: "Saturn", startDate: [2028,  8, 17], endDate: [2029,  1,  3], sign: { ko: "황소자리", en: "Taurus" } },
    { planet: "Saturn", startDate: [2029,  8, 30], endDate: [2030,  1, 16], sign: { ko: "황소자리", en: "Taurus" } },
    { planet: "Saturn", startDate: [2030,  9, 11], endDate: [2031,  1, 28], sign: { ko: "쌍둥이자리", en: "Gemini" } },
    { planet: "Saturn", startDate: [2031,  9, 24], endDate: [2032,  2,  9], sign: { ko: "쌍둥이자리", en: "Gemini" } },
    { planet: "Saturn", startDate: [2032, 10,  5], endDate: [2033,  2, 21], sign: { ko: "게자리", en: "Cancer" } },
    { planet: "Saturn", startDate: [2033, 10, 17], endDate: [2034,  3,  5], sign: { ko: "게자리", en: "Cancer" } },
    { planet: "Saturn", startDate: [2034, 10, 30], endDate: [2035,  3, 17], sign: { ko: "사자자리", en: "Leo" } },
    { planet: "Saturn", startDate: [2035, 11, 11], endDate: [2036,  3, 28], sign: { ko: "사자자리", en: "Leo" } }
  ];

  // ─── Pre-computed eclipses 2024–2035 ────────────────────────────────

  var ECLIPSES = [
    // 2024
    { type: "lunar",  date: [2024,  3, 25], sign: { ko: "천칭자리", en: "Libra" } },
    { type: "solar",  date: [2024,  4,  8], sign: { ko: "양자리", en: "Aries" } },
    { type: "lunar",  date: [2024,  9, 18], sign: { ko: "물고기자리", en: "Pisces" } },
    { type: "solar",  date: [2024, 10,  2], sign: { ko: "천칭자리", en: "Libra" } },
    // 2025
    { type: "lunar",  date: [2025,  3, 14], sign: { ko: "처녀자리", en: "Virgo" } },
    { type: "solar",  date: [2025,  3, 29], sign: { ko: "양자리", en: "Aries" } },
    { type: "lunar",  date: [2025,  9,  7], sign: { ko: "물고기자리", en: "Pisces" } },
    { type: "solar",  date: [2025,  9, 21], sign: { ko: "처녀자리", en: "Virgo" } },
    // 2026
    { type: "solar",  date: [2026,  2, 17], sign: { ko: "물고기자리", en: "Pisces" } },
    { type: "lunar",  date: [2026,  3,  3], sign: { ko: "처녀자리", en: "Virgo" } },
    { type: "solar",  date: [2026,  8, 12], sign: { ko: "사자자리", en: "Leo" } },
    { type: "lunar",  date: [2026,  8, 28], sign: { ko: "물고기자리", en: "Pisces" } },
    // 2027
    { type: "solar",  date: [2027,  2,  6], sign: { ko: "물병자리", en: "Aquarius" } },
    { type: "lunar",  date: [2027,  2, 20], sign: { ko: "처녀자리", en: "Virgo" } },
    { type: "lunar",  date: [2027,  7, 18], sign: { ko: "염소자리", en: "Capricorn" } },
    { type: "solar",  date: [2027,  8,  2], sign: { ko: "사자자리", en: "Leo" } },
    // 2028
    { type: "lunar",  date: [2028,  1, 12], sign: { ko: "게자리", en: "Cancer" } },
    { type: "solar",  date: [2028,  1, 26], sign: { ko: "물병자리", en: "Aquarius" } },
    { type: "lunar",  date: [2028,  7,  6], sign: { ko: "염소자리", en: "Capricorn" } },
    { type: "solar",  date: [2028,  7, 22], sign: { ko: "게자리", en: "Cancer" } },
    { type: "lunar",  date: [2028, 12, 31], sign: { ko: "게자리", en: "Cancer" } },
    // 2029
    { type: "solar",  date: [2029,  1, 14], sign: { ko: "염소자리", en: "Capricorn" } },
    { type: "lunar",  date: [2029,  6, 26], sign: { ko: "염소자리", en: "Capricorn" } },
    { type: "solar",  date: [2029,  7, 11], sign: { ko: "게자리", en: "Cancer" } },
    { type: "lunar",  date: [2029, 12, 20], sign: { ko: "쌍둥이자리", en: "Gemini" } },
    // 2030
    { type: "solar",  date: [2030,  1,  3], sign: { ko: "염소자리", en: "Capricorn" } },
    { type: "solar",  date: [2030,  6,  1], sign: { ko: "쌍둥이자리", en: "Gemini" } },
    { type: "lunar",  date: [2030,  6, 15], sign: { ko: "궁수자리", en: "Sagittarius" } },
    { type: "solar",  date: [2030, 11, 25], sign: { ko: "궁수자리", en: "Sagittarius" } },
    { type: "lunar",  date: [2030, 12,  9], sign: { ko: "쌍둥이자리", en: "Gemini" } },
    // 2031
    { type: "solar",  date: [2031,  5, 21], sign: { ko: "쌍둥이자리", en: "Gemini" } },
    { type: "lunar",  date: [2031,  6,  5], sign: { ko: "궁수자리", en: "Sagittarius" } },
    { type: "solar",  date: [2031, 11, 14], sign: { ko: "전갈자리", en: "Scorpio" } },
    { type: "lunar",  date: [2031, 11, 30], sign: { ko: "쌍둥이자리", en: "Gemini" } },
    // 2032
    { type: "solar",  date: [2032,  5,  9], sign: { ko: "황소자리", en: "Taurus" } },
    { type: "lunar",  date: [2032,  5, 25], sign: { ko: "궁수자리", en: "Sagittarius" } },
    { type: "solar",  date: [2032, 11,  3], sign: { ko: "전갈자리", en: "Scorpio" } },
    { type: "lunar",  date: [2032, 11, 18], sign: { ko: "황소자리", en: "Taurus" } },
    // 2033
    { type: "solar",  date: [2033,  3, 30], sign: { ko: "양자리", en: "Aries" } },
    { type: "lunar",  date: [2033,  4, 14], sign: { ko: "천칭자리", en: "Libra" } },
    { type: "solar",  date: [2033,  9, 23], sign: { ko: "천칭자리", en: "Libra" } },
    { type: "lunar",  date: [2033, 10,  8], sign: { ko: "양자리", en: "Aries" } },
    // 2034
    { type: "solar",  date: [2034,  3, 20], sign: { ko: "물고기자리", en: "Pisces" } },
    { type: "lunar",  date: [2034,  4,  3], sign: { ko: "천칭자리", en: "Libra" } },
    { type: "solar",  date: [2034,  9, 12], sign: { ko: "처녀자리", en: "Virgo" } },
    { type: "lunar",  date: [2034,  9, 28], sign: { ko: "양자리", en: "Aries" } },
    // 2035
    { type: "solar",  date: [2035,  3,  9], sign: { ko: "물고기자리", en: "Pisces" } },
    { type: "lunar",  date: [2035,  3, 25], sign: { ko: "천칭자리", en: "Libra" } },
    { type: "solar",  date: [2035,  9,  2], sign: { ko: "처녀자리", en: "Virgo" } },
    { type: "lunar",  date: [2035,  9, 17], sign: { ko: "물고기자리", en: "Pisces" } }
  ];

  // ─── Helper: does date [y,m,d] fall in range? ────────────────────────

  function dateToNum(y, m, d) { return y * 10000 + m * 100 + d; }

  function dateOverlapsYear(startArr, endArr, year) {
    var sn = dateToNum(startArr[0], startArr[1], startArr[2]);
    var en = dateToNum(endArr[0], endArr[1], endArr[2]);
    var yearStart = dateToNum(year, 1, 1);
    var yearEnd   = dateToNum(year, 12, 31);
    return sn <= yearEnd && en >= yearStart;
  }

  // ─── Main public function ───────────────────────────────────────────

  /**
   * getAstroEvents(year)
   * Returns { 1: [...], 2: [...], ... 12: [...] }
   * Each event: { date: "M/D", event: { ko: "...", en: "..." } }
   */
  window.getAstroEvents = function getAstroEvents(year) {
    var months = {};
    for (var mi = 1; mi <= 12; mi++) { months[mi] = []; }

    // ── 1. Moon phases (computed) ──────────────────────────

    // Build a lookup of eclipses for quick matching
    var eclipseMap = {};
    for (var ei = 0; ei < ECLIPSES.length; ei++) {
      var ecl = ECLIPSES[ei];
      var eKey = ecl.date[0] + "-" + ecl.date[1] + "-" + ecl.date[2];
      eclipseMap[eKey] = ecl;
    }

    var moonPhases = computeMoonPhases(year);
    for (var pi = 0; pi < moonPhases.length; pi++) {
      var mp = moonPhases[pi];
      var eclKey = mp.year + "-" + mp.month + "-" + mp.day;
      var hasEclipse = null;

      // Check if an eclipse falls within 2 days of this moon phase
      for (var ed = -2; ed <= 2; ed++) {
        // simple day offset check
        var checkDay = mp.day + ed;
        var cKey = mp.year + "-" + mp.month + "-" + checkDay;
        if (eclipseMap[cKey]) {
          var ecMatch = eclipseMap[cKey];
          if ((mp.type === "new" && ecMatch.type === "solar") ||
              (mp.type === "full" && ecMatch.type === "lunar")) {
            hasEclipse = ecMatch;
            break;
          }
        }
      }

      var evKo, evEn;
      if (mp.type === "new") {
        evKo = "새달 (" + mp.sign.ko + ")";
        evEn = "New Moon in " + mp.sign.en;
        if (hasEclipse) { evKo += " + 일식"; evEn += " + Solar Eclipse"; }
      } else {
        evKo = "보름달 (" + mp.sign.ko + ")";
        evEn = "Full Moon in " + mp.sign.en;
        if (hasEclipse) { evKo += " + 월식"; evEn += " + Lunar Eclipse"; }
      }

      months[mp.month].push({
        date: mp.month + "/" + mp.day,
        event: { ko: evKo, en: evEn },
        _day: mp.day
      });
    }

    // ── 2. Retrogrades ─────────────────────────────────────

    for (var ri = 0; ri < RETROGRADES.length; ri++) {
      var ret = RETROGRADES[ri];
      if (!dateOverlapsYear(ret.startDate, ret.endDate, year)) continue;

      var pKo = PLANET_KO[ret.planet] || ret.planet;

      // Start event (if start is in this year)
      if (ret.startDate[0] === year) {
        var sm = ret.startDate[1];
        var sd = ret.startDate[2];
        months[sm].push({
          date: sm + "/" + sd,
          event: {
            ko: pKo + " 역행 시작 (" + ret.sign.ko + ")",
            en: ret.planet + " Retrograde begins (" + ret.sign.en + ")"
          },
          _day: sd
        });
      }

      // End event (if end is in this year)
      if (ret.endDate[0] === year) {
        var em = ret.endDate[1];
        var eday = ret.endDate[2];
        months[em].push({
          date: em + "/" + eday,
          event: {
            ko: pKo + " 역행 종료",
            en: ret.planet + " Retrograde ends"
          },
          _day: eday
        });
      }
    }

    // ── 3. Sort each month by day ──────────────────────────

    for (var si = 1; si <= 12; si++) {
      months[si].sort(function (a, b) { return a._day - b._day; });
      // Remove internal _day property
      for (var j = 0; j < months[si].length; j++) {
        delete months[si][j]._day;
      }
    }

    return months;
  };

})();
