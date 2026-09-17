/**
 * playlist.js — 5DO Playlist Manager
 */
(function () {
  'use strict';
  const LS_KEY = '5do_playlists';
  let lists = [], activeId = null, plIdx = -1;
  let shuffle = false, loopMode = 0, shuffleOrder = [];

  function load() { try { lists = JSON.parse(localStorage.getItem(LS_KEY)) || []; } catch { lists = []; } }
  function save() { localStorage.setItem(LS_KEY, JSON.stringify(lists)); }
  function uid()  { return Math.random().toString(36).slice(2, 9); }
  function activeList() { return lists.find(l => l.id === activeId) || null; }

  function toast(msg) {
    const el = document.getElementById('plToast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), 2200);
  }

  // Resolved per call, not cached: LANG changes while the panel is open and the
  // panel is re-rendered in place. i18n.js loads before this file, so I18N is
  // there; the fallback keeps the panel usable if that ever stops being true.
  function T(key, fallback) {
    try {
      const dict = I18N[LANG] || I18N.ko;
      return (dict && dict[key]) || (I18N.ko && I18N.ko[key]) || fallback || key;
    } catch (_) { return fallback || key; }
  }

  function render() {
    const body = document.getElementById('plBody');
    if (!body) return;
    const list = activeList();
    if (!list) {
      body.innerHTML = lists.length
        ? lists.map(l => `
            <div class="pl-row">
              <span style="flex:1;cursor:pointer;color:#cfe9ff" data-open="${l.id}">${l.name}
                <small style="color:#6a8fb5;margin-left:6px">${l.tracks.length}${T('pl.trackCount')}</small>
              </span>
              <button class="btn small" data-rename="${l.id}">✏️</button>
              <button class="btn small" data-del="${l.id}" style="color:#ff6b6b">🗑</button>
            </div>`).join('')
        : '<div style="color:#6a8fb5;padding:20px;text-align:center">' + T('pl.empty') + '</div>';
    } else {
      body.innerHTML = `
        <div style="margin-bottom:10px">
          <button class="btn small" data-back>${T('pl.back')}</button>
          <span style="margin-left:8px;color:#cfe9ff;font-weight:700">${list.name}</span>
        </div>
        ${list.tracks.length
          ? list.tracks.map((t, i) => `
              <div class="pl-row ${i === plIdx ? 'is-playing' : ''}">
                <span style="color:#8aa8c8;font-size:12px;min-width:20px">${i + 1}</span>
                <span style="flex:1;cursor:pointer;color:#ddeeff;font-size:14px" data-play="${i}">${t.name}</span>
                <button class="btn small" data-rm="${i}" style="color:#ff6b6b">✕</button>
              </div>`).join('')
          : '<div style="color:#6a8fb5;padding:16px;text-align:center">' + T('pl.emptyTracks') + '</div>'
        }`;
    }
    // 컨트롤 상태 업데이트
    const hasT = !!(activeList()?.tracks?.length);
    ['plPlayAllBtn','plPrevBtn','plNextBtn'].forEach(id => {
      const b = document.getElementById(id); if (b) b.disabled = !hasT;
    });
    const lb = document.getElementById('plLoopBadge');
    if (lb) lb.style.display = loopMode === 1 ? 'inline-block' : 'none';
    document.getElementById('plLoopBtn')?.classList.toggle('is-on', loopMode > 0);
    document.getElementById('plShuffleBtn')?.classList.toggle('is-on', shuffle);
    bindBodyEvents();
  }

  function bindBodyEvents() {
    const body = document.getElementById('plBody');
    if (!body) return;
    body.onclick = e => {
      const t = e.target.closest('[data-open],[data-del],[data-rename],[data-back],[data-play],[data-rm]');
      if (!t) return;
      if ('open'   in t.dataset) { activeId = t.dataset.open; plIdx = -1; render(); }
      if ('back'   in t.dataset) { activeId = null; render(); }
      if ('del'    in t.dataset) {
        if (!confirm(T('pl.confirmDelete'))) return;
        lists = lists.filter(l => l.id !== t.dataset.del);
        if (activeId === t.dataset.del) activeId = null;
        save(); render();
      }
      if ('rename' in t.dataset) {
        const l = lists.find(x => x.id === t.dataset.rename);
        const n = prompt(T('pl.renamePrompt'), l?.name);
        if (n?.trim()) { l.name = n.trim(); save(); render(); }
      }
      if ('play' in t.dataset) { plIdx = +t.dataset.play; playAt(plIdx); }
      if ('rm'   in t.dataset) {
        const l = activeList();
        if (l) { l.tracks.splice(+t.dataset.rm, 1); save(); render(); toast(T('pl.trackRemoved')); }
      }
    };
  }

  function playAt(idx) {
    const list = activeList();
    if (!list?.tracks.length) return;
    const ri = shuffle ? (shuffleOrder[idx] ?? idx) : idx;
    const track = list.tracks[ri];
    if (!track) return;
    plIdx = idx; render();

    // Prefer the app's canonical track-play entry point so title/description/
    // thumbnail/composer/YouTube/favorite, STATE, Cymatics dispatch, ambient mode,
    // Divine_Tunes mixer hide, and autoplay-on-canplay all stay in sync.
    if (track.folder && track.file && typeof window.playSelectedTrack === 'function') {
      try { window.playSelectedTrack(track.folder, track.file); }
      catch (e) { console.warn('[PL] playSelectedTrack failed, falling back', e); }
    } else if (typeof window.loadAndPlayTrack === 'function') {
      // Legacy / imported entries missing folder+file → degraded path that still
      // updates CURRENT_TRACK and uses the canplay autoplay listener.
      try { window.loadAndPlayTrack({ name: track.name, url: track.url, folder: track.folder, file: track.file }); }
      catch (e) { console.warn('[PL] loadAndPlayTrack failed, falling back', e); }
    } else {
      // Last-resort raw fallback (shouldn't be reached on the real app shell).
      const audio = document.getElementById('player');
      if (audio) { audio.src = track.url; audio.play().catch(()=>{}); }
      if (typeof STATE !== 'undefined') {
        STATE.currentTrack = { name: track.name, url: track.url, folder: track.folder, file: track.file };
      }
    }
    toast('▶ ' + track.name);
  }

  function buildShuffleOrder(len) {
    shuffleOrder = Array.from({ length: len }, (_, i) => i).sort(() => Math.random() - 0.5);
  }

  function playNext(fromEnd = false) {
    const list = activeList();
    if (!list?.tracks.length) return;
    const len = list.tracks.length;
    if (fromEnd) {
      if      (loopMode === 1) { playAt(plIdx); return; }
      else if (loopMode === 2) { playAt((plIdx + 1) % len); return; }
      else if (plIdx + 1 < len) { playAt(plIdx + 1); }
    } else {
      if (plIdx + 1 < len) playAt(plIdx + 1);
    }
  }
  function playPrev() { if (plIdx > 0) playAt(plIdx - 1); }

  function stopPlayback() {
    // Delegate to the main player's #btnStop so we inherit its full reset
    // path: pause + currentTime=0 + stopLibViz + statusTitle removal +
    // updatePlayPauseIcon + miniViz hide. Any future tweaks to the canonical
    // stop behavior automatically flow through here.
    const mainStop = document.getElementById('btnStop');
    if (mainStop) { mainStop.click(); }
    else {
      const audio = document.getElementById('player');
      if (audio) {
        try { audio.pause(); } catch (_) {}
        try { audio.currentTime = 0; } catch (_) {}
      }
    }
    toast(T('pl.stopped'));
  }

  function hookAudioEnded() {
    const tryHook = () => {
      const audio = document.getElementById('player');
      if (audio) { audio.addEventListener('ended', () => { if (activeList()) playNext(true); }); }
    };
    if (document.readyState === 'complete') tryHook();
    else window.addEventListener('load', tryHook);
  }

  function addCurrentTrack() {
    const ct = (typeof STATE !== 'undefined' ? STATE : null)?.currentTrack || window.STATE?.currentTrack;
    if (!ct?.url) { toast(T('pl.noCurrent')); return; }
    let list = activeList();
    if (!list) {
      if (lists.length) {
        // 가장 최근 리스트에 추가
        list = lists[lists.length - 1];
        activeId = list.id;
      } else {
        const n = prompt(T('pl.namePrompt'), 'My Playlist');
        if (!n?.trim()) return;
        list = { id: uid(), name: n.trim(), tracks: [] };
        lists.push(list); activeId = list.id;
      }
    }
    if (list.tracks.some(t => t.url === ct.url)) { toast(T('pl.already')); return; }
    list.tracks.push({ name: ct.name || ct.file || T('pl.untitled'), url: ct.url, folder: ct.folder || '', file: ct.file || '' });
    save(); render();
    toast('✅ "' + list.name + '"' + T('pl.addedTo'));
  }

  function exportPL() {
    const data = activeList() || lists;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type:'application/json' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: (activeList()?.name || '5do_playlists') + '.json' });
    a.click(); URL.revokeObjectURL(a.href);
  }

  function importPL() {
    const input = Object.assign(document.createElement('input'), { type:'file', accept:'.json' });
    input.onchange = e => {
      const file = e.target.files[0]; if (!file) return;
      const r = new FileReader();
      r.onload = ev => {
        try {
          const data = JSON.parse(ev.target.result);
          const items = Array.isArray(data) ? data : [data];
          let added = 0;
          items.forEach(item => {
            if (!item.id || !Array.isArray(item.tracks)) return;
            if (lists.some(l => l.id === item.id)) item.id = uid();
            lists.push(item); added++;
          });
          save(); render(); toast('📥 ' + added + T('pl.imported'));
        } catch { toast(T('pl.badFile')); }
      };
      r.readAsText(file);
    };
    input.click();
  }

  function openPanel()  { load(); const p = document.getElementById('plPanel'); if (p) { p.style.display = 'block'; render(); } }
  function closePanel() { const p = document.getElementById('plPanel'); if (p) p.style.display = 'none'; }

  function bindButtons() {
    const on = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };
    on('plNewBtn', () => {
      const n = prompt(T('pl.namePrompt'), 'My Playlist');
      if (!n?.trim()) return;
      const list = { id: uid(), name: n.trim(), tracks: [] };
      lists.push(list); activeId = list.id; save(); render();
    });
    on('plAddCurrentBtn', addCurrentTrack);
    on('plSaveBtn',   () => { save(); closePanel(); toast(T('pl.saved')); });
    on('plCloseBtn',  closePanel);
    on('plExportBtn', exportPL);
    on('plImportBtn', importPL);
    on('plPlayAllBtn', () => {
      const list = activeList();
      if (!list?.tracks.length) return;
      if (shuffle) buildShuffleOrder(list.tracks.length);
      plIdx = 0; playAt(0);
    });
    on('plStopBtn',    stopPlayback);
    on('plPrevBtn',    playPrev);
    on('plNextBtn',    () => playNext());
    on('plShuffleBtn', () => {
      shuffle = !shuffle;
      if (shuffle) buildShuffleOrder(activeList()?.tracks.length || 0);
      render(); toast(shuffle ? T('pl.shuffleOn') : T('pl.shuffleOff'));
    });
    on('plLoopBtn', () => {
      loopMode = (loopMode + 1) % 3;
      render(); toast([T('pl.loopOff'), T('pl.loopOne'), T('pl.loopAll')][loopMode]);
    });
  }

  function init() {
    load(); bindButtons(); hookAudioEnded();
    const panel = document.getElementById('plPanel');
    if (panel) panel.style.display = 'none';
  }

  window.PL = { open: openPanel, close: closePanel, addCurrent: addCurrentTrack, next: playNext, prev: playPrev };
  // ★ syncPlaylists는 IIFE 안에 있어야 load/lists/activeId에 접근 가능
  window.syncPlaylists = () => { load(); return { lists, activeId }; };
  // applyLang() redraws an open panel through this. It used to call renderPL(),
  // which never existed — guarded by typeof, so the panel simply kept whatever
  // language it was first drawn in, silently.
  window.renderPL = render;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

/* ── 5do.html 호환 글로벌 함수 ─────────────── */
window.openPlPanel   = () => window.PL.open();
