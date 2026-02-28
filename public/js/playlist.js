/* ===== playlist.js: 플레이리스트, 큐, 즐겨찾기 ===== */

function uid(){ return 'u'+Math.random().toString(36).slice(2)+Date.now().toString(36); }
function getUserId(){ let x=localStorage.getItem(USER_ID_KEY); if(!x){ x=uid(); localStorage.setItem(USER_ID_KEY,x); } return x; }
const USER_ID = getUserId();

const PL_CLOUD_PATH = `playlists/${USER_ID}.json`;

function nowISO(){ return new Date().toISOString(); }
function newPLState(){ return {version:1,updatedAt:nowISO(),lists:[]}; }

function loadPLLocal(){
  try{
    const raw = localStorage.getItem(PL_KEY);
    if(!raw) return null;
    return JSON.parse(raw);
  }catch{ return null; }
}
function savePLLocal(obj){
  try{
    obj.updatedAt = nowISO();
    localStorage.setItem(PL_KEY, JSON.stringify(obj));
  }catch{}
}

async function loadPLCloud(){
  const url = `${MEDIA_BASE}/${PL_CLOUD_PATH}`;
  try{
    const res = await fetch(url+'?t='+Date.now(), {cache:'no-store'});
    if(!res.ok) return null;
    return await res.json();
  }catch{ return null; }
}
async function savePLCloud(obj){
  try{
    const { error } = await SB.storage.from(BUCKET)
      .upload(PL_CLOUD_PATH, new Blob([JSON.stringify(obj)], {type:'application/json'}), { upsert:true });
    if(error) throw error;
    return true;
  }catch(e){
    console.warn('[playlist] cloud save failed', e);
    return false;
  }
}

async function syncPlaylists(){
  let local = loadPLLocal();
  let cloud = await loadPLCloud();

  if(!local && !cloud){
    local = newPLState();
    savePLLocal(local);
    await savePLCloud(local);
    return local;
  }
  if(local && !cloud){
    await savePLCloud(local);
    return local;
  }
  if(!local && cloud){
    savePLLocal(cloud);
    return cloud;
  }

  const L = new Date(local.updatedAt||0).getTime();
  const C = new Date(cloud.updatedAt||0).getTime();
  const base = (C > L) ? cloud : local;

  savePLLocal(base);
  if(C < L) await savePLCloud(base);
  return base;
}

let PL_STATE = null;
let CURRENT_TRACK = null;

function ensurePLState(){
  if(!PL_STATE || typeof PL_STATE !== 'object') PL_STATE = newPLState();
  if(!Array.isArray(PL_STATE.lists)) PL_STATE.lists = [];
  if(!PL_STATE.updatedAt) PL_STATE.updatedAt = nowISO();
  if(!PL_STATE.version) PL_STATE.version = 1;
  return PL_STATE;
}

// 최소 기본값
ensurePLState();

const plPanel = document.getElementById('plPanel'),
      plBody  = document.getElementById('plBody');

/* ===== Queue / Mode / Loop (3번) ===== */
let PL_MODE = 'order';      // 'order' | 'shuffle'
let PL_LOOP = 'off';        // 'off' | 'all'
let PL_QUEUE = [];          // [{title,url,path,file}]
let PL_INDEX = -1;
let PL_ACTIVE_LIST_ID = null;

function shuffleArray(arr){
  const a = arr.slice();
  for(let i=a.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}

function plToast(msg){
  const el = document.getElementById('plToast');
  if(!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(plToast._t);
  plToast._t = setTimeout(()=> el.classList.remove('show'), 900);
}

function updatePLControlsUI(){
  const sh = document.getElementById('plShuffleBtn');
  const lp = document.getElementById('plLoopBtn');
  const bd = document.getElementById('plLoopBadge');
  const prev = document.getElementById('plPrevBtn');
  const next = document.getElementById('plNextBtn');

  if(sh){
    sh.classList.toggle('is-on', PL_MODE === 'shuffle');
  }
  if(lp){
    lp.classList.toggle('is-on', PL_LOOP === 'all');
    lp.classList.toggle('is-loop-all', PL_LOOP === 'all');
    if(bd){
      bd.style.display = (PL_LOOP === 'all') ? 'inline-block' : 'none';
      bd.textContent = (PL_LOOP === 'all') ? '∞' : '1';
    }
  }
  const hasQ = PL_QUEUE.length > 0;
  if(prev) prev.disabled = !hasQ;
  if(next) next.disabled = !hasQ;
}

function highlightPlayingItem(){
  const curUrl = PL_QUEUE[PL_INDEX]?.url || CURRENT_TRACK?.url || '';
  document.querySelectorAll('#plBody .pl-item').forEach(el=>{
    const u = el.getAttribute('data-url');
    el.classList.toggle('is-playing', !!curUrl && u === curUrl);
  });
}

function setQueueFromListId(listId, startIndex=0){
  ensurePLState();
  const list = PL_STATE.lists.find(x => x.id === listId);
  if(!list || !Array.isArray(list.items) || list.items.length===0) return false;

  PL_ACTIVE_LIST_ID = listId;

  let base = list.items.map(it => ({
    title: it.title || it.file || it.url || 'Untitled',
    url: it.url,
    path: it.path || '',
    file: it.file || ''
  })).filter(x => !!x.url);

  if(base.length===0) return false;

  if(PL_MODE === 'shuffle'){
    const cur = base[startIndex] || base[0];
    base = shuffleArray(base);
    PL_QUEUE = base;
    PL_INDEX = PL_QUEUE.findIndex(x => x.url === cur.url);
    if(PL_INDEX < 0) PL_INDEX = 0;
  }else{
    PL_QUEUE = base;
    PL_INDEX = Math.max(0, Math.min(startIndex, PL_QUEUE.length-1));
  }

  updatePLControlsUI();
  highlightPlayingItem();
  return true;
}

function playFromQueue(index){
  if(!PL_QUEUE.length) return;
  const idx = Math.max(0, Math.min(index, PL_QUEUE.length-1));
  const t = PL_QUEUE[idx];
  if(!t?.url) return;

  PL_INDEX = idx;

  player.src = t.url;
  player.load?.();
  player.play().catch(()=>{});

  statusTitle.textContent = t.title || 'Untitled';
  statusTitle.classList.add('playing');

  STATE.currentTrack = { name: t.title, url: t.url };
  CURRENT_TRACK = { title: t.title, url: t.url, path: t.path, file: t.file };

  // 썸네일 갱신(가능한 경우)
  (async()=>{
    try{
      if(t.path && t.file){
        const u2 = await trackThumb(t.path, t.file);
        if(u2){
          statusThumb.classList.remove('status-blank');
        statusThumb.dataset.thumbMode = 'track';
          setStatusThumb(statusThumb, `${u2}`);
        }
      }
    }catch(err){
      console.warn('playlist thumb update failed', err);
    }
  })();

  updatePLControlsUI();
  highlightPlayingItem();
}

function nextInQueue(){
  if(!PL_QUEUE.length) return;
  let next = PL_INDEX + 1;
  if(next >= PL_QUEUE.length){
    if(PL_LOOP === 'all') next = 0;
    else return;
  }
  playFromQueue(next);
}

function prevInQueue(){
  if(!PL_QUEUE.length) return;
  let prev = PL_INDEX - 1;
  if(prev < 0){
    if(PL_LOOP === 'all') prev = PL_QUEUE.length - 1;
    else prev = 0;
  }
  playFromQueue(prev);
}

// 자동 다음곡 (3번)
player.addEventListener('ended', () => {
  if(!PL_QUEUE.length) return;
  nextInQueue();
});

function openPlPanel(){
  if (typeof applyLang === 'function') applyLang();
  // ✅ 항상 라이브러리 탭을 배경으로 사용
  if (typeof showPage === 'function') showPage('lib');

  plPanel.style.display = 'block';
  ensurePLState();
  renderPL();

  // (선택) 백그라운드 동기화: 늦게 도착해도 UI 갱신
  syncPlaylists().then((state)=>{
    PL_STATE = state;
    ensurePLState();
    renderPL();
  }).catch(()=>{});
}

function closePlPanel(){
  plPanel.style.display = 'none';
}

/* ===== Render playlists + items ===== */
function renderPL(){
  ensurePLState();
  plBody.innerHTML = '';

  const lists = PL_STATE.lists || [];
  if(lists.length === 0){
    const row = document.createElement('div');
    row.className = 'pl-row';
    row.textContent = (LANG === 'en' ? I18N.en['pl.no'] : I18N.ko['pl.no']);
    plBody.appendChild(row);
    return;
  }

  lists.forEach((pl, i) => {
    // ---- Playlist header row ----
    const row = document.createElement('div');
    row.className = 'pl-row';

    const name = document.createElement('input');
    name.className = 'gen-input';
    name.value = pl.name || ('List ' + (i + 1));
    name.addEventListener('input', () => { pl.name = name.value; });

    const cnt = document.createElement('div');
    cnt.style.opacity = .7;
    cnt.textContent = `${(pl.items?.length || 0)} ${LANG === 'en' ? 'tracks' : '곡'}`;

    const left = document.createElement('div');
    left.style.display = 'flex';
    left.style.gap = '10px';
    left.append(name, cnt);

    const del = document.createElement('button');
    del.className = 'btn small';
    del.setAttribute('data-i18n', 'pl.delete');
    del.textContent = I18N[LANG]['pl.delete'] || (LANG==='en'?'Delete':'삭제');
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      PL_STATE.lists.splice(i, 1);
      // 리스트 삭제되면 큐가 그 리스트였을 수도 있음
      if(PL_ACTIVE_LIST_ID && pl.id === PL_ACTIVE_LIST_ID){
        PL_QUEUE = []; PL_INDEX = -1; PL_ACTIVE_LIST_ID = null;
        updatePLControlsUI();
      }
      renderPL();
    });

    row.append(left, del);
    plBody.appendChild(row);

    // ---- Items section ----
    if(!Array.isArray(pl.items)) pl.items = [];

    if(pl.items.length === 0){
      const empty = document.createElement('div');
      empty.className = 'pl-item pl-item-empty';
      empty.style.opacity = .6;
      empty.style.padding = '8px 10px';
      empty.textContent = (LANG === 'en' ? 'No tracks' : '곡 없음');
      plBody.appendChild(empty);
      return;
    }

    pl.items.forEach((it, j) => {
      const item = document.createElement('div');
      item.className = 'pl-item';
      item.style.display = 'flex';
      item.style.alignItems = 'center';
      item.style.justifyContent = 'space-between';
      item.style.gap = '10px';
      item.style.padding = '8px 10px';
      item.style.cursor = 'pointer';

      // 클릭 재생용 데이터
      item.setAttribute('data-url', it.url || '');
      item.setAttribute('data-title', it.title || '');
      item.setAttribute('data-path', it.path || '');
      item.setAttribute('data-file', it.file || '');

      // (4번) 소속 재생목록 id + 인덱스 추가
      item.setAttribute('data-plid', pl.id || '');
      item.setAttribute('data-idx', String(j));

      const label = document.createElement('div');
      label.className = 'pl-item-label';
      label.style.flex = '1';
      label.style.minWidth = '0';
      label.style.overflow = 'hidden';
      label.style.textOverflow = 'ellipsis';
      label.style.whiteSpace = 'nowrap';
      label.textContent = it.title || it.file || it.url || 'Untitled';

      const delBtn = document.createElement('button');
delBtn.className = 'btn small pl-item-del';

// ✅ 2번안 핵심: data-i18n 키 부여 (applyLang이 토글 때 자동 갱신)
delBtn.setAttribute('data-i18n', 'pl.removeTrack');

// ✅ 초기 렌더 시점 텍스트(토글은 applyLang이 처리)
delBtn.textContent = (I18N[LANG] && I18N[LANG]['pl.removeTrack'])
  ? I18N[LANG]['pl.removeTrack']
  : (LANG === 'en' ? 'Remove' : '삭제');

delBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  pl.items.splice(j, 1);

  // 큐가 이 리스트라면, URL 기준으로 큐도 재구성(안전)
  if(PL_ACTIVE_LIST_ID && (pl.id === PL_ACTIVE_LIST_ID)){
    const curUrl = PL_QUEUE[PL_INDEX]?.url;
    setQueueFromListId(PL_ACTIVE_LIST_ID, 0);
    if(curUrl){
      const ni = PL_QUEUE.findIndex(x=>x.url===curUrl);
      PL_INDEX = (ni>=0)? ni : Math.min(PL_INDEX, PL_QUEUE.length-1);
    }
    updatePLControlsUI();
  }

  renderPL();
});

item.append(label, delBtn);
plBody.appendChild(item);
    });
  });

  // 렌더 후 하이라이트 갱신
  highlightPlayingItem();
  updatePLControlsUI();
}

/* ===== Playlist events (stable with dynamic DOM) =====
   - 버튼/아이템이 innerHTML로 바뀌어도 항상 동작하도록 "이벤트 위임" 사용
*/
plPanel.addEventListener('click', async (e) => {
  // ---- New list ----
  if (e.target.closest('#plNewBtn')) {
    ensurePLState();
    PL_STATE.lists.push({
      id: 'pl_' + Date.now(),
      name: (LANG==='en' ? I18N.en['pl.new'] : I18N.ko['pl.new']),
      items: []
    });
    renderPL();
    return;
  }

  // ---- Close ----
  if (e.target.closest('#plCloseBtn')) {
    closePlPanel();
    return;
  }

  // ---- Save ----
  if (e.target.closest('#plSaveBtn')) {
    ensurePLState();
    savePLLocal(PL_STATE);
    await savePLCloud(PL_STATE);
    closePlPanel();
    return;
  }

  // ---- Export ----
  if (e.target.closest('#plExportBtn')) {
    ensurePLState();
    const blob = new Blob([JSON.stringify(PL_STATE, null, 2)], { type:'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'playlists.json';
    a.click();
    return;
  }

  // ---- Import ----
  if (e.target.closest('#plImportBtn')) {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'application/json';
    inp.onchange = async () => {
      const f = inp.files?.[0];
      if(!f) return;
      try{
        const text = await f.text();
        const json = JSON.parse(text);

        ensurePLState();
        if (json && Array.isArray(json.lists)) {
          // ✅ 재할당(PL_STATE=json) 금지: lists만 교체
          PL_STATE.lists = json.lists;
          PL_STATE.updatedAt = nowISO();
          renderPL();
        }
      }catch(err){
        console.warn('import failed', err);
      }
    };
    inp.click();
    return;
  }

  // ---- Add current track ----
  if (e.target.closest('#plAddCurrentBtn')) {
    if (!CURRENT_TRACK) {
      alert(LANG === 'en'
        ? 'Please select or play a track first.'
        : '먼저 라이브러리에서 곡을 선택하거나 재생하세요.'
      );
      return;
    }

    ensurePLState();
    if (!PL_STATE.lists.length) {
      alert(LANG === 'en'
        ? 'No playlist found. Please create one first.'
        : '재생목록이 없습니다. 먼저 새 재생목록을 만드세요.'
      );
      return;
    }

    const msg = PL_STATE.lists.map((pl, i) => `${i+1}. ${pl.name}`).join('\n');
    const n = prompt((LANG==='en' ? 'Add to which playlist?\n' : '어느 재생목록에 추가할까요?\n') + msg);
    const idx = parseInt(n, 10) - 1;
    if (isNaN(idx) || idx < 0 || idx >= PL_STATE.lists.length) return;

    const pl = PL_STATE.lists[idx];
    if(!Array.isArray(pl.items)) pl.items = [];

    const ref = {
      id: 't_' + (CURRENT_TRACK.path || '') + '_' + (CURRENT_TRACK.file || Date.now()),
      title: CURRENT_TRACK.title || 'Untitled',
      url: CURRENT_TRACK.url,
      path: CURRENT_TRACK.path || '',
      file: CURRENT_TRACK.file || ''
    };

    if (pl.items.some(it => it.url === ref.url)) return;
    pl.items.push(ref);
    renderPL();
    return;
  }

  // ===== (5번) 컨트롤 버튼 핸들링: 존재할 때만 동작 =====
  if (e.target.closest('#plShuffleBtn')) {
    PL_MODE = (PL_MODE === 'order') ? 'shuffle' : 'order';
    updatePLControlsUI();
    plToast(PL_MODE === 'shuffle'
      ? (LANG==='en'?'Shuffle On':'랜덤 재생 켜짐')
      : (LANG==='en'?'Shuffle Off':'랜덤 재생 꺼짐')
    );

    // 큐가 이미 있으면 현재곡 유지하면서 재구성
    if (PL_ACTIVE_LIST_ID && PL_QUEUE.length) {
      const curUrl = PL_QUEUE[PL_INDEX]?.url;
      const list = PL_STATE.lists.find(x=>x.id===PL_ACTIVE_LIST_ID);
      const startIndex = list?.items?.findIndex(it=>it.url===curUrl) ?? 0;
      setQueueFromListId(PL_ACTIVE_LIST_ID, Math.max(0,startIndex));
      playFromQueue(PL_INDEX);
    }
    return;
  }

  if (e.target.closest('#plLoopBtn')) {
    PL_LOOP = (PL_LOOP === 'off') ? 'all' : 'off';
    updatePLControlsUI();
    plToast(PL_LOOP === 'all'
      ? (LANG==='en'?'Loop All':'전체 반복')
      : (LANG==='en'?'Loop Off':'반복 해제')
    );
    return;
  }

  if (e.target.closest('#plPrevBtn')) { prevInQueue(); return; }
  if (e.target.closest('#plNextBtn')) { nextInQueue(); return; }

  if (e.target.closest('#plPlayAllBtn')) {
    ensurePLState();
    const targetId = PL_ACTIVE_LIST_ID || PL_STATE.lists?.[0]?.id;
    if(!targetId){
      plToast(LANG==='en'?'No playlist':'재생목록 없음');
      return;
    }
    const ok = setQueueFromListId(targetId, 0);
    if(!ok){ plToast(LANG==='en'?'No tracks':'곡 없음'); return; }
    playFromQueue(PL_INDEX);
    return;
  }

  // ---- Click playlist item -> play (큐 기반) ----
  const itemEl = e.target.closest('.pl-item');
  if (itemEl) {
    // 삭제 버튼이면 재생 금지
    if (e.target.closest('.pl-item-del')) return;

    const listId = itemEl.getAttribute('data-plid') || '';
    const idx = parseInt(itemEl.getAttribute('data-idx') || '0', 10) || 0;

    const ok = setQueueFromListId(listId, idx);
    if(!ok) return;

    playFromQueue(PL_INDEX);
    return;
  }
});
/* ===== Generator (WebAudio) ===== */
let aCtx=null, analyser=null;
let oscNodes=[];
let GEN_PLAYING=false;
let GEN_GAIN = 1.0; // 0.0 ~ 2.0
let GEN_LIMITER_ON = true;
let GEN_MASTER_GAIN_NODE = null;
let GEN_LIMITER_NODE = null;

let zoom = 1, gamma = 1, line = 1;   // ★ 기본값 추가
const cvs = document.getElementById('osc'), ctx2d = cvs.getContext('2d');
let rafId = 0;

