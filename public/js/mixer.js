/* ===== mixer.js: Ambient mix engine + BGM engine + 3-way mode toggle =====
   Depends on (classic-script realm globals, declared elsewhere):
     STATE, TRACK_META, MEDIA_BASE, getLocalized, mediaObjectUrl
   Depends on DOM elements: #player, #ambientPlayer, #bgmPlayer,
     #mixPanel, #mixSlider, #triKnob, #triToggle, #ambientControls,
     #bgmControls, #ambientToggle, #ambientKnob, #ambientSliderEl,
     #bgmSlider, #bgmSelect, #genBgmSelect, #genTriKnob,
     #genTriToggle, #genAmbientControls, #genBgmControls.

   Exposes on window:
     _mixMode, setMixMode, setGenMixMode, _currentBgm, _playBgmWhenReady,
     setBgmMix, applyBgmMixToPlayer, initBgmSystem,
     setAmbMix, setFreqVol, setAmbVol, selectAmbient, onAmbientToggle,
     applyMixToPlayer.
*/

/* ══════════════════════════════════════════════════════════════════
   🌿 AMBIENT MIX ENGINE
   ══════════════════════════════════════════════════════════════════ */
(function ambientMixEngine(){
  const player = document.getElementById('player');

  const AMB = {
    ambNodes: [], active: false,
    type: 'rain', freqVol: 0.7, ambVol: 0.3,
  };

  function ambInit() {
    // AudioContext 불필요 — ambientPlayer.volume으로 직접 제어
    // (AudioContext는 iOS 화면 잠금 시 suspend되어 소리 끊김)
  }

  // ─── 자연음 샘플 URL 매핑 ──────────────────────────────
  const SUPABASE_AMB = 'https://xdjgumqdwedgzwqturcx.supabase.co/storage/v1/object/public/media';
  const AMB_SAMPLES = {
    rain:   `${SUPABASE_AMB}/_ambient/rain.mp3`,
    forest: `${SUPABASE_AMB}/_ambient/forest.mp3`,
    ocean:  `${SUPABASE_AMB}/_ambient/ocean.mp3`,
    brown:  `${SUPABASE_AMB}/White_Noise/deep_sleep_brown_noise.mp3`,
    pink:   `${SUPABASE_AMB}/_ambient/wind.mp3`,
    white:  `${SUPABASE_AMB}/_ambient/night.mp3`,
  };
  // 숲 전용 새소리 샘플 (랜덤 재생)
  const BIRD_SAMPLES = [1,2,3,4,5].map(i=>`${SUPABASE_AMB}/_ambient/bird_${i}.mp3`);
  let _birdTimer = null;
  function startBirds() {
    stopBirds();
    function scheduleNext() {
      const delay = (15 + Math.random() * 25) * 1000; // 15~40초 랜덤 간격
      _birdTimer = setTimeout(() => {
        const url = BIRD_SAMPLES[Math.floor(Math.random() * BIRD_SAMPLES.length)];
        const a = new Audio(url);
        a.volume = 0.45 + Math.random() * 0.3; // 0.45~0.75 랜덤 볼륨
        a.play().catch(()=>{});
        scheduleNext();
      }, delay);
    }
    scheduleNext();
  }
  function stopBirds() {
    if (_birdTimer) { clearTimeout(_birdTimer); _birdTimer = null; }
  }

  // <audio> 엘리먼트 스트리밍 방식 — 메모리 안전
  const _ambEl = document.getElementById('ambientPlayer');

  async function ambStart(type) {
    AMB.type = type;
    const url = AMB_SAMPLES[type] || AMB_SAMPLES.rain;

    // 볼륨 페이드아웃 — ease-out (목표에 가까울수록 천천히)
    const fadeOut = setInterval(() => {
      const cur = _ambEl.volume;
      const next = cur - cur * 0.15;  // 현재 볼륨의 15%씩 감소 (ease-out)
      _ambEl.volume = next < 0.01 ? 0 : next;
      if (_ambEl.volume <= 0) clearInterval(fadeOut);
    }, 30);

    stopBirds();
    setTimeout(async () => {
      try {
        _ambEl.pause();
        _ambEl.src = url;
        _ambEl.volume = 0;
        _ambEl.load();

        await new Promise((resolve) => {
          _ambEl.addEventListener('canplay', resolve, {once:true});
          setTimeout(resolve, 5000);
        });

        await _ambEl.play();

        // 볼륨 페이드인 — ease-out (목표에 가까울수록 천천히)
        let v = 0;
        const fadeIn = setInterval(() => {
          v += (AMB.ambVol - v) * 0.08;  // ease-out
          _ambEl.volume = v;
          if (Math.abs(AMB.ambVol - v) < 0.005) {
            _ambEl.volume = AMB.ambVol;
            clearInterval(fadeIn);
          }
        }, 30);

        if (type === 'forest') startBirds();
      } catch(e) {
        console.warn('[Ambient] play failed:', e);
      }
    }, 650);
  }

  function ambStop() {
    stopBirds();
    try { _ambEl && _ambEl.pause(); } catch(e){}
    AMB.ambNodes.forEach(n => { try { n.stop?.(); n.disconnect?.(); } catch(e){} });
    AMB.ambNodes = [];
  }

  function onAmbientToggle(on) {
    const knob   = document.getElementById('ambientKnob');
    const slider = document.getElementById('ambientSliderEl');
    const ctrls  = document.getElementById('ambientControls');
    AMB.active = on;

    if (on) {
      if (knob)   knob.style.left   = '18px';
      if (slider) slider.style.background = '#6c63ff';
      if (ctrls)  ctrls.style.display = 'flex';
      ambInit();
      // AudioContext 완전히 resume된 후 재생 (iOS 안정화)
      const _startAmb = async () => {
        if (AMB.ctx && AMB.ctx.state === 'suspended') {
          await AMB.ctx.resume();
        }
        await ambStart(AMB.type);
      };
      _startAmb().catch(e => console.warn('[Ambient toggle]', e));
    } else {
      if (knob)   knob.style.left   = '2px';
      if (slider) slider.style.background = '#333';
      if (ctrls)  ctrls.style.display = 'none';
      ambStop();
      localStorage.removeItem('ambManual'); // 수동 플래그 초기화 → 다음 트랙 자동 적용
    }
    localStorage.setItem('ambState', JSON.stringify({ on, type: AMB.type, freqVol: AMB.freqVol, ambVol: AMB.ambVol }));
  }

  // 자연음 볼륨 조절 슬라이더 (트랙 볼륨은 시스템 볼륨으로)
  function setAmbMix(v) {
    const ratio    = parseFloat(v) / 100;          // 0=트랙100% / 1=자연음100%
    AMB.ambVol     = ratio;
    AMB.freqVol    = 1 - ratio;
    if (_ambEl) _ambEl.volume  = AMB.ambVol;
    // iOS: player.volume 쓰기 불가 → 쓸 수 있을 때만 적용
    try { if (player) player.volume = Math.max(0.05, AMB.freqVol); } catch(e) {}
    localStorage.setItem('ambMix', v);
  }
  // 레거시 호환 (혹시 남은 호출)
  function setFreqVol(v) { setAmbMix(100 - v); }
  function setAmbVol(v)  { setAmbMix(v); }

  // 사용자가 수동으로 앰비언트 선택하면 manual 플래그 설정
  function selectAmbient(type, btn) {
    AMB.type = type;
    document.querySelectorAll('.amb-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    if (AMB.active) ambStart(type);
    localStorage.setItem('ambManual', 'true'); // 수동 선택 플래그
    localStorage.setItem('ambState', JSON.stringify({ on: AMB.active, type, freqVol: AMB.freqVol, ambVol: AMB.ambVol }));
  }

  // ─── 카테고리별 기본 앰비언트 매핑 ───────────────────
  const CATEGORY_AMBIENT = {
    'Chakra_Activation':        'forest',
    'Solfeggio_Frequencies':    'ocean',
    'Meditation_and_Breathwork':'rain',
    'Brainwave_States':         'pink',
    'Crystal_Frequencies':      'ocean',
    'RIFE_Frequency_Therapy':   'brown',
    'Body_Organ_Therapy':       'forest',
    'Torus_Harmonics':          'white',
    'Quantum_Torus_X':          'white',
    'Nature_Resonance':         'forest',
    'White_Noise':              null,   // 앰비언트 OFF
    'Divine_Tunes':             'rain',
  };

  // 트랙 선택 시 호출 — 카테고리에 맞는 앰비언트 타입 설정 (자동 ON 없음)
  function applyTrackAmbient(folder) {
    if (localStorage.getItem('ambManual') === 'true') return;
    const defaultType = CATEGORY_AMBIENT[folder];
    if (!defaultType) return;
    // 버튼 하이라이트만 변경 (자동 재생 X)
    AMB.type = defaultType;
    document.querySelectorAll('.amb-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.type === defaultType);
    });
    // 이미 앰비언트가 켜져 있으면 타입 교체
    if (AMB.active) ambStart(defaultType);
  }

  // 외부에서 호출 가능하도록 노출
  window.setAmbMix        = setAmbMix;
  window.setFreqVol       = setFreqVol;
  window.setAmbVol        = setAmbVol;
  window.selectAmbient    = selectAmbient;
  window.onAmbientToggle  = onAmbientToggle;
  window.applyTrackAmbient = applyTrackAmbient;
  // IIFE 밖에서 player.volume을 AMB.freqVol로 복원할 수 있도록 노출
  window.applyMixToPlayer = function() {
    if (_ambEl) _ambEl.volume = AMB.ambVol;
    try { if (player) player.volume = Math.max(0.05, AMB.freqVol); } catch(e) {}
  };

  // 저장된 설정 복원
  (function restoreAmbient() {
    try {
      const s = JSON.parse(localStorage.getItem('ambState') || '{}');
      if (s.type) {
        AMB.type = s.type;
        document.querySelectorAll('.amb-btn').forEach(b => {
          b.classList.toggle('active', b.dataset.type === s.type);
        });
      }
      // 크로스페이드 복원
      const savedMix = parseFloat(localStorage.getItem('ambMix') ?? '50') || 50;
      if (!isNaN(savedMix)) {
        const ms = document.getElementById('mixSlider');
        if (ms) ms.value = savedMix;
        setAmbMix(savedMix);
      } else if (s.freqVol != null) {
        // 레거시 호환
        const legacyMix = Math.round((1 - s.freqVol) * 100);
        const ms = document.getElementById('mixSlider');
        if (ms) ms.value = legacyMix;
        setAmbMix(legacyMix);
      }
      // ambient ON 복원은 3-way 토글(setMixMode)이 담당하므로 여기서는 생략
    } catch(e) {}
  })();
})();

/* ══════════════════════════════════════════════════════════════════
   3-Way Mix Toggle (자연음 / OFF / BGM)
   ══════════════════════════════════════════════════════════════════ */
(function threeWayMixToggle(){
  const KNOB_POS   = { amb: '3px',    off: '20px',   bgm: '35px' };
  const KNOB_COLOR = { amb: '#4ade80', off: '#333',  bgm: '#60a5fa' };

  window._mixMode = 'off'; // 'amb' | 'off' | 'bgm'

  window.setMixMode = function(mode) {
    const player = document.getElementById('player');
    window._mixMode = mode;

    // 노브 위치 + 트랙 색상 업데이트
    const knob  = document.getElementById('triKnob');
    const track = document.getElementById('triToggle');
    if (knob)  knob.style.left = KNOB_POS[mode];
    if (track) track.style.background = KNOB_COLOR[mode];

    // 패널 전환
    const ambCtrls = document.getElementById('ambientControls');
    const bgmCtrls = document.getElementById('bgmControls');
    if (ambCtrls) ambCtrls.style.display = (mode === 'amb') ? 'flex' : 'none';
    if (bgmCtrls) bgmCtrls.style.display = (mode === 'bgm') ? 'flex' : 'none';

    // ── 항상 자연음 상태를 모드에 맞게 세팅 ──
    if (mode === 'amb') {
      if (typeof window.onAmbientToggle === 'function') window.onAmbientToggle(true);
      const tog = document.getElementById('ambientToggle');
      if (tog) tog.checked = true;
    } else {
      // amb가 아니면 무조건 자연음 OFF
      if (typeof window.onAmbientToggle === 'function') window.onAmbientToggle(false);
      const tog = document.getElementById('ambientToggle');
      if (tog) tog.checked = false;
    }

    // ── 항상 BGM 상태를 모드에 맞게 세팅 ──
    const bgmP = document.getElementById('bgmPlayer');
    if (mode === 'bgm') {
      // BGM 크로스페이드 볼륨 적용
      if (typeof window.applyBgmMixToPlayer === 'function') window.applyBgmMixToPlayer();
      // BGM 소스가 설정되어 있고 메인 플레이어가 재생 중이면 BGM도 재생
      if (bgmP && window._currentBgm) {
        if (player && !player.paused) {
          if (typeof window._playBgmWhenReady === 'function') window._playBgmWhenReady();
        }
      }
    } else {
      // bgm이 아니면 무조건 BGM OFF + player 볼륨 복원
      if (bgmP) { bgmP.pause(); }
      // amb 모드면 amb 크로스페이드가 player.volume 관리, off 모드면 1.0 복원
      if (mode === 'off') {
        try { if (player) player.volume = 1.0; } catch(e) {}
      }
    }

    localStorage.setItem('mixMode', mode);
  };
})();

/* ══════════════════════════════════════════════════════════════════
   Generator Mix Mode (shares ambient/BGM players with library)
   ══════════════════════════════════════════════════════════════════ */
window._genMixMode = 'off';
window.setGenMixMode = function setGenMixMode(mode) {
  window._genMixMode = mode;
  const knob = document.getElementById('genTriKnob');
  const track = document.getElementById('genTriToggle');
  const KNOB_POS   = { amb: '3px',    off: '20px',   bgm: '35px' };
  const KNOB_COLOR = { amb: '#4ade80', off: '#333',  bgm: '#60a5fa' };
  if (knob)  knob.style.left = KNOB_POS[mode];
  if (track) track.style.background = KNOB_COLOR[mode];

  const ambCtrls = document.getElementById('genAmbientControls');
  const bgmCtrls = document.getElementById('genBgmControls');
  if (ambCtrls) ambCtrls.style.display = (mode === 'amb') ? 'flex' : 'none';
  if (bgmCtrls) bgmCtrls.style.display = (mode === 'bgm') ? 'flex' : 'none';

  // Delegate to the shared setMixMode
  if (typeof window.setMixMode === 'function') window.setMixMode(mode);
};

// Populate generator BGM select from same candidates as library
function populateGenBgmSelect() {
  const genSel = document.getElementById('genBgmSelect');
  const libSel = document.getElementById('bgmSelect');
  if (!genSel || !libSel) return;
  genSel.innerHTML = libSel.innerHTML;
  genSel.value = libSel.value;
  genSel.addEventListener('change', e => {
    // Sync with library BGM select
    libSel.value = e.target.value;
    libSel.dispatchEvent(new Event('change'));
  });
}
document.addEventListener('DOMContentLoaded', () => setTimeout(populateGenBgmSelect, 2000));

/* ══════════════════════════════════════════════════════════════════
   BGM (Divine Tunes) Engine
   ══════════════════════════════════════════════════════════════════ */
(function bgmEngine(){
  let BGM_CANDIDATES = [];
  window._currentBgm = null;
  const bgmPlayer = document.getElementById('bgmPlayer');
  const player = document.getElementById('player');

  function buildBgmCandidates() {
    if (!window.TRACK_META && typeof TRACK_META === 'undefined') return;
    const meta = window.TRACK_META || TRACK_META;
    BGM_CANDIDATES = Object.entries(meta)
      .filter(([key, v]) =>
        key.startsWith('Divine_Tunes/') &&
        !key.endsWith('/_folder') &&
        v
      )
      .map(([key, v]) => {
        const parts = key.split('/');
        const folder = parts.slice(0, -1).join('/');
        const file = parts[parts.length - 1]; // 키 자체에 확장자 포함 (mp3/flac)
        const baseName = file.replace(/\.[^.]+$/, '');
        return {
          key,
          title: (typeof getLocalized === 'function')
            ? (getLocalized(v, 'title') || baseName.replace(/[_\-]+/g, ' '))
            : (v.title_ko || v.title_en || baseName.replace(/[_\-]+/g, ' ')),
          url: (typeof mediaObjectUrl === 'function')
            ? mediaObjectUrl(folder, file)
            : `${MEDIA_BASE}/${encodeURIComponent(folder)}/${encodeURIComponent(file)}`,
        };
      });
  }

  function setBgmSource(candidate) {
    if (!bgmPlayer) return;
    if (!candidate) {
      bgmPlayer.pause();
      bgmPlayer.removeAttribute('src');
      bgmPlayer.load();
      window._currentBgm = null;
      return;
    }
    window._currentBgm = candidate;
    bgmPlayer.src = candidate.url;
  }

  function populateBgmSelect() {
    const sel = document.getElementById('bgmSelect');
    if (!sel) return;
    sel.innerHTML = '';
    BGM_CANDIDATES.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.key;
      opt.textContent = c.title;
      sel.appendChild(opt);
    });

    // localStorage에서 마지막 선택 복원, 없으면 첫 곡 선택
    const savedKey = localStorage.getItem('bgmKey');
    const found = savedKey ? BGM_CANDIDATES.find(c => c.key === savedKey) : null;
    const initial = found || BGM_CANDIDATES[0] || null;
    if (initial) {
      sel.value = initial.key;
      setBgmSource(initial);
      localStorage.setItem('bgmKey', initial.key);
    }

    sel.addEventListener('change', e => {
      const key = e.target.value;
      const cand = BGM_CANDIDATES.find(c => c.key === key);
      if (!cand) return;
      setBgmSource(cand);
      localStorage.setItem('bgmKey', key);

      // BGM 모드이면 로드 완료 후 재생 (Divine_Tunes 폴더 제외)
      if (window._mixMode === 'bgm') {
        playBgmWhenReady();
      }
    });
  }

  // BGM 로드 후 재생하는 공통 함수
  function playBgmWhenReady() {
    if (!bgmPlayer || !window._currentBgm) return;
    const STATE_ = window.STATE || (typeof STATE !== 'undefined' ? STATE : null);
    const _f = (STATE_ && STATE_.currentTrack && STATE_.currentTrack.folder) || '';
    if (_f.startsWith('Divine_Tunes')) return;

    bgmPlayer.load();
    bgmPlayer.addEventListener('canplay', function _bp() {
      bgmPlayer.removeEventListener('canplay', _bp);
      bgmPlayer.currentTime = 0;
      bgmPlayer.play().catch(e => console.warn('[BGM] play failed:', e));
    }, { once: true });
  }

  // 외부에서 호출 가능하도록 노출
  window._playBgmWhenReady = function() { playBgmWhenReady(); };

  // BGM 크로스페이드 믹스: 0=트랙100%+BGM0%, 100=트랙5%+BGM100%
  function setBgmMix(v) {
    const ratio = parseFloat(v) / 100;
    const bgmVol  = ratio;
    const trkVol  = 1 - ratio;
    if (bgmPlayer) bgmPlayer.volume = bgmVol;
    try { if (player) player.volume = Math.max(0.05, trkVol); } catch(e) {}
    localStorage.setItem('bgmMix', v);
  }
  window.setBgmMix = setBgmMix;

  // BGM 모드 진입 시 크로스페이드 볼륨을 player에 적용하는 함수
  window.applyBgmMixToPlayer = function() {
    const saved = parseFloat(localStorage.getItem('bgmMix') ?? '30') || 30;
    setBgmMix(saved);
  };

  function initBgmVolume() {
    const bgmSlider = document.getElementById('bgmSlider');
    if (!bgmSlider || !bgmPlayer) return;

    const saved = parseFloat(localStorage.getItem('bgmMix') ?? '30') || 30;
    bgmSlider.value = saved;
    setBgmMix(saved);

    bgmSlider.addEventListener('input', e => {
      setBgmMix(e.target.value);
    });
  }

  // 외부에서 호출할 초기화 함수
  window.initBgmSystem = function() {
    buildBgmCandidates();
    populateBgmSelect();
    initBgmVolume();
  };
})();
