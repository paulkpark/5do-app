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

  function render() {
    const body = document.getElementById('plBody');
    if (!body) return;
    const list = activeList();
    if (!list) {
      body.innerHTML = lists.length
        ? lists.map(l => `
            <div class="pl-row">
              <span style="flex:1;cursor:pointer;color:#cfe9ff" data-open="${l.id}">${l.name}
                <small style="color:#6a8fb5;margin-left:6px">${l.tracks.length}곡</small>
              </span>
              <button class="btn small" data-rename="${l.id}">✏️</button>
              <button class="btn small" data-del="${l.id}" style="color:#ff6b6b">🗑</button>
            </div>`).join('')
        : '<div style="color:#6a8fb5;padding:20px;text-align:center">플레이리스트가 없어요.<br>+ New 로 만들어보세요.</div>';
    } else {
      body.innerHTML = `
        <div style="margin-bottom:10px">
          <button class="btn small" data-back>← 목록</button>
          <span style="margin-left:8px;color:#cfe9ff;font-weight:700">${list.name}</span>
        </div>
        ${list.tracks.length
          ? list.tracks.map((t, i) => `
              <div class="pl-row ${i === plIdx ? 'is-playing' : ''}">
                <span style="color:#8aa8c8;font-size:12px;min-width:20px">${i + 1}</span>
                <span style="flex:1;cursor:pointer;color:#ddeeff;font-size:14px" data-play="${i}">${t.name}</span>
                <button class="btn small" data-rm="${i}" style="color:#ff6b6b">✕</button>
              </div>`).join('')
          : '<div style="color:#6a8fb5;padding:16px;text-align:center">트랙이 없어요.<br>"현재 트랙 추가" 버튼으로 추가하세요.</div>'
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
        if (!confirm('삭제할까요?')) return;
        lists = lists.filter(l => l.id !== t.dataset.del);
        if (activeId === t.dataset.del) activeId = null;
        save(); render();
      }
      if ('rename' in t.dataset) {
        const l = lists.find(x => x.id === t.dataset.rename);
        const n = prompt('새 이름', l?.name);
        if (n?.trim()) { l.name = n.trim(); save(); render(); }
      }
      if ('play' in t.dataset) { plIdx = +t.dataset.play; playAt(plIdx); }
      if ('rm'   in t.dataset) {
        const l = activeList();
        if (l) { l.tracks.splice(+t.dataset.rm, 1); save(); render(); toast('트랙 제거됨'); }
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
    // 라이브러리 플레이어 연동
    const audio = document.getElementById('libAudio') || document.getElementById('audioEl');
    if (audio) { audio.src = track.url; audio.play().catch(()=>{}); }
    // STATE 업데이트 (5do.html 글로벌 상태)
    if (typeof STATE !== 'undefined') { STATE.currentTrack = { name: track.name, url: track.url, folder: track.folder, file: track.file }; }
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

  function hookAudioEnded() {
    const tryHook = () => {
      const audio = document.getElementById('libAudio') || document.getElementById('audioEl');
      if (audio) { audio.addEventListener('ended', () => { if (activeList()) playNext(true); }); }
    };
    if (document.readyState === 'complete') tryHook();
    else window.addEventListener('load', tryHook);
  }

  function addCurrentTrack() {
    const ct = (typeof STATE !== 'undefined' ? STATE : null)?.currentTrack || window.STATE?.currentTrack;
    if (!ct?.url) { toast('재생 중인 트랙이 없어요'); return; }
    let list = activeList();
    if (!list) {
      if (lists.length) {
        // 가장 최근 리스트에 추가
        list = lists[lists.length - 1];
        activeId = list.id;
      } else {
        const n = prompt('플레이리스트 이름', 'My Playlist');
        if (!n?.trim()) return;
        list = { id: uid(), name: n.trim(), tracks: [] };
        lists.push(list); activeId = list.id;
      }
    }
    if (list.tracks.some(t => t.url === ct.url)) { toast('이미 추가된 트랙이에요'); return; }
    list.tracks.push({ name: ct.name || ct.file || '트랙', url: ct.url, folder: ct.folder || '', file: ct.file || '' });
    save(); render();
    toast('✅ "' + list.name + '"에 추가됨');
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
          save(); render(); toast('📥 ' + added + '개 가져옴');
        } catch { toast('파일 형식 오류'); }
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
      const n = prompt('플레이리스트 이름', 'My Playlist');
      if (!n?.trim()) return;
      const list = { id: uid(), name: n.trim(), tracks: [] };
      lists.push(list); activeId = list.id; save(); render();
    });
    on('plAddCurrentBtn', addCurrentTrack);
    on('plSaveBtn',   () => { save(); closePanel(); toast('저장됨'); });
    on('plCloseBtn',  closePanel);
    on('plExportBtn', exportPL);
    on('plImportBtn', importPL);
    on('plPlayAllBtn', () => {
      const list = activeList();
      if (!list?.tracks.length) return;
      if (shuffle) buildShuffleOrder(list.tracks.length);
      plIdx = 0; playAt(0);
    });
    on('plPrevBtn',    playPrev);
    on('plNextBtn',    () => playNext());
    on('plShuffleBtn', () => {
      shuffle = !shuffle;
      if (shuffle) buildShuffleOrder(activeList()?.tracks.length || 0);
      render(); toast(shuffle ? '셔플 켜짐' : '셔플 꺼짐');
    });
    on('plLoopBtn', () => {
      loopMode = (loopMode + 1) % 3;
      render(); toast(['반복 끔','한 곡 반복','전체 반복'][loopMode]);
    });
  }

  function init() {
    load(); bindButtons(); hookAudioEnded();
    const panel = document.getElementById('plPanel');
    if (panel) panel.style.display = 'none';
  }

  window.PL = { open: openPanel, close: closePanel, addCurrent: addCurrentTrack, next: playNext, prev: playPrev };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

/* ── 5do.html 호환 글로벌 함수 ─────────────── */
window.openPlPanel   = () => window.PL.open();
window.syncPlaylists = () => { load(); return { lists, activeId }; };
