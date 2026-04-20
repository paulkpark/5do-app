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

async function loadTrackMeta() {
  try {
    const url = `${MEDIA_BASE}/meta.json?t=${Date.now()}`;
    // 8s timeout prevents a hung request from blocking the init chain
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url, { cache: 'no-store', signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) { console.warn('[meta] load failed', res.status); return; }
    TRACK_META = await res.json();
    console.log('[meta] loaded', Object.keys(TRACK_META).length, 'entries');
  } catch(e) { console.warn('[meta] error', e.message || e); }
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
      const t = new Promise((_, rej) => setTimeout(() => rej(new Error('listRoot timeout')), 8000));
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

async function listRoot() {
  let out = await _fetchRootOnce();

  // First attempt failed entirely (timeout or storage error). Try once more
  // after a short delay — covers Supabase IndexedDB cold-start jitter.
  if (out == null) {
    await new Promise(r => setTimeout(r, 1200));
    out = await _fetchRootOnce();
  }

  if (Array.isArray(out) && out.length > 0) {
    const sorted = _sortFolders(out);
    try { localStorage.setItem(LS_FOLDERS, JSON.stringify(sorted)); } catch (_) {}
    return sorted;
  }

  // Network is hung or both attempts failed — serve the last-good snapshot
  // so the library still paints. The user can navigate normally; track lists
  // and thumbnails come from the same Supabase URLs and will recover when
  // the network does.
  try {
    const cached = JSON.parse(localStorage.getItem(LS_FOLDERS) || 'null');
    if (Array.isArray(cached) && cached.length > 0) {
      console.log('[listRoot] localStorage fallback used:', cached.length, 'folders');
      return cached;
    }
  } catch (_) {}
  return Array.isArray(out) ? out : [];
}

async function _fetchTracksOnce(folder) {
  let list = [], page = 0, more = true;
  while (more) {
    let data, error;
    try {
      const p = SB.storage.from(BUCKET).list(folder, { limit: 100, offset: page * 100 });
      const t = new Promise((_, rej) => setTimeout(() => rej(new Error('listTracks timeout')), 8000));
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

async function listTracks(folder) {
  // Only trust a cached result that actually contains tracks. An empty or errored
  // fetch must NOT poison the cache — otherwise a single network hiccup on the
  // first visit to a category leaves that category permanently empty for the
  // rest of the session.
  const cached = STATE.tracksCache[folder];
  if (cached && cached.length > 0) return cached;

  let list = await _fetchTracksOnce(folder);

  // First attempt failed entirely — retry once after a brief delay.
  if (list == null) {
    await new Promise(r => setTimeout(r, 1200));
    list = await _fetchTracksOnce(folder);
  }

  if (Array.isArray(list) && list.length > 0) {
    STATE.tracksCache[folder] = list;
    try { localStorage.setItem(LS_TRACKS_PREFIX + folder, JSON.stringify(list)); } catch (_) {}
    return list;
  }

  // Both attempts failed → serve last-good per-folder snapshot if any.
  try {
    const ls = JSON.parse(localStorage.getItem(LS_TRACKS_PREFIX + folder) || 'null');
    if (Array.isArray(ls) && ls.length > 0) {
      console.log('[listTracks] localStorage fallback used:', folder, ls.length, 'tracks');
      STATE.tracksCache[folder] = ls;
      return ls;
    }
  } catch (_) {}
  return Array.isArray(list) ? list : [];
}
