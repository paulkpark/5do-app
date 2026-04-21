/* ===== supabase-api.js: Supabase 스토리지 API 및 미디어 URL 헬퍼 ===== */

// SB 클라이언트는 5do.html의 인라인 <script>에서 초기화됨 (config.js 로드 후)

let TRACK_META = {};
let THUMB_VER = Date.now();
window.THUMB_VER = THUMB_VER;

/* ── URL 헬퍼 ── */

function stem(n) { return n.replace(/\.[^.]+$/, ''); }

function encFolderPath(folder) {
  if (!folder) return '';
  return folder.split('/').filter(Boolean).map(encodeURIComponent).join('/');
}

function mediaObjectUrl(folder, file) {
  const f = encFolderPath(folder);
  return f ? `${MEDIA_BASE}/${f}/${encodeURIComponent(file)}` : `${MEDIA_BASE}/${encodeURIComponent(file)}`;
}

function mediaFolderBase(folder) {
  const f = encFolderPath(folder);
  return f ? `${MEDIA_BASE}/${f}/` : `${MEDIA_BASE}/`;
}

function folderThumb(folder) {
  const base = mediaFolderBase(folder);
  const name = (LANG === 'en') ? 'folder_e.webp' : 'folder.webp';
  return `${base}${name}?v=${THUMB_VER}`;
}

function trackThumb(folder, file) {
  const base = mediaFolderBase(folder);
  const s = stem(file);
  const fname = (LANG === 'en') ? `${s}_E.webp` : `${s}.webp`;
  const ver = (typeof window.THUMB_VER !== 'undefined') ? window.THUMB_VER : THUMB_VER;
  return `${base}${fname}?v=${ver}`;
}

/* ── Meta JSON ── */

const LS_META = '5do_meta_v1';

// Stale-while-revalidate: on cold start, serve cached meta.json instantly so
// the library can render real titles in <50 ms, then hit the network in the
// background. Only the first-ever visit has to wait for the network.
async function loadTrackMeta() {
  // 1) Instant cache hydrate (synchronous localStorage read)
  let hadCache = false;
  try {
    const cached = JSON.parse(localStorage.getItem(LS_META) || 'null');
    if (cached && typeof cached === 'object' && Object.keys(cached).length > 0) {
      TRACK_META = cached;
      if (typeof window !== 'undefined') window.TRACK_META = cached;
      hadCache = true;
      console.log('[meta] served from cache:', Object.keys(cached).length, 'entries');
    }
  } catch (_) {}

  // 2) Background refresh — 5s timeout is enough; cache handles the fallback.
  const refresh = (async () => {
    try {
      const url = `${MEDIA_BASE}/meta.json?t=${Date.now()}`;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5000);
      const res = await fetch(url, { cache: 'no-store', signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) { console.warn('[meta] load failed', res.status); return; }
      const fresh = await res.json();
      TRACK_META = fresh;
      if (typeof window !== 'undefined') window.TRACK_META = fresh;
      try { localStorage.setItem(LS_META, JSON.stringify(fresh)); } catch (_) {}
      console.log('[meta] refreshed:', Object.keys(fresh).length, 'entries');
      // Re-render with fresh titles/translations
      if (typeof window !== 'undefined' && typeof window.refreshLibraryStrip === 'function') {
        window.refreshLibraryStrip();
      }
    } catch (e) { console.warn('[meta] error', e.message || e); }
  })();

  // If we served from cache, boot continues immediately. If not, boot must
  // wait (first-ever launch — there's simply no data to show otherwise).
  if (!hadCache) await refresh;
  else refresh.catch(() => {});
}

function getLocalized(meta, base) {
  if (!meta) return '';
  if (LANG === 'ko') return meta[`${base}_ko`] || meta[`${base}_kr`] || meta[base] || '';
  return meta[`${base}_en`] || meta[base] || meta[`${base}_ko`] || '';
}

function lookupFolderMeta(folder) {
  if (!TRACK_META) return null;
  return TRACK_META[`${folder}/_folder`] || TRACK_META[`${folder}/`] || null;
}

function lookupTrackMeta(folder, fileName) {
  if (!TRACK_META) return null;
  const s = stem(fileName);
  // Try all possible key formats: with extension, without, decoded folder name
  const decodedFolder = decodeURIComponent(folder);
  return TRACK_META[`${folder}/${fileName}`]
      || TRACK_META[`${decodedFolder}/${fileName}`]
      || TRACK_META[`${folder}/${s}`]
      || TRACK_META[`${decodedFolder}/${s}`]
      || TRACK_META[`${folder}/${s}.mp3`]
      || TRACK_META[`${decodedFolder}/${s}.mp3`]
      || TRACK_META[`${folder}/${s}.flac`]
      || TRACK_META[s] || null;
}

/* ── Storage list ── */

// localStorage keys for cold-start recovery on slow/flaky networks.
// When Supabase is reachable we save successful results here; on subsequent
// cold starts where the network is hung we serve the cached snapshot
// immediately so the library never paints empty.
const LS_FOLDERS = '5do_folders_v1';
const LS_TRACKS_PREFIX = '5do_tracks_v1_';

function _sortFolders(out) {
  const priority = (typeof window !== 'undefined' && window.NON_MEMBER_CATEGORIES)
    || ['Chakra_Activation', 'Meditation_and_Breathwork', 'White_Noise'];
  return out.sort((a, b) => {
    const ai = priority.indexOf(a);
    const bi = priority.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' });
  });
}

async function _fetchRootOnce() {
  let out = [], page = 0, more = true;
  while (more) {
    let data, error;
    try {
      const p = SB.storage.from(BUCKET).list('', { limit: 100, offset: page * 100 });
      const t = new Promise((_, rej) => setTimeout(() => rej(new Error('listRoot timeout')), 5000));
      ({ data, error } = await Promise.race([p, t]));
    } catch (e) { console.warn('[listRoot]', e.message || e); return null; }
    if (error) { console.warn('[listRoot]', error); return null; }
    const pageFolders = (data || []).filter(it => !/\./.test(it.name) && !it.name.startsWith('_')).map(it => it.name);
    out.push(...pageFolders);
    more = (data || []).length === 100;
    page++;
  }
  return out;
}

// Stale-while-revalidate: serve the cached folder list instantly (so the
// library paints in <50 ms even when Supabase IndexedDB is still waking up
// from cold) and refresh in the background. Only the first-ever launch has
// to wait for the network — every subsequent cold start is immediate.
async function listRoot() {
  // 1) Instant cache read
  let cached = null;
  try {
    const raw = JSON.parse(localStorage.getItem(LS_FOLDERS) || 'null');
    if (Array.isArray(raw) && raw.length > 0) cached = raw;
  } catch (_) {}

  // 2) Background refresh — also runs when cache is empty (first-ever load)
  const refresh = (async () => {
    let fresh = await _fetchRootOnce();
    if (fresh == null) {
      await new Promise(r => setTimeout(r, 1200));
      fresh = await _fetchRootOnce();
    }
    if (Array.isArray(fresh) && fresh.length > 0) {
      const sorted = _sortFolders(fresh);
      try { localStorage.setItem(LS_FOLDERS, JSON.stringify(sorted)); } catch (_) {}
      const cachedStr = cached ? JSON.stringify(cached) : '';
      const freshStr = JSON.stringify(sorted);
      if (cachedStr !== freshStr) {
        // Only trigger a re-render when the list actually changed — avoids
        // flicker on every boot.
        if (typeof STATE !== 'undefined') STATE.foldersCache = sorted;
        if (typeof window !== 'undefined' && typeof window.refreshLibraryStrip === 'function') {
          window.refreshLibraryStrip();
        }
      }
      return sorted;
    }
    return null;
  })();

  if (cached) {
    // Kick off refresh without blocking the caller.
    refresh.catch(() => {});
    return cached;
  }

  // No cache → first-ever launch. We must wait for the network.
  const result = await refresh;
  return Array.isArray(result) ? result : [];
}

async function _fetchTracksOnce(folder) {
  let list = [], page = 0, more = true;
  while (more) {
    let data, error;
    try {
      const p = SB.storage.from(BUCKET).list(folder, { limit: 100, offset: page * 100 });
      const t = new Promise((_, rej) => setTimeout(() => rej(new Error('listTracks timeout')), 5000));
      ({ data, error } = await Promise.race([p, t]));
    } catch (e) { console.warn('[listTracks]', folder, e.message || e); return null; }
    if (error) { console.warn('[listTracks]', folder, error); return null; }
    for (const it of (data || [])) {
      if (/\.(mp3|m4a|aac|wav|flac|ogg)$/i.test(it.name) && !/_qtx\./i.test(it.name)) list.push(it.name);
    }
    more = (data || []).length === 100;
    page++;
  }
  return list.sort((a, b) => a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' }));
}

// Stale-while-revalidate per-category: same pattern as listRoot. Previously-
// visited categories paint instantly; the background refresh picks up any
// new tracks added server-side.
async function listTracks(folder) {
  // In-memory cache — populated by prior calls within this session
  const mem = STATE.tracksCache[folder];
  if (mem && mem.length > 0) {
    // Still kick off a background refresh so new tracks appear on next render
    _refreshTracks(folder).catch(() => {});
    return mem;
  }

  // localStorage cache — instant paint on 2nd+ cold start
  let cached = null;
  try {
    const raw = JSON.parse(localStorage.getItem(LS_TRACKS_PREFIX + folder) || 'null');
    if (Array.isArray(raw) && raw.length > 0) cached = raw;
  } catch (_) {}

  if (cached) {
    STATE.tracksCache[folder] = cached;
    _refreshTracks(folder).catch(() => {});
    return cached;
  }

  // No cache → first visit to this category. Must wait for network.
  const fresh = await _refreshTracks(folder);
  return Array.isArray(fresh) ? fresh : [];
}

async function _refreshTracks(folder) {
  let list = await _fetchTracksOnce(folder);
  if (list == null) {
    await new Promise(r => setTimeout(r, 1200));
    list = await _fetchTracksOnce(folder);
  }
  if (Array.isArray(list) && list.length > 0) {
    const prev = STATE.tracksCache[folder];
    const prevStr = prev ? JSON.stringify(prev) : '';
    const freshStr = JSON.stringify(list);
    STATE.tracksCache[folder] = list;
    try { localStorage.setItem(LS_TRACKS_PREFIX + folder, JSON.stringify(list)); } catch (_) {}
    // Only re-render if something actually changed and user is still in this folder
    if (prevStr !== freshStr && typeof window !== 'undefined' && typeof window.refreshLibraryStrip === 'function') {
      if (typeof STATE !== 'undefined' && STATE.path === folder) window.refreshLibraryStrip();
    }
    return list;
  }
  return null;
}
