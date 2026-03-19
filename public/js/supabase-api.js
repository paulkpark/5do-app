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
  return `${base}${name}?width=320&quality=70&format=webp&v=${THUMB_VER}`;
}

function trackThumb(folder, file) {
  const base = mediaFolderBase(folder);
  const s = stem(file);
  const fname = (LANG === 'en') ? `${s}_E.webp` : `${s}.webp`;
  const ver = (typeof window.THUMB_VER !== 'undefined') ? window.THUMB_VER : THUMB_VER;
  return `${base}${fname}?width=320&quality=70&format=webp&v=${ver}`;
}

/* ── Meta JSON ── */

async function loadTrackMeta() {
  try {
    const url = `${MEDIA_BASE}/meta.json?t=${Date.now()}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) { console.warn('[meta] load failed', res.status); return; }
    TRACK_META = await res.json();
    console.log('[meta] loaded', TRACK_META);
  } catch(e) { console.warn('[meta] error', e); }
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
  return TRACK_META[`${folder}/${s}`] || TRACK_META[`${folder}/${fileName}`] || TRACK_META[s] || null;
}

/* ── Storage list ── */

async function listRoot() {
  let out = [], page = 0, more = true;
  while (more) {
    const { data, error } = await SB.storage.from(BUCKET).list('', { limit: 100, offset: page * 100 });
    if (error) { console.warn(error); break; }
    const pageFolders = (data || []).filter(it => !/\./.test(it.name) && !it.name.startsWith('_')).map(it => it.name);
    out.push(...pageFolders);
    more = (data || []).length === 100;
    page++;
  }
  return out.sort((a, b) => a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' }));
}

async function listTracks(folder) {
  if (STATE.tracksCache[folder]) return STATE.tracksCache[folder];
  let list = [], page = 0, more = true;
  while (more) {
    const { data, error } = await SB.storage.from(BUCKET).list(folder, { limit: 100, offset: page * 100 });
    if (error) { console.warn(error); break; }
    for (const it of (data || [])) {
      if (/\.(mp3|m4a|aac|wav|flac|ogg)$/i.test(it.name)) list.push(it.name);
    }
    more = (data || []).length === 100;
    page++;
  }
  list = list.sort((a, b) => a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' }));
  STATE.tracksCache[folder] = list;
  return list;
}
