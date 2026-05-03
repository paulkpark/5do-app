/* ===== i18n.js: 다국어 데이터 및 언어 적용 함수 ===== */

// Initial LANG:
// 1) If user manually picked a language before, honor it (localStorage 'userLang')
// 2) Otherwise use the HTML lang hint (document.documentElement.lang)
// The IP-based auto-detect runs at boot and may override before first paint.
let LANG = (function initialLang() {
  try {
    const saved = localStorage.getItem('userLang');
    if (saved === 'ko' || saved === 'en') return saved;
  } catch (_) {}
  return (document.documentElement.lang === 'en' ? 'en' : 'ko');
})();

// IP-based auto-detect. Resolves to 'ko' | 'en' | null.
//   - null: user has an explicit saved preference → don't auto-override
//   - 'ko': client IP in Korea
//   - 'en': any other country (also the fallback on error / unknown)
// Uses Cloudflare's public trace endpoint (CORS-open, no rate limit, no key).
async function detectLangByIp() {
  try {
    if (localStorage.getItem('userLang')) return null; // respect user choice
  } catch (_) {}
  try {
    const res = await fetch('https://www.cloudflare.com/cdn-cgi/trace', {
      cache: 'no-store',
      mode: 'cors',
    });
    if (!res.ok) throw new Error('trace http ' + res.status);
    const txt = await res.text();
    const m = txt.match(/^loc=([A-Z]{2})/m);
    const country = m ? m[1] : '';
    return country === 'KR' ? 'ko' : 'en';
  } catch (_) {
    // Last-resort fallback: navigator.language
    const nav = (navigator.language || navigator.userLanguage || '').toLowerCase();
    return nav.startsWith('ko') ? 'ko' : 'en';
  }
}
window.detectLangByIp = detectLangByIp;

const I18N = {
  'ko': {
    'tab.library':'주파수 트랙', 'tab.generator':'주파수 생성기',
    'genSub.gen':'주파수 생성기', 'genSub.meter':'주파수 측정기',
    'menu.shop':'Shop', 'menu.faq':'FAQ', 'menu.manual':'매뉴얼',
    'menu.contact':'연락처', 'menu.about':'소개', 'menu.backdrop':'백드롭',
    'player.play':'재생', 'player.pause':'일시정지', 'player.loop':'반복',
    'player.timer':'타이머', 'player.playlists':'플레이리스트',
    'play':'재생', 'stop':'정지',
    'preset_save':'프리셋 저장', 'preset_load':'프리셋 불러오기…',
    'preset_overwrite':'덮어쓰기', 'preset_rename':'이름변경',
    'preset_delete':'삭제', 'preset_export':'내보내기', 'preset_import':'가져오기',
    'gen.waveform':'파형', 'gen.frequency':'주파수 (Hz)', 'gen.duty':'동작 비율',
    'gen.output':'출력', 'gen.gain':'게인', 'gen.soft_limiter':'소프트 리미터',
    'gen.export_dur':'길이(초)', 'gen.fade_in':'페이드 인(초)', 'gen.fade_out':'페이드 아웃(초)',
    'gen.export_wav':'WAV 저장', 'gen.export_use_dual':'듀얼톤 반영',
    'gen.wave.sine':'사인파', 'gen.wave.square':'사각파',
    'gen.wave.triangle':'삼각파', 'gen.wave.saw':'톱니파',
    'gen.binaural':'바이노럴', 'gen.diff':'차이(Hz)',
    'gen.quick_presets':'퀵 프리셋', 'gen.presets':'프리셋',
    'qp.528':'528 Hz', 'qp.432':'432 Hz', 'qp.174':'174 솔페지오',
    'qp.schumann':'슈만 공명', 'qp.gamma40':'감마 40',
    'harmonics_label':'하모닉스', 'harmonics_enable':'활성화', 'harmonics_base':'기준',
    'harm_base_fund':'기본 주파수', 'harm_base_mid':'중간 (x2)', 'harm_base_high':'고역 (x4)',
    'harm_octaves':'옥타브 수',
    'harm_mode':'모드',
    'harm_mode_octave':'옥타브 스택 (×2, ×4, ×8…)',
    'harm_mode_h11':'11차 배음 (Holland OPEF)',
    'harm_h11_gain':'11× 게인',
    'harm_h11_info':'ⓘ 11차 배음이란? · OPEF 연구 배경',
    'dual.label':'듀얼 톤 믹서', 'dual.toneA':'톤 A (Hz)', 'dual.toneB':'톤 B (Hz)',
    'dual.play':'듀얼 재생', 'dual.stop':'정지',
    'osc.color.neonBlue':'네온 블루', 'osc.color.aqua':'아쿠아',
    'osc.color.green':'네온 그린', 'osc.color.amber':'앰버',
    'osc.color.magenta':'마젠타', 'osc.color.white':'화이트',
    'pl.no':'플레이리스트가 없습니다. 생성해 주세요.', 'pl.new':'새 목록',
    'pl.delete':'삭제', 'pl.save':'저장', 'pl.import':'가져오기',
    'pl.export':'내보내기', 'pl.close':'닫기',
    'pl.addCurrent':'현재 트랙 추가', 'pl.removeTrack':'삭제',
    'search.placeholder':'검색어', 'search.mode.folder':'폴더',
    'search.mode.track':'곡명', 'search.btn.search':'검색', 'search.btn.clear':'지우기',
    'filter.favOnly':'★ 즐겨찾기만',
    'menu.theme':'테마',
    'bd.title':'테마', 'bd.choose':'테마 선택',
    'bd.backdrop_opacity':'백드롭 투명도', 'bd.ui_opacity':'앱 레이어 투명도',
    'gen.mode.single':'싱글', 'gen.mode.binaural':'바이노럴', 'gen.mode.dual':'듀얼',
    'gen.panel.freq':'주파수 / 파형', 'gen.panel.harm':'하모닉스',
    'gen.panel.output':'출력 / 게인', 'gen.panel.export':'내보내기 / 프리셋',
    'gen.osc.color':'오실로스코프 색상',
    'amb.label':'자연음 믹스',
    'tab.akashic':'소울 코드',
    'tab.ce5':'가이드 명상',
    'tab.cosmic':'코스믹 모니터',
    'tab.biofield':'바이오피드백',
    'gen.splash.subtitle':'주파수 · 파형 · 하모닉스 · 실시간 측정',
    'gen.intro.title':'주파수 생성기 + 측정기',
    'gen.intro.subtitle':'소리를 만들고, 그 자리에서 측정까지',
    'gen.intro.tag':'소개 · 빠른 매뉴얼 · v4.2',
    'gen.intro.s1.title':'두 가지 도구, 하나의 탭',
    'gen.intro.s1.p1':'상단 서브탭으로 두 도구를 바로 전환합니다. 주파수 생성기로는 1Hz~20kHz 범위의 신호를 직접 만들고, 주파수 측정기로는 내장 마이크를 통해 들어오는 소리의 기본 주파수를 실시간으로 분석합니다.',
    'gen.intro.s1.p2':'생성기에서 만든 주파수를 측정기로 즉석에서 검증하거나, 악기·튜닝 포크·싱잉볼 등 외부 소리의 정확한 주파수를 확인할 수 있어요.',
    'gen.intro.s2.title':'주파수 생성기 기능',
    'gen.intro.s2.p1':'• 주파수 슬라이더 / 다이얼 / 키패드 입력\n• 4가지 파형: 사인, 사각, 삼각, 톱니\n• 하모닉스 — 옥타브 스택 또는 11차 배음 (Holland OPEF) 모드 (NEW v4.2)\n• 바이노럴 비트 (좌우 채널 분리)\n• 듀얼 톤 (두 주파수 동시 재생)\n• L/R 밸런스 슬라이더 — 좌·우 채널 비율 실시간 조절\n• WAV 파일 내보내기 (밸런스 반영)\n• 프리셋 저장/불러오기\n• 오실로스코프 실시간 시각화',
    'gen.intro.s3.title':'주파수 측정기 기능',
    'gen.intro.s3.p1':'• 내장 마이크 실시간 분석 (30Hz ~ 2kHz)\n• 자기상관(autocorrelation) 피치 디텍터\n• 3대 리드아웃: Hz · 음(A4 등) · 튜닝 편차(cents)\n• 튜너 니들 — ±10¢ 이내 녹색 "튜닝 완료"\n• Peak-normalize 오실로스코프 (자동 스케일)\n• 로그 스케일 스펙트럼 (20Hz~5kHz, 72 bars)\n• 오디오는 로컬 브라우저에서만 처리 · 서버 미전송',
    'gen.intro.s4.title':'빠른 사용법',
    'gen.intro.s4.p1':'1. 생성기에서 주파수 입력 → 파형 선택 → 재생\n2. 측정기 서브탭 탭 → 측정 시작 → 마이크 허용\n3. 자동으로 오실로스코프 + Hz + 음 + cents 실시간 표시\n4. 튜너 니들이 녹색이면 정확히 튜닝된 상태\n5. (선택) 프리셋 저장 또는 WAV 내보내기',
    'gen.intro.s5.title':'추천 주파수',
    'gen.intro.s5.p1':'• 7.83Hz — 슈만 공명 (지구 주파수)\n• 136.1Hz — OM (옴, 우주 진동)\n• 432Hz — 자연 조율 주파수\n• 528Hz — 사랑/DNA 복구\n• 963Hz — 송과체 활성화\n• 40Hz — 감마파 (집중력)\n• 174Hz — 통증 완화',
    'gen.intro.enter':'시작하기',
    'output.normal':'노멀',
    'player.trackInfo':'트랙 정보',
    'menu.revision':'업데이트 내역',
    'menu.language':'언어',
    'amb.vol':'자연음', 'amb.rain':'빗소리', 'amb.forest':'숲', 'amb.ocean':'파도',
    'amb.brown':'브라운', 'amb.wind':'바람', 'amb.night':'밤소리'
  },
  'en': {
    'tab.library':'Tracks', 'tab.generator':'Generator',
    'genSub.gen':'Generator', 'genSub.meter':'Meter',
    'menu.shop':'Shop', 'menu.faq':'FAQ', 'menu.manual':'Manual',
    'menu.contact':'Contact', 'menu.about':'About', 'menu.backdrop':'Backdrop',
    'player.play':'Play', 'player.pause':'Pause', 'player.loop':'Loop',
    'player.timer':'Timer', 'player.playlists':'Playlists',
    'play':'Play', 'stop':'Stop',
    'preset_save':'Save Preset', 'preset_load':'Load Preset…',
    'preset_overwrite':'Overwrite', 'preset_rename':'Rename',
    'preset_delete':'Delete', 'preset_export':'Export', 'preset_import':'Import',
    'gen.waveform':'Waveform', 'gen.frequency':'Freq.(Hz)', 'gen.duty':'Duty Cycle',
    'gen.output':'Output', 'gen.gain':'Gain', 'gen.soft_limiter':'Soft Limiter',
    'gen.export_dur':'Duration(s)', 'gen.fade_in':'Fade In(s)', 'gen.fade_out':'Fade Out(s)',
    'gen.export_wav':'Download WAV', 'gen.export_use_dual':'Use Dual-Tone',
    'gen.wave.sine':'Sine', 'gen.wave.square':'Square',
    'gen.wave.triangle':'Triangle', 'gen.wave.saw':'Saw',
    'gen.binaural':'Binaural', 'gen.diff':'Gap(Hz)',
    'gen.quick_presets':'Quick Presets', 'gen.presets':'Presets',
    'qp.528':'528 Hz', 'qp.432':'432 Hz', 'qp.174':'174 Solfeggio',
    'qp.schumann':'Schumann', 'qp.gamma40':'Gamma 40',
    'harmonics_label':'Harmonics', 'harmonics_enable':'Enable', 'harmonics_base':'Base',
    'harm_base_fund':'Fundamental', 'harm_base_mid':'Mid (x2)', 'harm_base_high':'High (x4)',
    'harm_octaves':'Octaves',
    'harm_mode':'Mode',
    'harm_mode_octave':'Octave Stack (×2, ×4, ×8…)',
    'harm_mode_h11':'11th Harmonic (Holland OPEF)',
    'harm_h11_gain':'11× Gain',
    'harm_h11_info':'ⓘ What is the 11th harmonic? · OPEF background',
    'dual.label':'Dual-Tone Mixer', 'dual.toneA':'Tone A (Hz)', 'dual.toneB':'Tone B (Hz)',
    'dual.play':'Play Dual', 'dual.stop':'Stop',
    'osc.color.neonBlue':'Neon Blue', 'osc.color.aqua':'Aqua',
    'osc.color.green':'Neon Green', 'osc.color.amber':'Amber',
    'osc.color.magenta':'Magenta', 'osc.color.white':'White',
    'pl.no':'No playlists. Create one.', 'pl.new':'New List',
    'pl.delete':'Delete', 'pl.save':'Save', 'pl.import':'Import',
    'pl.export':'Export', 'pl.close':'Close',
    'pl.addCurrent':'Add Current Track', 'pl.removeTrack':'Remove',
    'search.placeholder':'Search', 'search.mode.folder':'Folder',
    'search.mode.track':'Track', 'search.btn.search':'Search', 'search.btn.clear':'Clear',
    'filter.favOnly':'★ Favorites Only',
    'menu.theme':'Theme',
    'bd.title':'Theme', 'bd.choose':'Choose a theme',
    'bd.backdrop_opacity':'Backdrop Opacity', 'bd.ui_opacity':'UI Opacity',
    'gen.mode.single':'Single', 'gen.mode.binaural':'Binaural', 'gen.mode.dual':'Dual',
    'gen.panel.freq':'Frequency / Waveform', 'gen.panel.harm':'Harmonics',
    'gen.panel.output':'Output / Gain', 'gen.panel.export':'Export / Presets',
    'gen.osc.color':'Oscilloscope Color',
    'amb.label':'Nature Mix',
    'tab.akashic':'Soul Code',
    'tab.ce5':'Guided Meditation',
    'tab.cosmic':'Cosmic Monitor',
    'tab.biofield':'Biofeedback',
    'gen.splash.subtitle':'Frequency · Waveform · Harmonics · Live Measurement',
    'gen.intro.title':'Frequency Generator + Meter',
    'gen.intro.subtitle':'Make sound, and measure it on the spot',
    'gen.intro.tag':'Introduction · Quick Manual · v4.2',
    'gen.intro.s1.title':'Two tools, one tab',
    'gen.intro.s1.p1':"The sub-tab strip at the top switches between the two tools. The Frequency Generator produces signals from 1 Hz to 20 kHz; the Frequency Meter analyses the fundamental frequency of whatever the built-in mic picks up, in real time.",
    'gen.intro.s1.p2':"You can verify your generator output by measuring it immediately, or check the exact pitch of instruments, tuning forks, singing bowls, or any ambient sound.",
    'gen.intro.s2.title':'Generator features',
    'gen.intro.s2.p1':'• Frequency slider / dial / keypad input\n• 4 waveforms: Sine, Square, Triangle, Sawtooth\n• Harmonics — Octave Stack or 11th Harmonic (Holland OPEF) mode (NEW in v4.2)\n• Binaural beats (L/R channel separation)\n• Dual tone (two frequencies simultaneously)\n• L/R balance slider — real-time left/right channel ratio\n• WAV file export (balance preserved)\n• Preset save / load\n• Real-time oscilloscope visualization',
    'gen.intro.s3.title':'Meter features',
    'gen.intro.s3.p1':'• Built-in-mic live analysis (30 Hz – 2 kHz)\n• Autocorrelation pitch detector\n• Three readouts: Hz · Note (e.g., A4) · Cents deviation\n• Tuner needle — green "in tune" within ±10¢\n• Peak-normalized oscilloscope (auto-scaling)\n• Log-scale spectrum (20 Hz – 5 kHz, 72 bars)\n• Audio processed locally — never sent to any server',
    'gen.intro.s4.title':'Quick Guide',
    'gen.intro.s4.p1':'1. In Generator: enter frequency → select waveform → play\n2. Switch to Meter sub-tab → Start → allow microphone\n3. Oscilloscope + Hz + Note + cents update in real time\n4. Green needle = tuning is spot-on\n5. (Optional) Save preset or export WAV',
    'gen.intro.s5.title':'Recommended Frequencies',
    'gen.intro.s5.p1':'• 7.83Hz — Schumann Resonance (Earth frequency)\n• 136.1Hz — OM (cosmic vibration)\n• 432Hz — Natural tuning frequency\n• 528Hz — Love / DNA repair\n• 963Hz — Pineal gland activation\n• 40Hz — Gamma waves (focus)\n• 174Hz — Pain relief',
    'gen.intro.enter':'Get Started',
    'output.normal':'Normal',
    'player.trackInfo':'Track Info',
    'menu.revision':'Revision Info',
    'menu.language':'Language',
    'amb.vol':'Nature', 'amb.rain':'Rain', 'amb.forest':'Forest', 'amb.ocean':'Ocean',
    'amb.brown':'Brown', 'amb.wind':'Wind', 'amb.night':'Night'
  }
};

function getLoadingThumbUrl() {
  return (LANG === 'en')
    ? MEDIA_BASE + '/_system/loading_E.webp'
    : MEDIA_BASE + '/_system/loading.webp';
}

function setStatusThumb(el, url) {
  if (!el) return;
  el.style.backgroundImage = `url("${url}")`;
  el.style.backgroundSize = 'cover';
  el.style.backgroundPosition = 'center';
  el.style.backgroundRepeat = 'no-repeat';
}
window.setStatusThumb = setStatusThumb;

const ONLY_WHEN_BLANK = false;

function refreshLoadingThumbForLang(force = true) {
  const el = document.getElementById('statusThumb');
  if (!el) return;
  if (el.dataset.thumbMode && el.dataset.thumbMode !== 'loading') return;
  let url = getLoadingThumbUrl();
  if (force) {
    const sep = url.includes('?') ? '&' : '?';
    url = url + sep + 'lang=' + encodeURIComponent(LANG) + '&v=' + Date.now();
  }
  el.dataset.thumbMode = 'loading';
  el.classList.add('status-blank');
  el.style.backgroundImage = 'none';
  requestAnimationFrame(() => setStatusThumb(el, url));
}

function applyLang() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const val = I18N[LANG] && I18N[LANG][key];
    if (!val) return;
    const tag = el.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') el.value = val;
    else el.textContent = val;
  });

  // Icon-only tabs / icon buttons that need localized aria-label + title
  // without wiping their inner SVG.
  document.querySelectorAll('[data-tip-i18n]').forEach(el => {
    const key = el.getAttribute('data-tip-i18n');
    const val = I18N[LANG] && I18N[LANG][key];
    if (!val) return;
    el.setAttribute('aria-label', val);
    el.setAttribute('title', val);
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    const val = I18N[LANG] && I18N[LANG][key];
    if (val) el.placeholder = val;
  });

  const plTitle  = document.getElementById('plTitle');
  const plNewBtn = document.getElementById('plNewBtn');
  const plImport = document.getElementById('plImportBtn');
  const plExport = document.getElementById('plExportBtn');
  const plClose  = document.getElementById('plCloseBtn');
  const plSave   = document.getElementById('plSaveBtn');
  if (plTitle)  plTitle.textContent  = (LANG==='en' ? 'Playlists' : '플레이리스트');
  if (plNewBtn) plNewBtn.textContent = (LANG==='en' ? '+ New' : '+ 새 목록');
  if (plImport) plImport.textContent = (LANG==='en' ? 'Import' : '가져오기');
  if (plExport) plExport.textContent = (LANG==='en' ? 'Export' : '내보내기');
  if (plClose)  plClose.textContent  = (LANG==='en' ? 'Close' : '닫기');
  if (plSave)   plSave.textContent   = (LANG==='en' ? 'Save' : '저장');

  try {
    const playerEl      = document.getElementById('player');
    const statusThumbEl = document.getElementById('statusThumb');
    if (playerEl && playerEl.src && statusThumbEl) {
      const base = MEDIA_BASE + '/';
      if (playerEl.src.startsWith(base)) {
        const rel    = decodeURIComponent(playerEl.src.slice(base.length));
        const parts  = rel.split('/');
        const file   = parts.pop();
        const folder = parts.join('/');
        const thumbUrl = trackThumb(folder, file);
        if (thumbUrl) {
          statusThumbEl.classList.remove('status-blank');
          statusThumbEl.dataset.thumbMode = 'track';
          setStatusThumb(statusThumbEl, thumbUrl);
        }
        const baseTitle = stem(file).replace(/[_\-]+/g, ' ');
        const meta = lookupTrackMeta(folder, file);
        let title = baseTitle, desc = '', composer = '';
        if (meta) {
          title    = getLocalized(meta, 'title') || baseTitle;
          desc     = getLocalized(meta, 'desc');
          composer = meta.composer || getLocalized(meta, 'composer') || '';
        }
        if (typeof statusTitle !== 'undefined' && statusTitle) {
          statusTitle.textContent = title;
          statusTitle.classList.add('playing');
        }
        if (typeof infoTitle !== 'undefined' && infoTitle) infoTitle.textContent = title;
        if (typeof infoBody !== 'undefined' && infoBody) {
          const parts2 = [];
          if (desc) parts2.push(desc);
          if (composer) parts2.push(LANG === 'ko' ? `작곡: ${composer}` : `Composer: ${composer}`);
          infoBody.textContent = parts2.join(' · ');
        }
      }
    }
  } catch(e) { console.warn('[applyLang] refresh failed', e); }

  try {
    const st = document.getElementById('statusThumb');
    if (st && typeof window.setStatusThumb === 'function') {
      st.removeAttribute('data-loaded');
      let srcThumb = null;
      if (window.CURRENT_TRACK && CURRENT_TRACK.path && CURRENT_TRACK.file && typeof trackThumb === 'function') {
        srcThumb = trackThumb(CURRENT_TRACK.path, CURRENT_TRACK.file);
      } else {
        const playerEl = document.getElementById('player');
        const base = (typeof MEDIA_BASE === 'string') ? (MEDIA_BASE + '/') : '';
        if (playerEl && playerEl.src && base && playerEl.src.startsWith(base) && typeof trackThumb === 'function') {
          const rel = decodeURIComponent(playerEl.src.slice(base.length));
          const pts = rel.split('/');
          const f = pts.pop();
          const fo = pts.join('/');
          if (fo && f) srcThumb = trackThumb(fo, f);
        }
      }
      if (!srcThumb) srcThumb = getLoadingThumbUrl();
      st.style.backgroundImage = 'none';
      requestAnimationFrame(() => window.setStatusThumb(st, srcThumb));
    } else {
      refreshLoadingThumbForLang(true);
    }
  } catch(e) { console.warn('[applyLang] statusThumb rebind failed', e); }

  if (typeof renderPL === 'function') {
    const plPanelEl = document.getElementById('plPanel');
    if (plPanelEl && plPanelEl.style.display !== 'none') renderPL();
  }
}
