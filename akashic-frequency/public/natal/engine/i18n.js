/* ── i18n ────────────────────────────────────────────────────────────────
   Every user-visible string lives here. The computation engine emits keys
   only (sign keys, body keys, dignity keys); this module turns them into
   text. Adding a language = adding one block below.
   ─────────────────────────────────────────────────────────────────────── */

export const LANGS = ['ko', 'en'];

export const SIGN_NAMES = {
  ko: ['양자리', '황소자리', '쌍둥이자리', '게자리', '사자자리', '처녀자리', '천칭자리', '전갈자리', '궁수자리', '염소자리', '물병자리', '물고기자리'],
  en: ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces']
};

export const BODY_NAMES = {
  ko: {
    sun: '태양', moon: '달', mercury: '수성', venus: '금성', mars: '화성', jupiter: '목성',
    saturn: '토성', uranus: '천왕성', neptune: '해왕성', pluto: '명왕성', chiron: '카이런',
    lilith: '릴리스', northnode: '북교점', southnode: '남교점',
    asc: 'ASC', mc: 'MC', dsc: 'DSC', ic: 'IC', fortune: '행운의 점', vertex: '버텍스'
  },
  en: {
    sun: 'Sun', moon: 'Moon', mercury: 'Mercury', venus: 'Venus', mars: 'Mars', jupiter: 'Jupiter',
    saturn: 'Saturn', uranus: 'Uranus', neptune: 'Neptune', pluto: 'Pluto', chiron: 'Chiron',
    lilith: 'Lilith', northnode: 'North Node', southnode: 'South Node',
    asc: 'ASC', mc: 'MC', dsc: 'DSC', ic: 'IC', fortune: 'Part of Fortune', vertex: 'Vertex'
  }
};

export const DIGNITY_NAMES = {
  ko: {
    domicile: '도미사일', detriment: '디트리먼트', exaltation: '엑절테이션', fall: '폴',
    triplicity: '트리플리시티', triplicityPart: '트리플리시티(참여)', term: '텀', face: '페이스',
    peregrine: '페레그린', modernDomicile: '현대 지배', modernDetriment: '현대 디트리먼트', none: '—'
  },
  en: {
    domicile: 'Domicile', detriment: 'Detriment', exaltation: 'Exaltation', fall: 'Fall',
    triplicity: 'Triplicity', triplicityPart: 'Triplicity (participating)', term: 'Term', face: 'Face',
    peregrine: 'Peregrine', modernDomicile: 'Modern rulership', modernDetriment: 'Modern detriment', none: '—'
  }
};

export const ASPECT_NAMES = {
  ko: {
    conjunction: '합', opposition: '충', square: '스퀘어', trine: '트라인', sextile: '섹스타일',
    quincunx: '퀸컹스', semisquare: '세미스퀘어', sesquiquadrate: '세스퀴쿼드레이트',
    semisextile: '세미섹스타일', quintile: '퀸타일', biquintile: '바이퀸타일'
  },
  en: {
    conjunction: 'Conjunction', opposition: 'Opposition', square: 'Square', trine: 'Trine', sextile: 'Sextile',
    quincunx: 'Quincunx', semisquare: 'Semi-square', sesquiquadrate: 'Sesquiquadrate',
    semisextile: 'Semi-sextile', quintile: 'Quintile', biquintile: 'Biquintile'
  }
};

export const PATTERN_NAMES = {
  ko: {
    Stellium: '스텔리움', 'Grand Trine': '그랜드 트라인', Kite: '카이트', 'T-Square': 'T스퀘어',
    'Grand Cross': '그랜드 크로스', 'Mystic Rectangle': '미스틱 렉탱글', Yod: '요드', "Thor's Hammer": '토르의 망치'
  },
  en: {
    Stellium: 'Stellium', 'Grand Trine': 'Grand Trine', Kite: 'Kite', 'T-Square': 'T-Square',
    'Grand Cross': 'Grand Cross', 'Mystic Rectangle': 'Mystic Rectangle', Yod: 'Yod', "Thor's Hammer": "Thor's Hammer"
  }
};

export const ELEMENT_NAMES = {
  ko: { fire: '불', earth: '흙', air: '공기', water: '물' },
  en: { fire: 'Fire', earth: 'Earth', air: 'Air', water: 'Water' }
};
export const MODALITY_NAMES = {
  ko: { cardinal: '카디널', fixed: '픽스드', mutable: '뮤터블' },
  en: { cardinal: 'Cardinal', fixed: 'Fixed', mutable: 'Mutable' }
};
export const SOLAR_PHASE_NAMES = {
  ko: { cazimi: '카지미', combust: '컴버스트', underBeams: '언더 더 빔즈' },
  en: { cazimi: 'Cazimi', combust: 'Combust', underBeams: 'Under the Beams' }
};

/* ── UI copy ─────────────────────────────────────────────────────────── */
export const UI = {
  ko: {
    appTitle: '천궁도 리딩',
    tagline: '정밀 천체력으로 출생차트를 계산하고, Whole Sign과 Placidus를 함께 읽어 15개 항목으로 해석합니다.',
    name: '이름 (선택)', namePh: '비워두어도 됩니다',
    birthDate: '생년월일', birthDatePh: '1990-01-15',
    birthTime: '출생시각 (24시간)', birthTimePh: '14:30',
    birthTimeHint: '병원 기록·가족 기억 등 가능한 정확한 값을 넣을수록 하우스 해석이 정확해집니다.',
    timeUnknown: '출생시각을 모릅니다 (정오로 계산, 하우스 해석 제한)',
    birthPlace: '출생지', birthPlacePh: '도시명을 입력하세요 — 예: 대구',
    placeHint: '한글·영문 모두 검색됩니다. 같은 이름이 여러 곳이면 "Greenville, NC"처럼 주·국가를 붙이세요.',
    manualEntry: '직접 입력', latitude: '위도', longitude: '경도',
    searching: '지명 검색 중…', noPlaceFound: '검색 결과가 없습니다. 위도, 경도를 직접 입력해 보세요.',
    compute: '차트 계산하기', computing: '계산 중…',
    footerCalc: '계산은 이 브라우저 안에서 이루어집니다. 해석 단계에서만 AI를 호출합니다.',
    errDate: '생년월일을 YYYY-MM-DD 형식으로 입력하세요.',
    errTime: '출생시각을 HH:MM 형식으로 입력하거나, 모른다면 위 항목을 체크하세요.',
    errTimeRange: '출생시각이 24시간 형식 범위를 벗어났습니다.',
    errPlace: '목록에서 출생지를 선택하세요. 없으면 "37.5, 127.0"처럼 위도, 경도를 입력하면 됩니다.',
    errYear: '1800~2200년 사이의 생년월일만 계산할 수 있습니다.',
    errCompute: '계산에 실패했습니다: ',
    chartOf: '님의 천궁도', chartTitle: '천궁도',
    timeUnknownWarn: '출생시각을 정오로 가정해 계산했습니다. ASC·MC·하우스·달의 도수는 실제와 다를 수 있으며, 하우스에 근거한 해석은 참고용으로만 보세요.',
    ascLabel: '상승', sunLabel: '태양', moonLabel: '달', houseSuffix: '하우스',
    sectLight: '섹트 라이트', chartRuler: '차트 룰러',
    dayChart: '주간 차트 (Diurnal)', nightChart: '야간 차트 (Nocturnal)',
    generateAll: '전체 리딩 생성 (14개 섹션)',
    generating: '생성 중 — ', stopped: '중단됨 — 다시 시작',
    deepMode: '심층 모드 — 더 강한 모델로 생성 (느리고 비용이 큽니다)',
    newChart: '다른 차트 계산', copyData: '차트 데이터 복사', copied: '복사됨', saveReading: '리딩 저장',
    generateSection: ' 해석 생성', regenerate: '다시 생성', reading: '읽는 중…', retry: '다시 시도',
    tabPlanets: '천체', tabHouses: '하우스', tabAspects: '어스펙트', tabBalance: '균형·구조',
    thBody: '천체', thSign: '사인', thDegree: '도', thMotion: '운동', thDignity: '에센셜 디그니티', thSolar: '태양',
    thHouse: '하우스', thWSSign: 'WS 사인', thLord: '로드', thLordPos: '로드 위치', thOccupants: '거주 천체', thCusp: 'Placidus 커스프',
    thAspect: '어스펙트', thAngle: '각', thOrb: '오브', thDirection: '방향', thClass: '구분',
    direct: '순행', retrograde: '역행', stationary: '정지',
    applying: '어플라잉', separating: '세퍼레이팅', major: '메이저', minor: '마이너',
    dignityNote: '디그니티 점수는 William Lilly의 에센셜 디그니티 배점(도미사일 +5, 엑절테이션 +4, 트리플리시티 +3, 텀 +2, 페이스 +1, 디트리먼트 −5, 폴 −4)입니다. 천왕성·해왕성·명왕성은 전통 배점 대상이 아니라 현대 지배 관계만 표기합니다.',
    interceptedLabel: '인터셉트된 사인 (Placidus): ', noIntercepted: 'Placidus에서 인터셉트된 사인은 없습니다.',
    noPatterns: '인식된 어스펙트 패턴이 없습니다.',
    yang: '양(陽)', yin: '음(陰)',
    dispositorLabel: '디스포지터', finalDispositor: '최종 디스포지터: ', noFinal: '없음 (순환 구조)',
    mutualReception: '상호수용: ', loopSuffix: ' 루프', finalPrefix: '최종: ',
    profectionLabel: '연간 프로펙션', ageUnit: '세', yearLord: '이어로드',
    errRateLimit: '요청이 너무 많습니다. 잠시 후 다시 시도하세요.',
    errNotGranted: '해석 권한이 허용되지 않았습니다.',
    errGenerate: '생성에 실패했습니다',
    errNoSample: '해석 기능을 아직 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.',
    loadingSample: '해석 기능을 불러오는 중입니다 — 잠시 후 다시 눌러주세요',
    disclaimer: '천체 위치는 이 기기에서 계산되었고, 해석은 AI가 생성합니다.<br>점성술은 검증된 예측 과학이 아닙니다. 의료·법률·재무 결정의 근거로 삼지 마세요.',
    upgradeTitle: '유료 구독 전용 기능입니다',
    upgradeBody: '차트 계산과 데이터 표는 누구나 볼 수 있습니다. 15개 항목의 전문 해석은 구독자에게만 제공됩니다.',
    upgradeCta: '구독 안내 보기',
    quotaExhausted: '이번 달 리딩 생성 한도를 모두 사용했습니다.'
  },
  en: {
    appTitle: 'Natal Chart Reading',
    tagline: 'Your chart computed from a precision ephemeris, read through both Whole Sign and Placidus across fifteen sections.',
    name: 'Name (optional)', namePh: 'You can leave this blank',
    birthDate: 'Date of birth', birthDatePh: '1990-01-15',
    birthTime: 'Time of birth (24h)', birthTimePh: '14:30',
    birthTimeHint: 'The closer this is to the recorded time, the more reliable the house placements.',
    timeUnknown: "I don't know my birth time (noon is used; house reading limited)",
    birthPlace: 'Place of birth', birthPlacePh: 'Type a city — e.g. Greenville',
    placeHint: 'Korean and English both work. For a common name, add the state or country: "Greenville, NC".',
    manualEntry: 'direct entry', latitude: 'Lat', longitude: 'Lon',
    searching: 'Searching…', noPlaceFound: 'No match. Try entering latitude and longitude directly.',
    compute: 'Calculate chart', computing: 'Calculating…',
    footerCalc: 'Positions are computed in your browser. AI is called only for interpretation.',
    errDate: 'Enter the date of birth as YYYY-MM-DD.',
    errTime: 'Enter the time as HH:MM, or tick the box above if you do not know it.',
    errTimeRange: 'That time is outside the 24-hour range.',
    errPlace: 'Pick a birthplace from the list, or type coordinates like "35.6, -77.4".',
    errYear: 'Only birth years between 1800 and 2200 can be calculated.',
    errCompute: 'Calculation failed: ',
    chartOf: "'s chart", chartTitle: 'Natal chart',
    timeUnknownWarn: 'Noon was used because the birth time is unknown. The Ascendant, Midheaven, house cusps and Moon degree may be well off, so treat every house-based reading as provisional.',
    ascLabel: 'Ascendant', sunLabel: 'Sun', moonLabel: 'Moon', houseSuffix: 'th house',
    sectLight: 'Sect light', chartRuler: 'Chart ruler',
    dayChart: 'Diurnal chart', nightChart: 'Nocturnal chart',
    generateAll: 'Generate full reading (14 sections)',
    generating: 'Generating — ', stopped: 'Stopped — start again',
    deepMode: 'Deep mode — use the stronger model (slower and more expensive)',
    newChart: 'New chart', copyData: 'Copy chart data', copied: 'Copied', saveReading: 'Save reading',
    generateSection: ' — generate', regenerate: 'Regenerate', reading: 'Reading…', retry: 'Try again',
    tabPlanets: 'Bodies', tabHouses: 'Houses', tabAspects: 'Aspects', tabBalance: 'Balance',
    thBody: 'Body', thSign: 'Sign', thDegree: 'Degree', thMotion: 'Motion', thDignity: 'Essential dignity', thSolar: 'Sun',
    thHouse: 'House', thWSSign: 'WS sign', thLord: 'Lord', thLordPos: 'Lord placed', thOccupants: 'Occupants', thCusp: 'Placidus cusp',
    thAspect: 'Aspect', thAngle: 'Angle', thOrb: 'Orb', thDirection: 'Direction', thClass: 'Class',
    direct: 'Direct', retrograde: 'Retrograde', stationary: 'Stationary',
    applying: 'Applying', separating: 'Separating', major: 'Major', minor: 'Minor',
    dignityNote: "Scores follow William Lilly's essential dignity table (domicile +5, exaltation +4, triplicity +3, term +2, face +1, detriment −5, fall −4). Uranus, Neptune and Pluto sit outside the traditional scheme, so only modern rulership is noted.",
    interceptedLabel: 'Intercepted signs (Placidus): ', noIntercepted: 'No signs are intercepted in Placidus.',
    noPatterns: 'No aspect patterns were detected.',
    yang: 'Yang', yin: 'Yin',
    dispositorLabel: 'Dispositors', finalDispositor: 'Final dispositor: ', noFinal: 'none (closed loop)',
    mutualReception: 'Mutual reception: ', loopSuffix: ' loop', finalPrefix: 'final: ',
    profectionLabel: 'Annual profection', ageUnit: '', yearLord: 'Year lord',
    errRateLimit: 'Too many requests. Try again shortly.',
    errNotGranted: 'Interpretation is not permitted here.',
    errGenerate: 'Generation failed',
    errNoSample: 'Interpretation is not available yet. Please try again in a moment.',
    loadingSample: 'Loading the interpretation service — press again in a moment',
    disclaimer: 'Positions were computed on this device; the interpretation is generated by AI.<br>Astrology is not a validated predictive science. Do not base medical, legal or financial decisions on it.',
    upgradeTitle: 'Subscriber feature',
    upgradeBody: 'Anyone can compute the chart and read the data tables. The fifteen-section interpretation is available to subscribers.',
    upgradeCta: 'See plans',
    quotaExhausted: 'You have used all your readings for this month.'
  }
};

export function ui(lang, key) { return (UI[lang] || UI.ko)[key] ?? (UI.ko[key] ?? key); }
export function signName(lang, i) { return (SIGN_NAMES[lang] || SIGN_NAMES.ko)[i]; }
export function bodyName(lang, key) { return (BODY_NAMES[lang] || BODY_NAMES.ko)[key] || key; }
export function dignityName(lang, key) { return (DIGNITY_NAMES[lang] || DIGNITY_NAMES.ko)[key] || key; }
export function aspectName(lang, key) { return (ASPECT_NAMES[lang] || ASPECT_NAMES.ko)[key] || key; }
export function patternName(lang, key) { return (PATTERN_NAMES[lang] || PATTERN_NAMES.ko)[key] || key; }
export function elementName(lang, key) { return (ELEMENT_NAMES[lang] || ELEMENT_NAMES.ko)[key] || key; }
export function modalityName(lang, key) { return (MODALITY_NAMES[lang] || MODALITY_NAMES.ko)[key] || key; }
export function solarPhaseName(lang, key) { return key ? ((SOLAR_PHASE_NAMES[lang] || SOLAR_PHASE_NAMES.ko)[key] || key) : null; }
