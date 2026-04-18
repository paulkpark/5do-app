/* ===== player.js: Player UI (progress bar, time display, share sheet, play/pause icon) =====
   Depends on DOM element #player (audio) and runtime-loaded main script.
   Exposes globals used by other modules and inline onclick attrs:
     window.formatTime, window.updatePlayPauseIcon,
     window.shareTrack, window.openTrackInfoSheet,
     window.closeTrackInfoSheet, window.toggleTrackInfo
*/

(function(){
  function getPlayer() { return document.getElementById('player'); }

  // ── Time formatter ──────────────────────────────────────────────
  window.formatTime = function formatTime(s){
    if(isNaN(s) || !isFinite(s)) return '00:00';
    const m = Math.floor(s / 60), sec = Math.floor(s % 60);
    return (m < 10 ? '0' : '') + m + ':' + (sec < 10 ? '0' : '') + sec;
  };

  // ── Custom progress bar (time display + seek) ──────────────────
  function initProgressBar(){
    const player = getPlayer();
    if(!player) return;
    const bar    = document.getElementById('progressBar');
    const fill   = document.getElementById('progressFill');
    const thumb  = document.getElementById('progressThumb');
    const timeNow = document.getElementById('timeNow');
    const timeTot = document.getElementById('timeTot');
    if(!bar || !fill) return;

    player.addEventListener('timeupdate', () => {
      if(!player.duration) return;
      const pct = (player.currentTime / player.duration) * 100;
      fill.style.width = pct + '%';
      if(thumb) thumb.style.left = pct + '%';
      if(timeNow) timeNow.textContent = window.formatTime(player.currentTime);
    });
    player.addEventListener('loadedmetadata', () => {
      if(timeTot) timeTot.textContent = window.formatTime(player.duration);
    });
    player.addEventListener('durationchange', () => {
      if(timeTot) timeTot.textContent = window.formatTime(player.duration);
    });

    bar.addEventListener('click', (e) => {
      if(!player.duration) return;
      const rect = bar.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      player.currentTime = pct * player.duration;
    });
  }

  // ── Play/Pause icon sync ───────────────────────────────────────
  window.updatePlayPauseIcon = function updatePlayPauseIcon(){
    const player = getPlayer();
    const ip  = document.getElementById('iconPlay');
    const ipa = document.getElementById('iconPause');
    if(!player || !ip || !ipa) return;
    if(player.paused){ ip.style.display = '';     ipa.style.display = 'none'; }
    else             { ip.style.display = 'none'; ipa.style.display = '';     }
  };

  function initPlayPauseIconListeners(){
    const player = getPlayer();
    if(!player) return;
    player.addEventListener('play',    window.updatePlayPauseIcon);
    player.addEventListener('pause',   window.updatePlayPauseIcon);
    player.addEventListener('ended',   window.updatePlayPauseIcon);
    player.addEventListener('emptied', window.updatePlayPauseIcon); // load() restores ▶
  }

  // ── Track info sheet (opened by status bar tap, closed by header tap) ──
  window.openTrackInfoSheet = function openTrackInfoSheet(){
    const sheet = document.getElementById('trackInfoSheet');
    if(sheet) sheet.classList.add('open');
  };
  window.closeTrackInfoSheet = function closeTrackInfoSheet(){
    const sheet = document.getElementById('trackInfoSheet');
    if(sheet) sheet.classList.remove('open');
  };
  // Legacy compat (older onclick handlers)
  window.toggleTrackInfo = function toggleTrackInfo(){ window.openTrackInfoSheet(); };

  // ── Share button (Web Share API with clipboard fallback) ───────
  function copyShareLink(url){
    navigator.clipboard?.writeText(url).then(() => {
      const btn = document.getElementById('btnShare');
      if(!btn) return;
      const orig = btn.innerHTML;
      btn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#4ade80" stroke-width="2.5"><polyline points="20,6 9,17 4,12"/></svg>';
      setTimeout(() => { btn.innerHTML = orig; }, 1800);
    });
  }
  window.shareTrack = async function shareTrack(){
    const title = document.getElementById('trackInfoTitle')?.textContent?.trim() || '5DO 트랙';
    const url   = location.href;
    if(navigator.share){
      try {
        await navigator.share({ title, text: title + ' — 5D Healing', url });
      } catch(e) {
        if(e.name !== 'AbortError') copyShareLink(url);
      }
    } else {
      copyShareLink(url);
    }
  };

  // ── Init after DOM ready ───────────────────────────────────────
  function init(){
    initProgressBar();
    initPlayPauseIconListeners();
  }
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
