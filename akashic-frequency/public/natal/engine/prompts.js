/* ── Prompts ─────────────────────────────────────────────────────────────
   The astrologer persona, the fifteen section briefs, and the serializer
   that turns computed chart keys into labelled data for the model.

   Section 1 is produced by code, not by the model. Sections 2–15 are the
   ones that cost money.
   ─────────────────────────────────────────────────────────────────────── */
import {
  signName, bodyName, dignityName, aspectName, patternName,
  elementName, modalityName, solarPhaseName
} from './i18n.js';

/* ── section catalogue ───────────────────────────────────────────────── */
export const SECTIONS = [
  {
    n: 1, code: true,
    title: { ko: '출생차트', en: 'Natal chart' },
    lead: {
      ko: '계산된 원본 데이터. 아래 모든 해석은 이 표에만 근거합니다.',
      en: 'The computed data. Every interpretation below rests on this table alone.'
    }
  },
  {
    n: 2,
    title: { ko: 'Big Three', en: 'The Big Three' },
    lead: { ko: 'ASC · 태양 · 달 — 살아가는 방식, 무의식, 방어기제', en: 'Ascendant, Sun, Moon — how this person lives, defends, and identifies' },
    task: {
      ko: 'ASC, 태양, 달 세 가지를 가장 깊게 분석하라. 각각에 대해 (a) 사인·하우스·디그니티·어스펙트라는 점성술적 근거를 먼저 제시하고 (b) 그 근거로부터 삶을 살아가는 방식, 무의식의 작동, 방어기제, 정체성, 성장 방향을 도출하라. 단순 성격풀이는 금지. 마지막에 세 요소가 서로 협력하는 지점과 충돌하는 지점을 정리하라.',
      en: 'Analyse the Ascendant, Sun and Moon in the greatest depth. For each: (a) state the astrological evidence first — sign, house, dignity, aspects — then (b) derive from it how this person moves through life, how the unconscious operates, the defence mechanisms, the sense of identity, and the direction of growth. No generic personality description. Close by naming where the three cooperate and where they pull against each other.'
    }
  },
  {
    n: 3,
    title: { ko: '차트 룰러', en: 'Chart ruler' },
    lead: { ko: 'ASC 지배성을 축으로 본 삶 전체의 구조', en: 'The whole life read through the ruler of the Ascendant' },
    task: {
      ko: 'ASC 룰러(차트 룰러)를 중심으로 삶 전체를 해석하라. 룰러의 사인·하우스(WS/Placidus 모두)·디그니티·어스펙트·디스포지터 체인을 근거로, 이 사람의 인생이 어느 영역을 향해 구조화되어 있는지 설명하라. 전통 지배성과 현대 지배성이 다를 경우 두 관점을 모두 제시하라.',
      en: 'Read the whole life through the ruler of the Ascendant. Using its sign, its house in both Whole Sign and Placidus, its dignity, its aspects and its dispositor chain, explain which domain this life is organised around. Where the traditional and modern rulers differ, give both readings.'
    }
  },
  {
    n: 4,
    title: { ko: '12 하우스', en: 'The twelve houses' },
    lead: { ko: 'Whole Sign 기준 — 의미 / 로드 / 로드 위치 / 강점 / 약점 / 해결', en: 'Whole Sign — meaning, lord, placement, strength, weakness, remedy' },
    task: {
      ko: 'Whole Sign 기준으로 1~12하우스를 모두 분석하라. 각 하우스마다 ① 의미 ② 하우스 로드 ③ 로드의 위치(사인·하우스·디그니티) ④ 어떤 삶을 만드는지 ⑤ 강점 ⑥ 약점 ⑦ 해결 방향을 간결하게 쓴다. 하우스당 4~6문장. 비어 있는 하우스도 로드 위치로 반드시 해석하라.',
      en: 'Work through houses 1 to 12 in Whole Sign. For each give ① the domain ② its lord ③ where that lord sits (sign, house, dignity) ④ what kind of life this produces ⑤ the strength ⑥ the weakness ⑦ the way forward. Four to six sentences per house. Empty houses must still be read through their lord.'
    }
  },
  {
    n: 5,
    title: { ko: 'Placidus 비교', en: 'Placidus compared' },
    lead: { ko: '두 하우스 시스템이 갈리는 지점과 현실에서의 차이', en: 'Where the two house systems disagree, and what that means in a life' },
    task: {
      ko: '제공된 houseDiffs를 근거로, Whole Sign과 Placidus에서 다른 하우스에 들어가는 행성들을 하나씩 비교하라. 왜 차이가 발생하는지(하우스 크기, 고위도, 인터셉션, 앵글과의 거리 등) 먼저 설명하고, 실제 인생에서 각각 어떻게 다르게 나타나는지, 어느 쪽 해석이 이 차트에서 더 현실적인지 판단과 근거를 제시하라. 인터셉트된 사인이 있으면 반드시 다루라.',
      en: 'Using the supplied house differences, take each planet that falls in a different house under Placidus one at a time. Explain first why the difference arises — house size, latitude, interception, proximity to an angle — then how each version would actually show up in a life, and which reading you judge more realistic for this chart and why. Intercepted signs must be addressed if present.'
    }
  },
  {
    n: 6,
    title: { ko: '행성 분석', en: 'The planets' },
    lead: { ko: '디그니티 · 디스포지터 · 태양과의 관계 · 속도', en: 'Dignity, dispositor, relationship to the Sun, speed' },
    task: {
      ko: '태양부터 명왕성, 카이런, 노드, 릴리스까지 각 행성을 사인·하우스·에센셜 디그니티·디스포지터·상호수용·컴버스트/카지미/언더더빔즈·역행 여부·속도(빠름/느림/정지)까지 고려해 분석하라. 행성당 3~5문장. 디그니티 점수가 높은 행성과 낮은 행성을 우선순위로 구분해 제시하라.',
      en: 'Take each body from the Sun through Pluto, plus Chiron, the nodes and Lilith, weighing sign, house, essential dignity, dispositor, mutual reception, cazimi/combustion/under the beams, retrogradation and speed. Three to five sentences each. Separate the dignified planets from the debilitated ones and rank them.'
    }
  },
  {
    n: 7,
    title: { ko: '어스펙트', en: 'Aspects' },
    lead: { ko: '메이저 · 마이너 · 어스펙트 패턴', en: 'Major, minor, and the patterns they form' },
    task: {
      ko: '제공된 어스펙트 목록을 근거로 분석하라. 먼저 오브가 가장 타이트한 순으로 핵심 메이저 어스펙트 6~8개를 깊이 해석하고(어플라잉/세퍼레이팅 구분), 다음으로 의미 있는 마이너 어스펙트를 다루고, 마지막으로 발견된 어스펙트 패턴 각각의 의미와 삶에서의 작동 방식을 설명하라. 오브를 항상 함께 표기하라.',
      en: 'Work from the supplied aspect list. Take the six to eight most important major aspects in order of tightness and read them deeply, distinguishing applying from separating; then the minor aspects that carry weight; then each detected pattern and how it operates in a life. Always cite the orb.'
    }
  },
  {
    n: 8,
    title: { ko: '디스포지터 트리', en: 'Dispositor tree' },
    lead: { ko: '지배 구조의 끝에 무엇이 있는가', en: 'What sits at the end of the chain of rulership' },
    task: {
      ko: '제공된 디스포지터 체인을 근거로 행성 지배 구조 전체를 설명하라. 최종 디스포지터(Final Dispositor)가 존재하는지, 루프가 있는지, 상호수용이 있는지 밝히고, 그 결과 이 사람의 삶에서 가장 중요한 에너지가 무엇인지 결론을 내려라. 최종 디스포지터가 없거나 여러 개인 경우의 의미도 설명하라.',
      en: 'Explain the whole structure of rulership from the supplied chains. State whether a final dispositor exists, whether there is a loop, whether there is mutual reception, and conclude what single energy therefore governs this life. Explain what it means when there is no final dispositor, or more than one.'
    }
  },
  {
    n: 9,
    title: { ko: '원소 · 모드 균형', en: 'Elemental and modal balance' },
    lead: { ko: '가중치 기반 정량 분석', en: 'A weighted, quantitative reading' },
    task: {
      ko: '제공된 원소·모드·음양 비율(가중치 적용)을 정량적으로 해석하라. 과잉 원소와 결핍 원소가 각각 삶에서 어떻게 드러나는지, 결핍을 보완하는 실질적 방향은 무엇인지 제시하라. 카디널/픽스드/뮤터블 비율도 같은 방식으로 다루고, 단순 개수와 가중치 결과가 다르면 그 차이를 설명하라.',
      en: 'Read the weighted elemental, modal and polarity ratios quantitatively. Say how the dominant element and the missing element each show up in a life, and what practically compensates for the deficit. Treat the cardinal/fixed/mutable ratio the same way, and where the raw count and the weighted figure disagree, explain the discrepancy.'
    }
  },
  {
    n: 10,
    title: { ko: '강점과 약점', en: 'Strengths and weaknesses' },
    lead: { ko: '재능 · 반복 패턴 · 성공과 실패의 구조', en: 'Talent, recurring patterns, the shape of success and failure' },
    task: {
      ko: '차트 전체를 종합해 (1) 가장 큰 재능 (2) 가장 큰 약점 (3) 삶에서 반복되는 패턴 (4) 성공 방식 (5) 실패 패턴 (6) 인간관계 (7) 연애 (8) 직업 (9) 돈 (10) 건강 (11) 영성을 각각 분석하라. 항목마다 근거가 되는 차트 요소를 먼저 명시하고 결론을 쓴다. 건강은 의학적 진단이 아니라 전통 점성술의 신체 대응 관점임을 밝혀라.',
      en: 'Synthesising the whole chart, address in turn: (1) the greatest talent (2) the greatest weakness (3) the pattern that repeats (4) how success arrives (5) how failure arrives (6) friendship and family (7) romance (8) work (9) money (10) health (11) spirituality. Name the chart evidence before each conclusion. For health, state plainly that this is the traditional body-correspondence view and not a medical opinion.'
    }
  },
  {
    n: 11,
    title: { ko: '커리어', en: 'Career' },
    lead: { ko: 'MC · 10하우스 · 토성 · 태양 · 목성 · 2/6/10하우스', en: 'Midheaven, 10th, Saturn, Sun, Jupiter, and the 2nd/6th/10th' },
    task: {
      ko: 'MC, 10하우스와 그 로드, 토성, 태양, 목성, 2·6·10하우스를 종합해 가장 적합한 직업 방향을 분석하라. 구체적 직군을 3~5개 제시하되 각각 어떤 차트 근거에서 나왔는지 반드시 밝혀라. 맞지 않는 직업 환경도 함께 제시하라.',
      en: 'Combine the Midheaven, the 10th house and its lord, Saturn, the Sun, Jupiter, and the 2nd, 6th and 10th houses into a direction of work. Name three to five concrete fields, each traced back to its chart evidence. Also name the working environments that would not suit this chart.'
    }
  },
  {
    n: 12,
    title: { ko: '관계', en: 'Relationships' },
    lead: { ko: '5 · 7 · 8하우스 · 금성 · 화성 · 달 · 버텍스', en: '5th, 7th, 8th, Venus, Mars, Moon, Vertex' },
    task: {
      ko: '5·7·8하우스와 그 로드, 금성, 화성, 달, 버텍스를 함께 분석해 배우자상, 끌리는 사람의 유형, 궁합 스타일, 결혼, 이별 패턴을 설명하라. 주노·에로스·프시케는 이 계산 엔진에 포함되어 있지 않으므로 값을 추정하지 말고 "미포함"이라고 명시하고 넘어가라.',
      en: 'Read the 5th, 7th and 8th houses with their lords, together with Venus, Mars, the Moon and the Vertex, to describe the partner this chart draws, the type this person is pulled toward, how they pair, marriage, and how separations tend to unfold. Juno, Eros and Psyche are not computed by this engine — do not estimate them; state that they are not included and move on.'
    }
  },
  {
    n: 13,
    title: { ko: '카르마', en: 'Karmic axis' },
    lead: { ko: '노드 · 토성 · 카이런 · 8/12하우스 · 명왕성', en: 'Nodes, Saturn, Chiron, the 8th and 12th, Pluto' },
    task: {
      ko: '남교점, 북교점, 토성, 카이런, 12하우스, 8하우스, 명왕성을 이용해 영혼의 과제, 이번 생의 성장 방향, 반복되는 업을 분석하라. 진화점성술(Steven Forrest, Jeffrey Wolf Green) 관점을 쓰되, 이것이 검증 불가능한 형이상학적 층위임을 명시하라.',
      en: 'Using the South and North Nodes, Saturn, Chiron, the 12th and 8th houses and Pluto, read the soul task, the direction of growth in this life, and the pattern that recurs. Work in the evolutionary tradition of Steven Forrest and Jeffrey Wolf Green, and state clearly that this layer is metaphysical and not verifiable.'
    }
  },
  {
    n: 14,
    title: { ko: '타이밍', en: 'Timing' },
    lead: { ko: '프로펙션 · 솔라리턴 · 프로그레션 · 트랜짓', en: 'Profection, solar return, progressions, transits' },
    task: {
      ko: '제공된 타이밍 데이터(연간 프로펙션, 솔라리턴, 2차 프로그레션, 현재 트랜짓, 향후 트랜짓)를 근거로 향후 1년 / 3년 / 10년의 운의 흐름을 분석하라. 반드시 (1) 올해의 프로펙션 하우스와 이어로드가 무엇을 활성화하는지 (2) 솔라리턴 차트의 핵심 (3) 프로그레스드 문과 태양의 위치 변화 (4) 현재 진행 중인 느린 트랜짓 순서로 다루고, 마지막에 향후 10년의 큰 흐름을 요약하라. 데이터에 없는 미래 날짜를 지어내지 말 것.',
      en: 'Using the supplied timing data — annual profection, solar return, secondary progressions, current and upcoming transits — read the coming year, the coming three years, and the coming decade. Take them in this order: (1) what the profected house and year lord activate (2) the core of the solar return chart (3) where the progressed Moon and Sun have moved (4) the slow transits now in orb. Close with the arc of the next ten years. Do not invent dates that are not in the data.'
    }
  },
  {
    n: 15,
    title: { ko: '최종 종합', en: 'Synthesis' },
    lead: { ko: '이 차트에서 가장 중요한 요소 TOP 10', en: 'The ten things that matter most in this chart' },
    task: {
      ko: '지금까지의 분석을 종합해 "이 차트에서 가장 중요한 요소 TOP 10"을 우선순위를 매겨 제시하라. 각 항목마다 (a) 요소 (b) 왜 그 순위인지의 점성술적 근거 (c) 삶에서의 실제 의미 (d) 신뢰도를 쓴다. 그다음 가장 중요한 키워드 10개를 우선순위대로 나열하고, 마지막에 3~4문장의 총평으로 닫아라.',
      en: 'Synthesise everything into a ranked list of the ten most important factors in this chart. For each give (a) the factor (b) the astrological reason for its rank (c) what it actually means in a life (d) your confidence. Then list the ten defining keywords in priority order, and close with three or four sentences of overall judgement.'
    }
  }
];

/* ── persona ─────────────────────────────────────────────────────────── */
const PERSONA = {
  ko: (timeUnknown) => [
    '당신은 30년 이상 경력의 전문 점성술가다. 전통 점성술(Hellenistic), 현대 심리점성술, 진화점성술, 예측점성술을 모두 연구했고 William Lilly, Ptolemy, Valens, Robert Hand, Demetra George, Steven Forrest, Liz Greene의 관점을 종합해 분석한다.',
    '',
    '해석 원칙:',
    '1. 절대로 단순 성격풀이를 하지 않는다. 모든 해석은 "왜 그렇게 해석하는지" 점성술적 근거를 먼저 제시하고 결론을 낸다.',
    '2. 행성 하나만 보고 결론을 내리지 않는다. 항상 차트 전체를 종합한다.',
    '3. 먼저 점성술적으로 설명한 뒤, 필요할 때만 현대 심리학 언어로 옮긴다. 억지로 섞지 않는다.',
    '4. 강한 요소와 약한 요소를 우선순위로 제시한다.',
    '5. 각 주요 판단 끝에 신뢰도를 (신뢰도: 높음/중간/낮음) 형식으로 표기한다.',
    '6. 애매하거나 학파 간 이견이 있는 부분은 "점성술 학파마다 해석이 다를 수 있다"고 명시한다.',
    '7. 하우스 해석·삶의 영역·사건·운의 흐름·하우스 로드·프로펙션은 Whole Sign을, 행성의 실제 위치·앵글·심리적 표현·미세한 하우스 이동·인터셉션은 Placidus를 사용한다. 두 시스템이 갈리면 차이를 비교 설명한다.',
    '8. 근거 없는 추측 금지. 아래 데이터에 없는 값(주노·에로스·프시케·아스테로이드 등)은 지어내지 말고 "이 계산에 미포함"이라고 밝힌다.',
    '',
    '★ 중요: 아래 차트 데이터는 정밀 천체력으로 이미 계산이 끝난 값이다. 당신은 절대 위치를 다시 계산하거나 추정하지 않는다. 오직 주어진 수치만 근거로 해석한다.',
    timeUnknown ? '★ 출생시각이 확인되지 않아 정오로 가정했다. ASC·MC·하우스·달의 정확한 도수는 신뢰할 수 없으므로 하우스 기반 해석에는 반드시 그 한계를 명시하라.' : '',
    '',
    '문체: 한국어. 상담실에서 내담자에게 말하듯 밀도 높고 구체적으로. 소제목은 ## 또는 ###, 강조는 **굵게**, 표가 필요하면 마크다운 표. 서론·인사·요약 예고 없이 바로 본론으로 들어간다. 이모지 금지.'
  ].filter(Boolean).join('\n'),

  en: (timeUnknown) => [
    'You are a professional astrologer with more than thirty years of practice. You have studied Hellenistic astrology, modern psychological astrology, evolutionary astrology and predictive astrology, and you synthesise the approaches of William Lilly, Ptolemy, Valens, Robert Hand, Demetra George, Steven Forrest and Liz Greene.',
    '',
    'Working principles:',
    '1. Never give a generic personality sketch. State the astrological evidence first, then the conclusion it supports.',
    '2. Never conclude from a single placement. Always read the chart as a whole.',
    '3. Explain astrologically first; translate into modern psychological language only where it genuinely helps.',
    '4. Rank what is strong and what is weak rather than treating everything as equal.',
    '5. End each major judgement with a confidence marker in the form (confidence: high/medium/low).',
    '6. Where the traditions disagree, say so explicitly: "schools of astrology differ here."',
    '7. Use Whole Sign for house meaning, life domains, events, the flow of fortune, house lords and profection. Use Placidus for exact positions, angles, psychological expression, fine house shifts and interceptions. Where the two disagree, compare them.',
    '8. No unfounded guessing. Anything absent from the data below — Juno, Eros, Psyche, other asteroids — must be declared "not included in this calculation", never estimated.',
    '',
    '* Important: the chart data below has already been computed from a precision ephemeris. Do not recalculate or estimate any position. Interpret only from the figures given.',
    timeUnknown ? '* The birth time was not known, so noon was used. The Ascendant, Midheaven, house cusps and Moon degree cannot be trusted; state that limitation wherever a reading depends on houses.' : '',
    '',
    'Style: English. Dense and specific, the way you would speak to a client across the consulting table. Use ## or ### for subheadings, **bold** for emphasis, markdown tables where a table helps. Begin with the substance — no preamble, greeting or summary of what you are about to say. No emoji.'
  ].filter(Boolean).join('\n')
};

/* ── serializer ──────────────────────────────────────────────────────── */
function deg(lang, o) {
  if (!o) return null;
  return signName(lang, o.signIndex) + ' ' + o.deg + '\u00B0' + String(o.min).padStart(2, '0') + "'";
}

export function serializeChart(chart, timing, lang, includeTiming) {
  const L = {
    body: k => bodyName(lang, k),
    sign: i => signName(lang, i),
    dign: arr => (arr || []).map(k => dignityName(lang, k)).join(', ')
  };
  const out = {
    birth: chart.meta,
    sect: chart.meta.isDay ? (lang === 'ko' ? '주간 차트' : 'diurnal') : (lang === 'ko' ? '야간 차트' : 'nocturnal'),
    sectLight: L.body(chart.meta.sectLight),
    bodies: chart.bodies.map(b => ({
      body: L.body(b.key), sign: L.sign(b.signIndex),
      degree: b.deg + '\u00B0' + String(b.min).padStart(2, '0') + "'",
      longitude: +b.lon.toFixed(3), houseWholeSign: b.wsHouse, housePlacidus: b.plHouse,
      motion: b.motion === 'R' ? 'retrograde' : b.motion === 'S' ? 'stationary' : 'direct',
      dailyMotion: b.speed, dignity: L.dign(b.dignity), dignityScore: b.dignityScore,
      sunRelation: solarPhaseName(lang, b.solarPhase) || '-'
    })),
    anglesAndPoints: chart.points.filter(p => p.kind !== 'body').map(p => ({
      point: L.body(p.key), sign: L.sign(p.signIndex),
      degree: p.deg + '\u00B0' + String(p.min).padStart(2, '0') + "'",
      houseWholeSign: p.wsHouse, housePlacidus: p.plHouse
    })),
    chartRuler: chart.chartRuler && {
      ruler: L.body(chart.chartRuler.key), sign: L.sign(chart.chartRuler.signIndex),
      degree: chart.chartRuler.deg + '\u00B0' + String(chart.chartRuler.min).padStart(2, '0') + "'",
      houseWholeSign: chart.chartRuler.wsHouse, housePlacidus: chart.chartRuler.plHouse,
      dignity: L.dign(chart.chartRuler.dignity), modernRuler: L.body(chart.chartRuler.modern)
    },
    wholeSignHouses: chart.wholeHouses.map(h => ({
      house: h.house, sign: L.sign(h.signIndex), lord: L.body(h.lord), modernLord: L.body(h.lordModern),
      lordIn: h.lordSignIndex === null ? null : L.sign(h.lordSignIndex),
      lordHouseWholeSign: h.lordHouseWS, lordHousePlacidus: h.lordHousePL,
      lordDignity: L.dign(h.lordDignity), lordRetrograde: h.lordRetro,
      occupants: h.occupants.map(L.body)
    })),
    placidusHouses: chart.placidusHouses.map(h => ({
      house: h.house, cusp: L.sign(h.cuspSignIndex) + ' ' + h.cuspDeg + '\u00B0' + String(h.cuspMin).padStart(2, '0') + "'",
      spanDegrees: h.span, occupants: h.occupants.map(L.body)
    })),
    interceptedSigns: chart.intercepted.map(L.sign),
    houseSystemDifferences: chart.houseDiffs.map(d => ({
      body: L.body(d.body), wholeSign: d.whole, placidus: d.placidus,
      position: L.sign(d.signIndex) + ' ' + d.deg + '\u00B0' + String(d.min).padStart(2, '0') + "'"
    })),
    aspects: chart.aspects.map(a =>
      L.body(a.a) + ' ' + aspectName(lang, a.type) + ' ' + L.body(a.b) +
      ' (orb ' + a.orb + '\u00B0, ' + a.level + (a.applying === null ? '' : a.applying ? ', applying' : ', separating') + ')'
    ),
    aspectPatterns: chart.patterns.map(p => ({
      pattern: patternName(lang, p.type), members: p.members.map(L.body),
      apex: p.apex ? L.body(p.apex) : undefined,
      sign: p.signIndex !== undefined ? L.sign(p.signIndex) : undefined,
      element: p.element ? elementName(lang, p.element) : undefined
    })),
    dispositors: {
      chains: Object.fromEntries(Object.entries(chart.dispositors.chains).map(([k, v]) => [
        L.body(k), v.path.map(L.body).join(' -> ') + (v.final ? ' [final: ' + L.body(v.final) + ']' : v.loop ? ' [loop at ' + L.body(v.loop) + ']' : '')
      ])),
      finalDispositors: chart.dispositors.finals.map(L.body),
      mutualReception: chart.dispositors.mutualReception.map(m => L.body(m.a) + ' <-> ' + L.body(m.b) + ' (' + m.kind + ')')
    },
    balance: {
      elements: Object.fromEntries(Object.entries(chart.balance.elements).map(([k, v]) => [elementName(lang, k), v.pct + '%'])),
      modalities: Object.fromEntries(Object.entries(chart.balance.modalities).map(([k, v]) => [modalityName(lang, k), v.pct + '%'])),
      polarity: { yang: chart.balance.polarity.yang.pct + '%', yin: chart.balance.polarity.yin.pct + '%' },
      weighting: chart.balance.weighting
    }
  };

  if (includeTiming && timing) {
    const t = timing;
    out.timing = {
      calculatedAt: t.calculatedAt,
      annualProfection: {
        age: t.profection.age, profectedHouse: t.profection.house,
        sign: L.sign(t.profection.signIndex), yearLord: L.body(t.profection.yearLord),
        yearLordIn: t.profection.yearLordSignIndex === null ? null : L.sign(t.profection.yearLordSignIndex),
        yearLordHouseWholeSign: t.profection.yearLordHouseWS,
        yearLordDignity: L.dign(t.profection.yearLordDignity),
        period: t.profection.periodFrom + ' ~ ' + t.profection.periodTo,
        nextThreeYears: t.profection.threeYears.map(y => ({
          year: y.year, house: y.house, sign: L.sign(y.signIndex), lord: L.body(y.lord)
        }))
      },
      solarReturn: {
        exactUTC: t.solarReturn.exactUTC, ascendant: deg(lang, t.solarReturn.asc), midheaven: deg(lang, t.solarReturn.mc),
        placements: t.solarReturn.placements.map(p => ({
          body: L.body(p.body), position: L.sign(p.signIndex) + ' ' + p.deg + '\u00B0' + String(p.min).padStart(2, '0') + "'",
          solarReturnHouse: p.srHouse
        }))
      },
      secondaryProgressions: {
        progressedDate: t.progression.progressedDate,
        sun: deg(lang, t.progression.sun), sunHouseWholeSign: t.progression.sunHouseWS,
        moon: deg(lang, t.progression.moon), moonHouseWholeSign: t.progression.moonHouseWS,
        ascendant: deg(lang, t.progression.asc), midheaven: deg(lang, t.progression.mc),
        mercury: deg(lang, t.progression.mercury), venus: deg(lang, t.progression.venus), mars: deg(lang, t.progression.mars),
        moonPhaseAngle: t.progression.progressedNewMoonPhase
      },
      currentTransits: t.transitsNow.map(x =>
        L.body(x.transiting) + ' ' + aspectName(lang, x.aspect) + ' natal ' + L.body(x.natal) +
        ' (orb ' + x.orb + '\u00B0, transiting house ' + x.transitHouseWS + ', natal house ' + x.natalHouseWS + ')'
      ),
      upcomingTransits: t.upcoming.map(x =>
        x.year + '-' + String(x.month).padStart(2, '0') + ': ' + L.body(x.transiting) + ' ' +
        aspectName(lang, x.aspect) + ' natal ' + L.body(x.natal) + ' (natal house ' + x.natalHouseWS + ')'
      )
    };
  }
  return out;
}

/* ── prompt builder ──────────────────────────────────────────────────── */
export function buildPrompt(section, chart, timing, lang) {
  const needTiming = section.n === 14;
  const data = JSON.stringify(serializeChart(chart, timing, lang, needTiming));
  const len = lang === 'ko'
    ? (section.n === 4 ? '1400~1900자' : section.n === 15 ? '1200~1600자' : '900~1300자')
    : (section.n === 4 ? '900–1200 words' : section.n === 15 ? '800–1000 words' : '600–850 words');

  if (lang === 'ko') {
    return PERSONA.ko(chart.meta.timeUnknown) +
      '\n\n===== 차트 데이터 =====\n' + data +
      '\n\n===== 이번 과제 (섹션 ' + section.n + ': ' + section.title.ko + ') =====\n' + section.task.ko +
      '\n\n이 섹션만 작성한다. 다른 섹션 내용은 다루지 않는다. 제목("섹션 N")은 쓰지 말고 본문부터 시작한다. 분량은 ' + len + '.';
  }
  return PERSONA.en(chart.meta.timeUnknown) +
    '\n\n===== CHART DATA =====\n' + data +
    '\n\n===== THIS SECTION (' + section.n + ': ' + section.title.en + ') =====\n' + section.task.en +
    '\n\nWrite this section only; do not cover the others. Do not write a "Section N" heading — start with the substance. Length: ' + len + '.';
}
