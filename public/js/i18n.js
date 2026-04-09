/* ===== i18n.js: 다국어 데이터 및 언어 적용 함수 ===== */

let LANG = (document.documentElement.lang === 'en' ? 'en' : 'ko');

const I18N = {
  'ko': {
    'tab.library':'라이브러리', 'tab.generator':'주파수 생성기',
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
    'tab.akashic':'아카식 AI',
    'tab.ce5':'CE5',
    'gen.splash.subtitle':'주파수 · 파형 · 하모닉스 신디사이저',
    'gen.intro.title':'주파수 생성기',
    'gen.intro.tag':'소개 · 빠른 매뉴얼',
    'gen.intro.s1.title':'주파수 생성기란?',
    'gen.intro.s1.p1':'정확한 주파수와 파형을 생성하는 디지털 신디사이저입니다. 1Hz부터 20kHz까지, 사인·사각·삼각·톱니파를 자유롭게 만들고 명상·치유·집중에 활용할 수 있습니다.',
    'gen.intro.s1.p2':'바이노럴 비트, 듀얼 톤, 하모닉스 등 고급 모드를 지원하며 WAV 파일로 내보낼 수 있습니다.',
    'gen.intro.s2.title':'주요 기능',
    'gen.intro.s2.p1':'• 주파수 슬라이더 / 다이얼 / 키패드 입력\n• 4가지 파형: 사인, 사각, 삼각, 톱니\n• 하모닉스 (배음 추가)\n• 바이노럴 비트 (좌우 채널 분리)\n• 듀얼 톤 (두 주파수 동시 재생)\n• WAV 파일 내보내기\n• 프리셋 저장/불러오기\n• 오실로스코프 실시간 시각화',
    'gen.intro.s3.title':'빠른 사용법',
    'gen.intro.s3.p1':'1. 주파수 입력 (슬라이더 또는 숫자 입력)\n2. 파형 선택 (Sine 권장)\n3. 게인 조절\n4. 재생 버튼 클릭\n5. (선택) 하모닉스/바이노럴 활성화\n6. 마음에 들면 프리셋 저장 또는 WAV 내보내기',
    'gen.intro.s4.title':'추천 주파수',
    'gen.intro.s4.p1':'• 7.83Hz — 슈만 공명 (지구 주파수)\n• 136.1Hz — OM (옴, 우주 진동)\n• 432Hz — 자연 조율 주파수\n• 528Hz — 사랑/DNA 복구\n• 963Hz — 송과체 활성화\n• 40Hz — 감마파 (집중력)\n• 174Hz — 통증 완화',
    'gen.intro.enter':'생성기 시작하기',
    'output.normal':'노멀',
    'player.trackInfo':'트랙 정보',
    'menu.revision':'업데이트 내역',
    'amb.vol':'자연음', 'amb.rain':'빗소리', 'amb.forest':'숲', 'amb.ocean':'파도',
    'amb.brown':'브라운', 'amb.wind':'바람', 'amb.night':'밤소리'
  },
  'en': {
    'tab.library':'Library', 'tab.generator':'Generator',
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
    'tab.akashic':'Akashic AI',
    'tab.ce5':'CE5',
    'gen.splash.subtitle':'Frequency · Waveform · Harmonics Synthesizer',
    'gen.intro.title':'Frequency Generator',
    'gen.intro.tag':'Introduction · Quick Manual',
    'gen.intro.s1.title':'What is the Frequency Generator?',
    'gen.intro.s1.p1':'A digital synthesizer that generates precise frequencies and waveforms. From 1Hz to 20kHz, create sine, square, triangle, and sawtooth waves freely for meditation, healing, and focus.',
    'gen.intro.s1.p2':'Supports advanced modes including binaural beats, dual-tone, and harmonics, with WAV export.',
    'gen.intro.s2.title':'Key Features',
    'gen.intro.s2.p1':'• Frequency slider / dial / keypad input\n• 4 waveforms: Sine, Square, Triangle, Sawtooth\n• Harmonics (overtone addition)\n• Binaural beats (L/R channel separation)\n• Dual tone (two frequencies simultaneously)\n• WAV file export\n• Preset save / load\n• Real-time oscilloscope visualization',
    'gen.intro.s3.title':'Quick Guide',
    'gen.intro.s3.p1':'1. Enter frequency (slider or number input)\n2. Select waveform (Sine recommended)\n3. Adjust gain\n4. Click play button\n5. (Optional) Activate harmonics / binaural\n6. Save preset or export WAV when satisfied',
    'gen.intro.s4.title':'Recommended Frequencies',
    'gen.intro.s4.p1':'• 7.83Hz — Schumann Resonance (Earth frequency)\n• 136.1Hz — OM (cosmic vibration)\n• 432Hz — Natural tuning frequency\n• 528Hz — Love / DNA repair\n• 963Hz — Pineal gland activation\n• 40Hz — Gamma waves (focus)\n• 174Hz — Pain relief',
    'gen.intro.enter':'Start Generator',
    'output.normal':'Normal',
    'player.trackInfo':'Track Info',
    'menu.revision':'Revision Info',
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
