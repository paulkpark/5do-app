// =============================================================================
// 만세력 데이터 모듈 - Accurate Saju (Four Pillars) Calculation Engine
// Based on astronomical solar term calculations (Meeus algorithm) and
// verified against Korean 만세력 references.
//
// Replaces the simplified calcSaju() in index.html with accurate:
//   1. Solar term (절기) based month boundaries
//   2. Julian Day Number based day pillar calculation
//   3. Correct month-element mapping from 월지 (monthly earthly branch)
//   4. Year pillar boundary at 입춘 (not Jan 1)
// =============================================================================

// -----------------------------------------------------------------------------
// 1. Solar term entry dates (절입일) for saju month boundaries, 1940-2060
//    Each entry: [month, day] in KST for the 12 절입일 that start each saju month
//    Index 0 = 입춘 (Month 1, 寅월, ~Feb 4)
//    Index 1 = 경칩 (Month 2, 卯월, ~Mar 6)
//    Index 2 = 청명 (Month 3, 辰월, ~Apr 5)
//    Index 3 = 입하 (Month 4, 巳월, ~May 6)
//    Index 4 = 망종 (Month 5, 午월, ~Jun 6)
//    Index 5 = 소서 (Month 6, 未월, ~Jul 7)
//    Index 6 = 입추 (Month 7, 申월, ~Aug 7)
//    Index 7 = 백로 (Month 8, 酉월, ~Sep 8)
//    Index 8 = 한로 (Month 9, 戌월, ~Oct 8)
//    Index 9 = 입동 (Month 10, 亥월, ~Nov 7)
//    Index 10 = 대설 (Month 11, 子월, ~Dec 7)
//    Index 11 = 소한 (Month 12, 丑월, ~Jan 6 of NEXT year)
//
//    Computed using Jean Meeus' solar longitude algorithm with KST (UTC+9).
//    Borderline dates (where the solar term falls near midnight KST) have been
//    manually verified and corrected against published 만세력 for 2020-2030.
// -----------------------------------------------------------------------------
const SOLAR_TERMS = {
  1940: [[2,5],[3,6],[4,5],[5,6],[6,6],[7,7],[8,8],[9,8],[10,9],[11,8],[12,8],[1,6]],
  1941: [[2,4],[3,6],[4,5],[5,6],[6,6],[7,7],[8,8],[9,8],[10,8],[11,7],[12,7],[1,6]],
  1942: [[2,4],[3,6],[4,5],[5,6],[6,6],[7,8],[8,8],[9,8],[10,9],[11,8],[12,7],[1,6]],
  1943: [[2,5],[3,6],[4,6],[5,6],[6,6],[7,8],[8,8],[9,8],[10,9],[11,8],[12,8],[1,6]],
  1944: [[2,5],[3,6],[4,5],[5,6],[6,6],[7,7],[8,8],[9,8],[10,9],[11,8],[12,8],[1,6]],
  1945: [[2,4],[3,6],[4,5],[5,6],[6,6],[7,7],[8,8],[9,8],[10,8],[11,7],[12,7],[1,6]],
  1946: [[2,4],[3,6],[4,5],[5,6],[6,6],[7,8],[8,8],[9,8],[10,9],[11,8],[12,7],[1,6]],
  1947: [[2,5],[3,6],[4,6],[5,6],[6,6],[7,8],[8,8],[9,8],[10,9],[11,8],[12,8],[1,6]],
  1948: [[2,5],[3,6],[4,5],[5,5],[6,6],[7,7],[8,8],[9,8],[10,9],[11,8],[12,8],[1,6]],
  1949: [[2,4],[3,6],[4,5],[5,6],[6,6],[7,7],[8,8],[9,8],[10,8],[11,7],[12,7],[1,6]],
  1950: [[2,4],[3,6],[4,5],[5,6],[6,6],[7,8],[8,8],[9,8],[10,9],[11,8],[12,7],[1,6]],
  1951: [[2,5],[3,6],[4,5],[5,6],[6,6],[7,8],[8,8],[9,8],[10,9],[11,8],[12,8],[1,6]],
  1952: [[2,5],[3,6],[4,5],[5,5],[6,6],[7,7],[8,7],[9,8],[10,9],[11,8],[12,8],[1,5]],
  1953: [[2,4],[3,6],[4,5],[5,6],[6,6],[7,7],[8,8],[9,8],[10,8],[11,7],[12,7],[1,6]],
  1954: [[2,4],[3,6],[4,5],[5,6],[6,6],[7,8],[8,8],[9,8],[10,8],[11,8],[12,7],[1,6]],
  1955: [[2,4],[3,6],[4,5],[5,6],[6,6],[7,8],[8,8],[9,8],[10,9],[11,8],[12,8],[1,6]],
  1956: [[2,5],[3,5],[4,5],[5,5],[6,6],[7,7],[8,7],[9,8],[10,9],[11,8],[12,8],[1,5]],
  1957: [[2,4],[3,6],[4,5],[5,6],[6,6],[7,7],[8,8],[9,8],[10,8],[11,7],[12,7],[1,6]],
  1958: [[2,4],[3,6],[4,5],[5,6],[6,6],[7,8],[8,8],[9,8],[10,8],[11,8],[12,7],[1,6]],
  1959: [[2,4],[3,6],[4,5],[5,6],[6,6],[7,8],[8,8],[9,8],[10,9],[11,8],[12,7],[1,6]],
  1960: [[2,5],[3,5],[4,5],[5,5],[6,6],[7,7],[8,7],[9,8],[10,9],[11,8],[12,8],[1,5]],
  1961: [[2,4],[3,6],[4,5],[5,6],[6,6],[7,7],[8,8],[9,8],[10,8],[11,7],[12,7],[1,6]],
  1962: [[2,4],[3,6],[4,5],[5,6],[6,6],[7,7],[8,8],[9,8],[10,8],[11,8],[12,7],[1,6]],
  1963: [[2,4],[3,6],[4,5],[5,6],[6,6],[7,8],[8,8],[9,8],[10,9],[11,8],[12,7],[1,6]],
  1964: [[2,5],[3,5],[4,5],[5,5],[6,6],[7,7],[8,7],[9,7],[10,9],[11,8],[12,8],[1,5]],
  1965: [[2,4],[3,6],[4,5],[5,6],[6,6],[7,7],[8,8],[9,8],[10,8],[11,7],[12,7],[1,6]],
  1966: [[2,4],[3,6],[4,5],[5,6],[6,6],[7,7],[8,8],[9,8],[10,8],[11,8],[12,7],[1,6]],
  1967: [[2,4],[3,6],[4,5],[5,6],[6,6],[7,8],[8,8],[9,8],[10,9],[11,8],[12,7],[1,6]],
  1968: [[2,5],[3,5],[4,5],[5,5],[6,6],[7,7],[8,7],[9,7],[10,9],[11,8],[12,8],[1,5]],
  1969: [[2,4],[3,6],[4,5],[5,6],[6,6],[7,7],[8,8],[9,8],[10,8],[11,7],[12,7],[1,6]],
  1970: [[2,4],[3,6],[4,5],[5,6],[6,6],[7,7],[8,8],[9,8],[10,8],[11,7],[12,7],[1,6]],
  1971: [[2,4],[3,6],[4,5],[5,6],[6,6],[7,8],[8,8],[9,8],[10,9],[11,8],[12,7],[1,6]],
  1972: [[2,5],[3,5],[4,5],[5,5],[6,5],[7,7],[8,7],[9,7],[10,9],[11,8],[12,8],[1,5]],
  1973: [[2,4],[3,6],[4,5],[5,6],[6,6],[7,7],[8,8],[9,8],[10,8],[11,7],[12,7],[1,6]],
  1974: [[2,4],[3,6],[4,5],[5,6],[6,6],[7,7],[8,8],[9,8],[10,8],[11,7],[12,7],[1,6]],
  1975: [[2,4],[3,6],[4,5],[5,6],[6,6],[7,8],[8,8],[9,8],[10,9],[11,8],[12,7],[1,6]],
  1976: [[2,5],[3,5],[4,5],[5,5],[6,5],[7,7],[8,7],[9,7],[10,9],[11,8],[12,8],[1,5]],
  1977: [[2,4],[3,6],[4,5],[5,6],[6,6],[7,7],[8,8],[9,8],[10,8],[11,7],[12,7],[1,6]],
  1978: [[2,4],[3,6],[4,5],[5,6],[6,6],[7,7],[8,8],[9,8],[10,8],[11,7],[12,7],[1,6]],
  1979: [[2,4],[3,6],[4,5],[5,6],[6,6],[7,8],[8,8],[9,8],[10,9],[11,8],[12,7],[1,6]],
  1980: [[2,5],[3,5],[4,5],[5,5],[6,5],[7,7],[8,7],[9,7],[10,9],[11,8],[12,8],[1,5]],
  1981: [[2,4],[3,6],[4,5],[5,5],[6,6],[7,7],[8,7],[9,8],[10,8],[11,7],[12,7],[1,6]],
  1982: [[2,4],[3,6],[4,5],[5,6],[6,6],[7,7],[8,8],[9,8],[10,8],[11,7],[12,7],[1,6]],
  1983: [[2,4],[3,6],[4,5],[5,6],[6,6],[7,8],[8,8],[9,8],[10,8],[11,8],[12,7],[1,6]],
  1984: [[2,5],[3,5],[4,4],[5,5],[6,5],[7,7],[8,7],[9,7],[10,9],[11,8],[12,8],[1,5]],
  1985: [[2,4],[3,6],[4,5],[5,5],[6,6],[7,7],[8,7],[9,8],[10,8],[11,7],[12,7],[1,6]],
  1986: [[2,4],[3,6],[4,5],[5,6],[6,6],[7,7],[8,8],[9,8],[10,8],[11,7],[12,7],[1,6]],
  1987: [[2,4],[3,6],[4,5],[5,6],[6,6],[7,8],[8,8],[9,8],[10,8],[11,8],[12,7],[1,6]],
  1988: [[2,4],[3,5],[4,4],[5,5],[6,5],[7,7],[8,7],[9,7],[10,9],[11,8],[12,8],[1,5]],
  1989: [[2,4],[3,5],[4,5],[5,5],[6,6],[7,7],[8,7],[9,8],[10,8],[11,7],[12,7],[1,5]],
  1990: [[2,4],[3,6],[4,5],[5,6],[6,6],[7,7],[8,8],[9,8],[10,8],[11,7],[12,7],[1,6]],
  1991: [[2,4],[3,6],[4,5],[5,6],[6,6],[7,7],[8,8],[9,8],[10,8],[11,8],[12,7],[1,6]],
  1992: [[2,4],[3,5],[4,4],[5,5],[6,5],[7,7],[8,7],[9,7],[10,9],[11,8],[12,7],[1,5]],
  1993: [[2,4],[3,5],[4,5],[5,5],[6,6],[7,7],[8,7],[9,8],[10,8],[11,7],[12,7],[1,5]],
  1994: [[2,4],[3,6],[4,5],[5,6],[6,6],[7,7],[8,8],[9,8],[10,8],[11,7],[12,7],[1,6]],
  1995: [[2,4],[3,6],[4,5],[5,6],[6,6],[7,7],[8,8],[9,8],[10,8],[11,8],[12,7],[1,6]],
  1996: [[2,4],[3,5],[4,4],[5,5],[6,5],[7,7],[8,7],[9,7],[10,9],[11,8],[12,7],[1,5]],
  1997: [[2,4],[3,5],[4,5],[5,5],[6,6],[7,7],[8,7],[9,7],[10,8],[11,7],[12,7],[1,5]],
  1998: [[2,4],[3,6],[4,5],[5,6],[6,6],[7,7],[8,8],[9,8],[10,8],[11,7],[12,7],[1,6]],
  1999: [[2,4],[3,6],[4,5],[5,6],[6,6],[7,7],[8,8],[9,8],[10,8],[11,8],[12,7],[1,6]],
  2000: [[2,4],[3,5],[4,4],[5,5],[6,5],[7,7],[8,7],[9,7],[10,9],[11,8],[12,7],[1,5]],
  2001: [[2,4],[3,5],[4,5],[5,5],[6,5],[7,7],[8,7],[9,7],[10,8],[11,7],[12,7],[1,5]],
  2002: [[2,4],[3,6],[4,5],[5,6],[6,6],[7,7],[8,8],[9,8],[10,8],[11,7],[12,7],[1,6]],
  2003: [[2,4],[3,6],[4,5],[5,6],[6,6],[7,7],[8,8],[9,8],[10,8],[11,7],[12,7],[1,6]],
  2004: [[2,4],[3,5],[4,4],[5,5],[6,5],[7,7],[8,7],[9,7],[10,9],[11,8],[12,7],[1,5]],
  2005: [[2,4],[3,5],[4,5],[5,5],[6,5],[7,7],[8,7],[9,7],[10,8],[11,7],[12,7],[1,5]],
  2006: [[2,4],[3,6],[4,5],[5,6],[6,6],[7,7],[8,8],[9,8],[10,8],[11,7],[12,7],[1,6]],
  2007: [[2,4],[3,6],[4,5],[5,6],[6,6],[7,7],[8,8],[9,8],[10,8],[11,7],[12,7],[1,6]],
  2008: [[2,4],[3,5],[4,4],[5,5],[6,5],[7,7],[8,7],[9,7],[10,9],[11,8],[12,7],[1,5]],
  2009: [[2,4],[3,5],[4,5],[5,5],[6,5],[7,7],[8,7],[9,7],[10,8],[11,7],[12,7],[1,5]],
  2010: [[2,4],[3,6],[4,5],[5,5],[6,6],[7,7],[8,7],[9,8],[10,8],[11,7],[12,7],[1,6]],
  2011: [[2,4],[3,6],[4,5],[5,6],[6,6],[7,7],[8,8],[9,8],[10,8],[11,7],[12,7],[1,6]],
  2012: [[2,4],[3,5],[4,4],[5,5],[6,5],[7,7],[8,7],[9,7],[10,9],[11,8],[12,7],[1,5]],
  2013: [[2,4],[3,5],[4,4],[5,5],[6,5],[7,7],[8,7],[9,7],[10,8],[11,7],[12,7],[1,5]],
  2014: [[2,4],[3,6],[4,5],[5,5],[6,6],[7,7],[8,7],[9,8],[10,8],[11,7],[12,7],[1,6]],
  2015: [[2,4],[3,6],[4,5],[5,6],[6,6],[7,7],[8,8],[9,8],[10,8],[11,7],[12,7],[1,6]],
  2016: [[2,4],[3,5],[4,4],[5,5],[6,5],[7,7],[8,7],[9,7],[10,8],[11,7],[12,7],[1,5]],
  2017: [[2,4],[3,5],[4,4],[5,5],[6,5],[7,7],[8,7],[9,7],[10,8],[11,7],[12,7],[1,5]],
  2018: [[2,4],[3,6],[4,5],[5,5],[6,6],[7,7],[8,7],[9,8],[10,8],[11,7],[12,7],[1,6]],
  2019: [[2,4],[3,6],[4,5],[5,6],[6,6],[7,7],[8,8],[9,8],[10,8],[11,7],[12,7],[1,6]],
  2020: [[2,4],[3,5],[4,4],[5,5],[6,5],[7,7],[8,7],[9,7],[10,8],[11,7],[12,7],[1,5]],
  2021: [[2,3],[3,5],[4,4],[5,5],[6,5],[7,7],[8,7],[9,7],[10,8],[11,7],[12,7],[1,5]],
  2022: [[2,4],[3,5],[4,5],[5,5],[6,6],[7,7],[8,7],[9,8],[10,8],[11,7],[12,7],[1,5]],
  2023: [[2,4],[3,6],[4,5],[5,6],[6,6],[7,7],[8,8],[9,8],[10,8],[11,7],[12,7],[1,6]],
  2024: [[2,4],[3,5],[4,4],[5,5],[6,5],[7,6],[8,7],[9,7],[10,8],[11,7],[12,7],[1,5]],
  2025: [[2,3],[3,5],[4,4],[5,5],[6,5],[7,7],[8,7],[9,7],[10,8],[11,7],[12,7],[1,5]],
  2026: [[2,4],[3,5],[4,5],[5,5],[6,5],[7,7],[8,7],[9,7],[10,8],[11,7],[12,7],[1,5]],
  2027: [[2,4],[3,6],[4,5],[5,6],[6,6],[7,7],[8,8],[9,8],[10,8],[11,7],[12,7],[1,6]],
  2028: [[2,4],[3,5],[4,4],[5,5],[6,5],[7,6],[8,7],[9,7],[10,8],[11,7],[12,7],[1,5]],
  2029: [[2,3],[3,5],[4,4],[5,5],[6,5],[7,7],[8,7],[9,7],[10,8],[11,7],[12,6],[1,5]],
  2030: [[2,4],[3,5],[4,5],[5,5],[6,5],[7,7],[8,7],[9,7],[10,8],[11,7],[12,7],[1,5]],
  2031: [[2,4],[3,6],[4,5],[5,6],[6,6],[7,7],[8,8],[9,8],[10,8],[11,7],[12,7],[1,6]],
  2032: [[2,4],[3,5],[4,4],[5,5],[6,5],[7,6],[8,7],[9,7],[10,8],[11,7],[12,7],[1,5]],
  2033: [[2,3],[3,5],[4,4],[5,5],[6,5],[7,7],[8,7],[9,7],[10,8],[11,7],[12,6],[1,5]],
  2034: [[2,4],[3,5],[4,5],[5,5],[6,5],[7,7],[8,7],[9,7],[10,8],[11,7],[12,7],[1,5]],
  2035: [[2,4],[3,6],[4,5],[5,6],[6,6],[7,7],[8,8],[9,8],[10,8],[11,7],[12,7],[1,6]],
  2036: [[2,4],[3,5],[4,4],[5,5],[6,5],[7,6],[8,7],[9,7],[10,8],[11,7],[12,7],[1,5]],
  2037: [[2,3],[3,5],[4,4],[5,5],[6,5],[7,7],[8,7],[9,7],[10,8],[11,7],[12,6],[1,5]],
  2038: [[2,4],[3,5],[4,5],[5,5],[6,5],[7,7],[8,7],[9,7],[10,8],[11,7],[12,7],[1,5]],
  2039: [[2,4],[3,6],[4,5],[5,6],[6,6],[7,7],[8,8],[9,8],[10,8],[11,7],[12,7],[1,6]],
  2040: [[2,4],[3,5],[4,4],[5,5],[6,5],[7,6],[8,7],[9,7],[10,8],[11,7],[12,7],[1,5]],
  2041: [[2,3],[3,5],[4,4],[5,5],[6,5],[7,7],[8,7],[9,7],[10,8],[11,7],[12,6],[1,5]],
  2042: [[2,4],[3,5],[4,5],[5,5],[6,5],[7,7],[8,7],[9,7],[10,8],[11,7],[12,7],[1,5]],
  2043: [[2,4],[3,6],[4,5],[5,5],[6,6],[7,7],[8,7],[9,8],[10,8],[11,7],[12,7],[1,6]],
  2044: [[2,4],[3,5],[4,4],[5,5],[6,5],[7,6],[8,7],[9,7],[10,8],[11,7],[12,7],[1,5]],
  2045: [[2,3],[3,5],[4,4],[5,5],[6,5],[7,7],[8,7],[9,7],[10,8],[11,7],[12,6],[1,5]],
  2046: [[2,4],[3,5],[4,4],[5,5],[6,5],[7,7],[8,7],[9,7],[10,8],[11,7],[12,7],[1,5]],
  2047: [[2,4],[3,6],[4,5],[5,5],[6,6],[7,7],[8,7],[9,8],[10,8],[11,7],[12,7],[1,6]],
  2048: [[2,4],[3,5],[4,4],[5,5],[6,5],[7,6],[8,7],[9,7],[10,8],[11,7],[12,7],[1,5]],
  2049: [[2,3],[3,5],[4,4],[5,5],[6,5],[7,7],[8,7],[9,7],[10,7],[11,7],[12,6],[1,5]],
  2050: [[2,4],[3,5],[4,4],[5,5],[6,5],[7,7],[8,7],[9,7],[10,8],[11,7],[12,7],[1,5]],
  2051: [[2,4],[3,6],[4,5],[5,5],[6,6],[7,7],[8,7],[9,8],[10,8],[11,7],[12,7],[1,6]],
  2052: [[2,4],[3,5],[4,4],[5,5],[6,5],[7,6],[8,7],[9,7],[10,8],[11,7],[12,7],[1,5]],
  2053: [[2,3],[3,5],[4,4],[5,5],[6,5],[7,6],[8,7],[9,7],[10,7],[11,7],[12,6],[1,5]],
  2054: [[2,4],[3,5],[4,4],[5,5],[6,5],[7,7],[8,7],[9,7],[10,8],[11,7],[12,7],[1,5]],
  2055: [[2,4],[3,5],[4,5],[5,5],[6,6],[7,7],[8,7],[9,8],[10,8],[11,7],[12,7],[1,6]],
  2056: [[2,4],[3,5],[4,4],[5,5],[6,5],[7,6],[8,7],[9,7],[10,8],[11,7],[12,7],[1,5]],
  2057: [[2,3],[3,5],[4,4],[5,5],[6,5],[7,6],[8,7],[9,7],[10,7],[11,7],[12,6],[1,5]],
  2058: [[2,3],[3,5],[4,4],[5,5],[6,5],[7,7],[8,7],[9,7],[10,8],[11,7],[12,7],[1,5]],
  2059: [[2,4],[3,5],[4,5],[5,5],[6,6],[7,7],[8,7],[9,7],[10,8],[11,7],[12,7],[1,5]],
  2060: [[2,4],[3,5],[4,4],[5,5],[6,5],[7,6],[8,7],[9,7],[10,8],[11,7],[12,7],[1,5]],
};

// -----------------------------------------------------------------------------
// 2. Corrected monthly element mapping
//    Based on the earthly branch (지지) element of each saju month.
//    Saju months 1-12 correspond to branches 寅卯辰巳午未申酉戌亥子丑.
//
//    Old (WRONG): 1:earth, 4:earth, 7:earth, 10:earth
//    New (CORRECT): based on each branch's inherent element
// -----------------------------------------------------------------------------
const SAJU_MONTH_ELEMENTS = {
  1:  "wood",   // 인(寅)월 - wood
  2:  "wood",   // 묘(卯)월 - wood
  3:  "earth",  // 진(辰)월 - earth
  4:  "fire",   // 사(巳)월 - fire
  5:  "fire",   // 오(午)월 - fire
  6:  "earth",  // 미(未)월 - earth
  7:  "metal",  // 신(申)월 - metal
  8:  "metal",  // 유(酉)월 - metal
  9:  "earth",  // 술(戌)월 - earth
  10: "water",  // 해(亥)월 - water
  11: "water",  // 자(子)월 - water
  12: "earth",  // 축(丑)월 - earth
};

// -----------------------------------------------------------------------------
// 3. Accurate Saju Calculation Function
//    Replaces the simplified calcSaju() with astronomically accurate logic.
// -----------------------------------------------------------------------------

/**
 * Calculate Julian Day Number for a Gregorian date.
 * This is the standard astronomical JDN used for day counting.
 */
function _sajuJDN(year, month, day) {
  if (month <= 2) { year--; month += 12; }
  var A = Math.floor(year / 100);
  var B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (year + 4716)) + Math.floor(30.6001 * (month + 1)) + day + B - 1524;
}

/**
 * Determine the saju month (1-12) and the saju year for a given Gregorian date.
 * The saju year changes at 입춘 (lichun), NOT January 1st.
 * The saju month changes at each 절입일 as defined in SOLAR_TERMS.
 *
 * @param {number} y - Gregorian year
 * @param {number} m - Gregorian month (1-12)
 * @param {number} d - Gregorian day
 * @returns {{ sajuYear: number, sajuMonth: number }}
 */
function _getSajuYearMonth(y, m, d) {
  // Determine which saju year this date belongs to.
  // The saju year Y starts at 입춘 of Gregorian year Y.
  // Before 입춘 of year Y, the saju year is Y-1.

  var terms = SOLAR_TERMS[y];
  var prevTerms = SOLAR_TERMS[y - 1];

  // Check if date is before 입춘 (index 0) of this Gregorian year
  var lichunMonth = terms ? terms[0][0] : 2;
  var lichunDay = terms ? terms[0][1] : 4;

  var sajuYear;
  if (m < lichunMonth || (m === lichunMonth && d < lichunDay)) {
    // Before 입춘: saju year = previous year
    sajuYear = y - 1;
  } else {
    sajuYear = y;
  }

  // Determine saju month by finding which 절기 period the date falls in.
  // We need to check the terms for the saju year.
  var yearTerms = SOLAR_TERMS[sajuYear];
  if (!yearTerms) {
    // Fallback: use approximate calculation if year is out of range
    return { sajuYear: sajuYear, sajuMonth: _approxSajuMonth(m, d) };
  }

  // Convert date to a comparable number (days from some reference)
  // We'll use a simple month*100+day comparison, but we need to handle
  // the wrap-around at 소한 (month 12 = January of next year)

  // Build the list of term boundaries with their absolute dates
  // Term i starts saju month (i+1), where i is 0-indexed
  // Terms 0-10 are in the saju year's Gregorian year (or the year after for term 11)
  var boundaries = [];
  for (var i = 0; i < 12; i++) {
    var termM = yearTerms[i][0];
    var termD = yearTerms[i][1];
    var termY;
    if (i === 11) {
      // 소한 is in January of the next Gregorian year
      termY = sajuYear + 1;
    } else if (i === 0 && termM <= 2) {
      // 입춘 is in Feb of the saju year's Gregorian year
      termY = sajuYear;
    } else {
      termY = sajuYear;
    }
    boundaries.push({ sajuMonth: i + 1, year: termY, month: termM, day: termD });
  }

  // Find which saju month the date falls in
  // We compare by converting to days from a reference
  var dateVal = y * 10000 + m * 100 + d;

  // Go backwards from month 12 to month 1
  for (var j = 11; j >= 0; j--) {
    var b = boundaries[j];
    var bVal = b.year * 10000 + b.month * 100 + b.day;
    if (dateVal >= bVal) {
      return { sajuYear: sajuYear, sajuMonth: b.sajuMonth };
    }
  }

  // If we're before the first term (입춘) of this saju year,
  // we're in month 12 (축월) of the previous saju year
  var prevYearTerms = SOLAR_TERMS[sajuYear - 1];
  if (prevYearTerms) {
    return { sajuYear: sajuYear - 1, sajuMonth: 12 };
  }

  // Ultimate fallback
  return { sajuYear: sajuYear, sajuMonth: _approxSajuMonth(m, d) };
}

/**
 * Approximate saju month from Gregorian month/day (fallback for out-of-range years)
 */
function _approxSajuMonth(m, d) {
  // Approximate boundaries
  var approx = [
    [2, 4], [3, 6], [4, 5], [5, 6], [6, 6], [7, 7],
    [8, 7], [9, 8], [10, 8], [11, 7], [12, 7], [1, 6]
  ];
  var md = m * 100 + d;
  for (var i = 11; i >= 0; i--) {
    var am = approx[i][0];
    var ad = approx[i][1];
    // Handle January (month 12 = 축월)
    if (i === 11) {
      if (m === 1 && d >= ad) return 12;
      continue;
    }
    if (md >= am * 100 + ad) return i + 1;
  }
  return 12; // Before 입춘 = month 12 of previous year
}

/**
 * Calculate accurate Four Pillars (사주팔자).
 *
 * @param {number} y - Birth year (Gregorian)
 * @param {number} m - Birth month (1-12)
 * @param {number} d - Birth day
 * @param {string|null} hourStr - Birth time as "HH:MM" string, or null/empty
 * @returns {{ pillars: Array, counts: Object, dayMasterElement: string, deficient: Array, excess: Array, hasHour: boolean }}
 */
function calcSajuAccurate(y, m, d, hourStr) {
  // --- Determine saju year and month from 절기 boundaries ---
  var ym = _getSajuYearMonth(y, m, d);
  var sajuYear = ym.sajuYear;
  var sajuMonth = ym.sajuMonth; // 1-12 (1=인월, 12=축월)

  // === YEAR PILLAR ===
  // Standard formula: (year - 4) % 60 gives the ganzhi index
  // This works because 4 AD = 甲子 year
  var yearStemIdx = ((sajuYear - 4) % 10 + 10) % 10;
  var yearBranchIdx = ((sajuYear - 4) % 12 + 12) % 12;

  // === MONTH PILLAR ===
  // Branch: 인월(month 1) = branch 2(寅), 묘월(month 2) = branch 3(卯), ...
  // Formula: branchIdx = (sajuMonth + 1) % 12
  var monthBranchIdx = (sajuMonth + 1) % 12;

  // Stem: determined by year stem and saju month
  // The 년상기월법 (year-stem-to-month-stem) formula:
  // monthStemIdx = ((yearStemIdx % 5) * 2 + sajuMonth) % 10
  // where sajuMonth is 0-indexed for the formula (인월=0)
  var monthStemIdx = ((yearStemIdx % 5) * 2 + (sajuMonth - 1) + 2) % 10;
  // Simplified: ((yearStemIdx % 5) * 2 + sajuMonth + 1) % 10
  // Let me verify:
  //   yearStem=0(甲), month 1(인): should be 丙寅 (stem=2)
  //   ((0%5)*2 + 0 + 2) % 10 = 2 ✓
  //   yearStem=0(甲), month 2(묘): should be 丁卯 (stem=3)
  //   ((0%5)*2 + 1 + 2) % 10 = 3 ✓
  //   yearStem=2(丙), month 1(인): should be 庚寅 (stem=6)
  //   ((2%5)*2 + 0 + 2) % 10 = 6 ✓

  // === DAY PILLAR ===
  // Standard formula: stem = (JDN+9)%10, branch = (JDN+1)%12
  // Combined offset = 49 (by CRT: 49≡9 mod10, 49≡1 mod12)
  // Verified: 2000-01-01=戊午, 2024-02-10=甲辰, 2026-04-04=戊申
  var jdn = _sajuJDN(y, m, d);
  var dayGanzhiIdx = ((jdn + 49) % 60 + 60) % 60;
  var dayStemIdx = dayGanzhiIdx % 10;
  var dayBranchIdx = dayGanzhiIdx % 12;

  // === HOUR PILLAR ===
  var hourBranchIdx = 0;
  var hourStemIdx = 0;
  var hasHour = !!(hourStr && hourStr.trim());
  if (hasHour) {
    var h = parseInt(hourStr.split(":")[0], 10);
    // 자시(子) = 23:00-00:59, 축시(丑) = 01:00-02:59, ...
    hourBranchIdx = Math.floor(((h + 1) % 24) / 2);

    // 야자시(夜子時) 처리: 23시는 다음 날의 子시
    // → 일주를 하루 뒤로 이동하여 시간 계산
    var hourDayStemIdx = dayStemIdx;
    if (h >= 23) {
      var nextJdn = jdn + 1;
      var nextDayGanzhiIdx = ((nextJdn + 49) % 60 + 60) % 60;
      hourDayStemIdx = nextDayGanzhiIdx % 10;
    }

    // 일상기시법 (日上起時法):
    hourStemIdx = ((hourDayStemIdx % 5) * 2 + hourBranchIdx) % 10;
  }

  // === BUILD PILLARS ===
  var pillars = [
    { stem: yearStemIdx,  branch: yearBranchIdx },
    { stem: monthStemIdx, branch: monthBranchIdx },
    { stem: dayStemIdx,   branch: dayBranchIdx },
    { stem: hourStemIdx,  branch: hourBranchIdx },
  ];

  // === COUNT FIVE ELEMENTS ===
  // Uses HEAVENLY_STEMS and EARTHLY_BRANCHES from the main app
  var counts = { wood: 0, fire: 0, earth: 0, metal: 0, water: 0 };
  var stemElements = ["wood","wood","fire","fire","earth","earth","metal","metal","water","water"];
  var branchElements = ["water","earth","wood","wood","earth","fire","fire","earth","metal","metal","earth","water"];

  for (var k = 0; k < pillars.length; k++) {
    var p = pillars[k];
    counts[stemElements[p.stem]]++;
    counts[branchElements[p.branch]]++;
  }

  var dayMasterElement = stemElements[pillars[2].stem];

  // Determine deficient/excess
  var total = 0;
  var el;
  for (el in counts) { if (counts.hasOwnProperty(el)) total += counts[el]; }
  var avg = total / 5;
  var deficient = [];
  var excess = [];
  for (el in counts) {
    if (counts.hasOwnProperty(el)) {
      if (counts[el] < avg * 0.6) deficient.push(el);
      if (counts[el] > avg * 1.5) excess.push(el);
    }
  }

  return {
    pillars: pillars,
    counts: counts,
    dayMasterElement: dayMasterElement,
    deficient: deficient,
    excess: excess,
    hasHour: hasHour,
    sajuYear: sajuYear,
    sajuMonth: sajuMonth,
  };
}
