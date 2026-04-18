/* ===== favorites.js: Favorites state + strip rendering ===== */
/* Depends on globals: FAV_KEY (config.js), $ (defined in 5do.html main script)
   Also relies on runtime globals loaded later: trackThumb, mediaObjectUrl,
   lookupTrackMeta, getLocalized, stem, player, setLibMode, stopLibViz,
   statusThumb, statusTitle, setStatusThumb, infoTitle, infoBody, STATE,
   updateFavIcon, SUB, showLoginModal, LANG, setMixMode.
   These exist on window by the time renderFavoritesStrip() is called at runtime. */

// ─── Favorites state (global) ────────────────────────────────────────────
window.loadFavs = function loadFavs() {
  try { return new Set(JSON.parse(localStorage.getItem(FAV_KEY) || '[]')); }
  catch { return new Set(); }
};
window.saveFavs = function saveFavs(set) {
  localStorage.setItem(FAV_KEY, JSON.stringify([...set]));
};
window.FAVS = window.loadFavs();
window.FAVORITES_ONLY = false;

window.starSvg = function starSvg() {
  return '<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.7"><path d="M12 3l3 6 6 .9-4.5 4.4 1 6.2-5.5-3-5.5 3 1-6.2L3 9.9 9 9z"/></svg>';
};

window.trackId = function trackId(folder, file) {
  return (folder ? `${folder}/${file}` : file);
};

// ─── Favorites strip renderer ────────────────────────────────────────────
window.renderFavoritesStrip = async function renderFavoritesStrip() {
  const wrap   = document.getElementById('favoritesWrap');
  const fstrip = document.getElementById('favoritesStrip');
  if (!wrap || !fstrip) return;
  const list = [...window.FAVS];

  if (list.length === 0) {
    wrap.style.display = 'none';
    fstrip.innerHTML = '';
    return;
  }

  wrap.style.display = '';
  fstrip.innerHTML = '';

  for (const id of list) {
    const seg    = id.split('/');
    const folder = seg.length > 1 ? seg.slice(0, -1).join('/') : '';
    const file   = seg[seg.length - 1];

    const card = document.createElement('div');
    card.className = 'card fav';

    const th = document.createElement('div');
    th.className = 'thumb';
    card.append(th);

    const star = document.createElement('div');
    star.className = 'star';
    star.innerHTML = window.starSvg();
    card.append(star);

    const u = folder && typeof trackThumb === 'function' ? trackThumb(folder, file) : null;
    if (u) th.style.backgroundImage = `url("${u}")`;

    // ── Card click: play track + update meta ──
    card.addEventListener('click', async (e) => {
      if (e.target.closest('.star')) return; // star click ignored

      const url = typeof mediaObjectUrl === 'function' ? mediaObjectUrl(folder, file) : '';
      if (typeof player !== 'undefined' && player) {
        player.src = url;
        if (typeof player.load === 'function') player.load();
      }
      if (typeof setLibMode === 'function') setLibMode('player');
      if (typeof stopLibViz === 'function') stopLibViz();

      // Divine_Tunes: hide mixer panel
      const _mp = document.getElementById('mixPanel');
      if (_mp) {
        if (folder && folder.startsWith('Divine_Tunes')) {
          _mp.style.display = 'none';
          if (typeof setMixMode === 'function') setMixMode('off');
        } else {
          _mp.style.display = '';
        }
      }

      // Thumbnail update
      const u2 = folder && typeof trackThumb === 'function' ? trackThumb(folder, file) : null;
      if (u2 && typeof statusThumb !== 'undefined' && statusThumb) {
        statusThumb.classList.remove('status-blank');
        statusThumb.dataset.thumbMode = 'track';
        if (typeof setStatusThumb === 'function') setStatusThumb(statusThumb, u2);
      }

      // Base title from filename
      const baseTitle = (typeof stem === 'function' ? stem(file) : file).replace(/[_\-]+/g, ' ');

      // meta.json lookup
      const meta = typeof lookupTrackMeta === 'function' ? lookupTrackMeta(folder, file) : null;
      let title    = baseTitle;
      let desc     = '';
      let composer = '';
      if (meta) {
        title    = (typeof getLocalized === 'function' ? getLocalized(meta, 'title') : '') || baseTitle;
        desc     = typeof getLocalized === 'function' ? getLocalized(meta, 'desc') : '';
        composer = meta.composer || (typeof getLocalized === 'function' ? getLocalized(meta, 'composer') : '') || '';
      }

      // Status bar title
      if (typeof statusTitle !== 'undefined' && statusTitle) {
        statusTitle.textContent = title;
        statusTitle.classList.add('playing');
      }
      if (typeof STATE !== 'undefined') {
        STATE.currentTrack = { name: title, url, folder, file };
      }

      if (typeof updateFavIcon === 'function') updateFavIcon();

      // Info panel
      if (typeof infoTitle !== 'undefined' && infoTitle) infoTitle.textContent = title;
      if (typeof infoBody !== 'undefined' && infoBody) {
        const parts = [];
        if (desc)     parts.push(desc);
        if (composer) parts.push((typeof LANG !== 'undefined' && LANG === 'ko') ? `작곡: ${composer}` : `Composer: ${composer}`);
        infoBody.textContent = parts.join(' · ');
      }
    });

    // ── Star click: toggle favorite ──
    star.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof SUB !== 'undefined' && SUB.isLoginGateLive && SUB.isLoginGateLive() && !window.APP_USER) {
        if (typeof showLoginModal === 'function') showLoginModal();
        return;
      }
      if (window.FAVS.has(id)) {
        window.FAVS.delete(id);
        card.classList.remove('fav');
      } else {
        window.FAVS.add(id);
        card.classList.add('fav');
      }
      window.saveFavs(window.FAVS);
      window.renderFavoritesStrip();
    });

    fstrip.appendChild(card);
  }
};
