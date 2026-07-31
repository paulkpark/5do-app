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

// ─── Player-view favorite icon + toggle button ───────────────────────────
window.updateFavIcon = function updateFavIcon() {
  const iconOn  = document.getElementById('iconFavOn');
  const iconOff = document.getElementById('iconFavOff');
  if (!iconOn || !iconOff) return;
  const ct = (typeof STATE !== 'undefined') ? STATE.currentTrack : null;
  if (!ct || !ct.folder || !ct.file) {
    iconOn.style.display = 'none';
    iconOff.style.display = '';
    return;
  }
  const id = window.trackId(ct.folder, ct.file);
  const isFav = window.FAVS.has(id);
  iconOn.style.display  = isFav ? '' : 'none';
  iconOff.style.display = isFav ? 'none' : '';
};

// ─── Wire UI buttons after DOM ready ─────────────────────────────────────
function initFavoriteUI() {
  // "Favorites only" filter button (library view)
  const favOnlyBtn = document.getElementById('favOnlyBtn');
  if (favOnlyBtn) {
    favOnlyBtn.addEventListener('click', () => {
      if (typeof STATE !== 'undefined' && STATE.uiMode === 'player') return; // ignore in player view
      window.FAVORITES_ONLY = !window.FAVORITES_ONLY;
      favOnlyBtn.classList.toggle('active', window.FAVORITES_ONLY);
      if (typeof renderStrip === 'function') renderStrip();
    });
  }

  // Player-view favorite toggle heart/star button
  const btnFavToggle = document.getElementById('btnFavToggle');
  if (btnFavToggle) {
    btnFavToggle.addEventListener('click', () => {
      const ct = (typeof STATE !== 'undefined') ? STATE.currentTrack : null;
      if (!ct || !ct.folder || !ct.file) return;
      const id = window.trackId(ct.folder, ct.file);
      if (window.FAVS.has(id)) window.FAVS.delete(id);
      else window.FAVS.add(id);
      window.saveFavs(window.FAVS);
      if (window.syncFavoriteCache) window.syncFavoriteCache(id, window.FAVS.has(id));
      window.updateFavIcon();
      window.renderFavoritesStrip();
    });
  }
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initFavoriteUI, { once: true });
} else {
  initFavoriteUI();
}

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
        composer = meta.producer || (typeof getLocalized === 'function' ? getLocalized(meta, 'producer') : '') || meta.composer || (typeof getLocalized === 'function' ? getLocalized(meta, 'composer') : '') || '';
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
        if (composer) parts.push((typeof LANG !== 'undefined' && LANG === 'ko') ? `제작: ${composer}` : `Producer: ${composer}`);
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
      if (window.syncFavoriteCache) window.syncFavoriteCache(id, window.FAVS.has(id));
      window.renderFavoritesStrip();
    });

    fstrip.appendChild(card);
  }
};

// ─── Pro offline favorites cache ─────────────────────────────────────────
// When a Pro user stars a track, fetch it into the service-worker-managed
// `5do-favorites-v1` cache so the audio plays without a network. sw.js
// intercepts audio URL requests and serves from this cache if present.
const OFFLINE_CACHE = '5do-favorites-v1';

window.buildTrackUrl = function buildTrackUrl(id) {
  // id is "folder/file" — resolves to the Supabase public URL.
  if (!id || typeof MEDIA_BASE === 'undefined') return null;
  const [folder, ...rest] = id.split('/');
  const file = rest.join('/');
  if (!folder || !file) return null;
  return MEDIA_BASE + '/' + encodeURIComponent(folder) + '/' + encodeURIComponent(file);
};

window.isProForOffline = function isProForOffline() {
  if (typeof SUB === 'undefined') return false;
  // Respect the subscription-live flag: if gating isn't live yet, treat
  // every user as Pro so the offline feature can be tested end-to-end.
  if (SUB.isLive && !SUB.isLive()) return true;
  return !!(SUB.isPro && SUB.isPro());
};

window.cacheFavoriteForOffline = async function cacheFavoriteForOffline(id) {
  if (!('caches' in window)) return false;
  if (!window.isProForOffline()) return false;
  const url = window.buildTrackUrl(id);
  if (!url) return false;
  try {
    const cache = await caches.open(OFFLINE_CACHE);
    // Check if already cached to avoid redundant download
    const hit = await cache.match(url, { ignoreSearch: true });
    if (hit) { window.dispatchEvent(new CustomEvent('fav-offline-status', { detail: { id, state: 'cached' } })); return true; }
    window.dispatchEvent(new CustomEvent('fav-offline-status', { detail: { id, state: 'downloading' } }));
    await cache.add(url); // fetches and stores the mp3
    window.dispatchEvent(new CustomEvent('fav-offline-status', { detail: { id, state: 'cached' } }));
    return true;
  } catch (e) {
    console.warn('[offline] cache failed for', id, e);
    window.dispatchEvent(new CustomEvent('fav-offline-status', { detail: { id, state: 'error', error: e.message } }));
    return false;
  }
};

window.removeCachedFavorite = async function removeCachedFavorite(id) {
  if (!('caches' in window)) return;
  const url = window.buildTrackUrl(id);
  if (!url) return;
  try {
    const cache = await caches.open(OFFLINE_CACHE);
    await cache.delete(url, { ignoreSearch: true });
    window.dispatchEvent(new CustomEvent('fav-offline-status', { detail: { id, state: 'removed' } }));
  } catch (_) {}
};

window.isTrackOfflineCached = async function isTrackOfflineCached(id) {
  if (!('caches' in window)) return false;
  const url = window.buildTrackUrl(id);
  if (!url) return false;
  try {
    const cache = await caches.open(OFFLINE_CACHE);
    const hit = await cache.match(url, { ignoreSearch: true });
    return !!hit;
  } catch (_) { return false; }
};

// Run on every favorite toggle so the cache stays in sync with FAVS.
window.syncFavoriteCache = function syncFavoriteCache(id, isNowFav) {
  if (isNowFav) window.cacheFavoriteForOffline(id);
  else          window.removeCachedFavorite(id);
};

// ─── Storage stats (for settings UI) ──────────────────────────────────────
window.getOfflineStorageStats = async function getOfflineStorageStats() {
  if (!('caches' in window)) return { count: 0, bytes: 0 };
  try {
    const cache = await caches.open(OFFLINE_CACHE);
    const keys = await cache.keys();
    let bytes = 0;
    for (const req of keys) {
      try {
        const res = await cache.match(req);
        if (res) {
          const buf = await res.clone().arrayBuffer();
          bytes += buf.byteLength;
        }
      } catch (_) {}
    }
    return { count: keys.length, bytes };
  } catch (_) { return { count: 0, bytes: 0 }; }
};

window.clearAllOfflineFavorites = async function clearAllOfflineFavorites() {
  if (!('caches' in window)) return;
  try { await caches.delete(OFFLINE_CACHE); } catch (_) {}
};

// ─── Backfill on first load — Pro user already has favorites, cache them ─
(function backfillOfflineCache() {
  // Wait for SUB + APP_USER to settle, then cache anything missing
  window.addEventListener('load', () => {
    setTimeout(async () => {
      if (!window.isProForOffline()) return;
      const list = [...(window.FAVS || [])];
      for (const id of list) {
        const has = await window.isTrackOfflineCached(id);
        if (!has) window.cacheFavoriteForOffline(id); // fire-and-forget
      }
    }, 2500);
  });
})();
