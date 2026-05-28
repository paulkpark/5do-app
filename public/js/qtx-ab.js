// ─── QTX A/B Comparison Engine (v2 — dedicated audio element) ───
// Uses a separate <audio id="qtxAbAudio"> inside the modal so:
//   1. The main player's state (track, src, time, paused) is never touched
//   2. The main player's 404 QTX-fallback handler never fires & interferes
//   3. Missing _qtx files produce a friendly message instead of silent revert
// The main player is paused while A/B runs and resumed exactly as it was.
(function qtxAbEngine() {
  const btn = document.getElementById('qtxInfoBtn');
  const backdrop = document.getElementById('qtxAbBackdrop');
  const closeBtn = document.getElementById('qtxAbClose');
  const toggleBtn = document.getElementById('qtxAbToggleBtn');
  const cardNormal = document.getElementById('qtxAbCardNormal');
  const cardQtx = document.getElementById('qtxAbCardQtx');
  const statusEl = document.getElementById('qtxAbStatus');
  const countdownEl = document.getElementById('qtxAbCountdown');
  const barsBox = document.getElementById('qtxAbBars');
  const trackNameEl = document.getElementById('qtxAbTrackName');
  const abAudio = document.getElementById('qtxAbAudio');
  if (!btn || !backdrop || !abAudio) { console.warn('[QTX A/B] init: missing DOM'); return; }

  const BAR_COUNT = 24;
  const SWITCH_SEC = 8;
  // Demo-track priority order when the user hasn't played anything yet.
  // Each entry is a folder name; the engine will list the folder and pick
  // the first track with a usable _qtx variant.
  const DEMO_FOLDER_PRIORITY = ['Divine_Tunes', 'Chakra_Activation', 'Crystal_Frequencies', 'Meditation_and_Breathwork'];

  let running = false;
  let tickTimer = null;
  let animTimer = null;
  let currentMode = null;        // 'normal' | 'qtx'
  let secondsLeft = 0;
  let mainWasPlaying = false;
  let positionSeconds = 0;       // preserve playback position across mode switches
  let activeTrack = null;        // { folder, file, isDemo } — the track used in this A/B session

  // Build spectrum bars once
  for (let i = 0; i < BAR_COUNT; i++) {
    const b = document.createElement('div');
    b.className = 'qtxAbBar';
    b.style.cssText = 'flex:1;height:8%;background:linear-gradient(180deg,#B89EFF,#8b5cf6);border-radius:2px 2px 0 0;transition:height .15s ease';
    barsBox.appendChild(b);
  }
  const bars = barsBox.querySelectorAll('.qtxAbBar');

  const LS_QTX_DEMO = '5do_qtx_demo_v1';

  // Raw Supabase listing that includes _qtx variants (listTracks() filters
  // them out). We use this to find a track that DEFINITIVELY has both a
  // normal and a _qtx version in the bucket — which is what the A/B demo
  // actually needs.
  async function findTrackWithQtx(folder) {
    if (typeof SB === 'undefined' || !SB.storage) return null;
    try {
      const { data, error } = await SB.storage.from(BUCKET).list(folder, { limit: 200 });
      if (error || !Array.isArray(data)) return null;
      // Map base filename → { hasNormal, hasQtx }
      const pairs = {};
      const audioExt = /\.(mp3|m4a|aac|wav|flac|ogg)$/i;
      for (const it of data) {
        const name = it.name;
        if (!audioExt.test(name)) continue;
        const qtxMatch = name.match(/^(.+)_qtx(\.[^.]+)$/i);
        if (qtxMatch) {
          const baseFile = qtxMatch[1] + qtxMatch[2];
          pairs[baseFile] = pairs[baseFile] || {};
          pairs[baseFile].hasQtx = true;
        } else {
          pairs[name] = pairs[name] || {};
          pairs[name].hasNormal = true;
        }
      }
      // Pick the first track that has BOTH versions
      const baseFiles = Object.keys(pairs).sort((a, b) =>
        a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' })
      );
      for (const file of baseFiles) {
        if (pairs[file].hasNormal && pairs[file].hasQtx) {
          return { folder, file };
        }
      }
      return null;
    } catch (_) { return null; }
  }

  async function resolveDemoTrack() {
    // Cache-first: re-use the same demo across sessions for consistency and
    // to skip the probe delay. We re-validate existence on next open only if
    // the cached track ever produces an error at load time.
    try {
      const cached = JSON.parse(localStorage.getItem(LS_QTX_DEMO) || 'null');
      if (cached && cached.folder && cached.file) return cached;
    } catch (_) {}

    // Probe priority folders in order for a track that has both Normal and
    // _qtx variants present in the bucket.
    for (const folder of DEMO_FOLDER_PRIORITY) {
      const hit = await findTrackWithQtx(folder);
      if (hit) {
        try { localStorage.setItem(LS_QTX_DEMO, JSON.stringify(hit)); } catch (_) {}
        return hit;
      }
    }
    // Fallback: scan any cached folders
    if (window.STATE && STATE.foldersCache && STATE.foldersCache.length > 0) {
      for (const folder of STATE.foldersCache) {
        if (DEMO_FOLDER_PRIORITY.includes(folder)) continue;
        const hit = await findTrackWithQtx(folder);
        if (hit) {
          try { localStorage.setItem(LS_QTX_DEMO, JSON.stringify(hit)); } catch (_) {}
          return hit;
        }
      }
    }
    return null;
  }

  // Clear cached demo if it fails to load (the file may have been removed
  // or renamed server-side). Next open will re-probe from scratch.
  function invalidateDemoCache() {
    try { localStorage.removeItem(LS_QTX_DEMO); } catch (_) {}
  }

  function prettyTrack(t) {
    if (!t) return '—';
    const base = (t.file || '').replace(/\.[^.]+$/, '').replace(/[_\-]+/g, ' ');
    return '데모 · ' + t.folder.replace(/_/g, ' ') + ' · ' + base;
  }

  async function openModal() {
    backdrop.style.display = 'flex';
    statusEl.textContent = '대기 중';
    statusEl.style.color = '#94a3b8';
    // Button always enabled
    toggleBtn.disabled = false;
    toggleBtn.style.opacity = '1';
    toggleBtn.style.cursor = 'pointer';
    // Preload demo track name so user knows what will play
    trackNameEl.textContent = '▶ 데모 트랙 로딩 중…';
    trackNameEl.style.opacity = '.55';
    activeTrack = null;
    try {
      const demo = await resolveDemoTrack();
      if (demo) {
        activeTrack = demo;
        trackNameEl.textContent = '▶ ' + prettyTrack(demo);
        trackNameEl.style.opacity = '.8';
      } else {
        trackNameEl.textContent = '⚠ 데모 트랙을 찾을 수 없음';
        trackNameEl.style.opacity = '.75';
      }
    } catch (_) {
      trackNameEl.textContent = '⚠ 데모 트랙 로딩 실패';
      trackNameEl.style.opacity = '.75';
    }
  }
  function closeModal() {
    stopAb(true);
    backdrop.style.display = 'none';
  }
  btn.addEventListener('click', openModal);
  closeBtn.addEventListener('click', closeModal);
  backdrop.addEventListener('click', e => { if (e.target === backdrop) closeModal(); });
  window.addEventListener('keydown', e => { if (e.key === 'Escape' && backdrop.style.display === 'flex') closeModal(); });

  function paintModeCard() {
    cardNormal.style.transform = currentMode === 'normal' ? 'scale(1.03)' : 'scale(1)';
    cardNormal.style.boxShadow = currentMode === 'normal' ? '0 0 0 2px #8b94a0, 0 8px 22px rgba(139,148,160,.3)' : 'none';
    cardQtx.style.transform = currentMode === 'qtx' ? 'scale(1.03)' : 'scale(1)';
    cardQtx.style.boxShadow = currentMode === 'qtx' ? '0 0 0 2px #8b5cf6, 0 8px 22px rgba(139,92,246,.45)' : 'none';
    if (currentMode === 'normal') {
      statusEl.textContent = '▶ NORMAL 재생 중';
      statusEl.style.color = '#8b94a0';
    } else if (currentMode === 'qtx') {
      statusEl.textContent = '▶ QTX 재생 중';
      statusEl.style.color = '#B89EFF';
    }
  }

  // Procedural spectrum bars — iOS main player can't hook AudioContext
  // (background-playback constraint). Illustrative by design: Normal shows
  // mid-heavy / low-suppressed; QTX shows full-band with low-end boost.
  let animFrame = 0;
  function animateBars() {
    animFrame++;
    for (let i = 0; i < BAR_COUNT; i++) {
      const pos = i / BAR_COUNT;
      let h;
      if (currentMode === 'normal') {
        const lowPenalty = Math.max(0, 1 - pos * 3);
        const base = 35 + 45 * Math.sin(pos * Math.PI) - 28 * lowPenalty;
        h = base + Math.sin(animFrame * 0.15 + i * 0.4) * 7;
      } else if (currentMode === 'qtx') {
        const lowBoost = (1 - pos) * 25;
        const base = 55 + 28 * Math.sin(pos * Math.PI * 0.8 + 0.4) + lowBoost;
        h = base + Math.sin(animFrame * 0.18 + i * 0.35) * 9;
      } else {
        h = 6 + Math.sin(animFrame * 0.05 + i * 0.5) * 3;
      }
      h = Math.max(5, Math.min(95, h));
      bars[i].style.height = h + '%';
      bars[i].style.background = currentMode === 'qtx'
        ? 'linear-gradient(180deg,#B89EFF,#8b5cf6)'
        : (currentMode === 'normal'
           ? 'linear-gradient(180deg,#94a3b8,#64748b)'
           : 'linear-gradient(180deg,rgba(139,92,246,.3),rgba(139,92,246,.1))');
    }
    animTimer = requestAnimationFrame(animateBars);
  }

  function abort(msg) {
    statusEl.textContent = msg;
    statusEl.style.color = '#fbbf24';
    stopAb(false);
  }

  // Load one side into the dedicated A/B audio element. Returns a promise
  // resolving true on ready-to-play, false on load error (e.g., missing _qtx).
  function loadSide(url, seekTo) {
    return new Promise(resolve => {
      let settled = false;
      const onReady = () => {
        if (settled) return;
        settled = true;
        abAudio.removeEventListener('canplay', onReady);
        abAudio.removeEventListener('error', onError);
        try { abAudio.currentTime = seekTo; } catch (_) {}
        resolve(true);
      };
      const onError = () => {
        if (settled) return;
        settled = true;
        abAudio.removeEventListener('canplay', onReady);
        abAudio.removeEventListener('error', onError);
        resolve(false);
      };
      abAudio.addEventListener('canplay', onReady, { once: true });
      abAudio.addEventListener('error', onError, { once: true });
      abAudio.src = url;
      abAudio.load();
      // safety timeout — very slow network
      setTimeout(() => { if (!settled) { settled = true; resolve(true); } }, 5000);
    });
  }

  async function switchTo(mode) {
    if (!activeTrack || !activeTrack.folder || !activeTrack.file) return false;
    if (typeof mediaObjectUrl !== 'function') return false;
    const base = mediaObjectUrl(activeTrack.folder, activeTrack.file);
    const url = (mode === 'qtx') ? base.replace(/(\.[^.]+)$/, '_qtx$1') : base;

    // Preserve position across the switch so user hears the same moment
    if (!isNaN(abAudio.currentTime) && abAudio.duration) positionSeconds = abAudio.currentTime;

    const ok = await loadSide(url, positionSeconds);
    if (!ok) {
      // Cached demo track is no longer valid — clear so next open re-probes
      invalidateDemoCache();
      activeTrack = null;
      if (mode === 'qtx') {
        abort('⚠ 데모 트랙의 QTX 버전을 불러올 수 없습니다 — 다시 시도해 주세요');
      } else {
        abort('⚠ 데모 트랙을 불러올 수 없습니다 — 다시 시도해 주세요');
      }
      return false;
    }
    currentMode = mode;
    paintModeCard();
    try { await abAudio.play(); }
    catch (e) {
      console.warn('[QTX A/B] play() failed:', e.message || e);
      abort('⚠ 재생 권한이 필요합니다 — 다시 탭해 주세요');
      return false;
    }
    return true;
  }

  function tickCountdown() {
    if (!running) return;
    secondsLeft--;
    countdownEl.textContent = secondsLeft > 0 ? (secondsLeft + '초 후 전환') : '전환 중…';
    if (secondsLeft <= 0) {
      const next = currentMode === 'normal' ? 'qtx' : 'normal';
      secondsLeft = SWITCH_SEC;
      switchTo(next);
    }
    tickTimer = setTimeout(tickCountdown, 1000);
  }

  async function startAb() {
    // Always use a demo track. openModal() already resolves one; re-fetch
    // as a safety net if the user somehow clicks the button before resolution.
    if (!activeTrack) {
      statusEl.textContent = '데모 트랙 로딩 중…';
      statusEl.style.color = '#B89EFF';
      const demo = await resolveDemoTrack();
      if (!demo) {
        abort('⚠ 라이브러리 로딩 실패 — 잠시 후 다시 시도해 주세요');
        return;
      }
      activeTrack = demo;
    }
    trackNameEl.textContent = '▶ ' + prettyTrack(activeTrack);
    trackNameEl.style.opacity = '.9';

    // Pause the main player so A/B audio is the only thing playing
    try {
      const main = document.getElementById('player');
      if (main) {
        mainWasPlaying = !main.paused;
        if (mainWasPlaying) main.pause();
      }
    } catch (_) {}

    running = true;
    toggleBtn.textContent = '■ 비교 중지';
    toggleBtn.style.background = 'linear-gradient(135deg,#f87171,#e11d48)';
    secondsLeft = SWITCH_SEC;
    positionSeconds = 0;

    if (animTimer) cancelAnimationFrame(animTimer);
    animateBars();
    const ok = await switchTo('normal');
    if (!ok) return;
    tickCountdown();
  }

  function stopAb(silent) {
    if (!running && !abAudio.src) return;
    running = false;
    if (tickTimer) clearTimeout(tickTimer);
    if (animTimer) cancelAnimationFrame(animTimer);
    currentMode = null;
    // Clear visual state
    cardNormal.style.transform = 'scale(1)'; cardNormal.style.boxShadow = 'none';
    cardQtx.style.transform = 'scale(1)'; cardQtx.style.boxShadow = 'none';
    if (!silent) {} // keep error message visible
    else {
      statusEl.textContent = '대기 중'; statusEl.style.color = '#94a3b8';
    }
    countdownEl.textContent = '';
    toggleBtn.textContent = '▶ 듣고 비교하기';
    toggleBtn.style.background = 'linear-gradient(135deg,#8b5cf6,#5A3AD9)';

    try { abAudio.pause(); } catch (_) {}
    try { abAudio.removeAttribute('src'); abAudio.load(); } catch (_) {}

    // Resume main player as it was
    try {
      const main = document.getElementById('player');
      if (main && mainWasPlaying) main.play().catch(() => {});
    } catch (_) {}
    mainWasPlaying = false;
    // Allow next open to pick a fresh track (user may have played something new)
    activeTrack = null;
  }

  toggleBtn.addEventListener('click', () => {
    if (running) stopAb(true); else startAb();
  });
})();
