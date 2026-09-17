/* ── Natal reading UI ────────────────────────────────────────────────────
   Framework-free. Mounts into any element; the host app supplies a provider:

     mount(el, {
       lang: 'ko' | 'en',
       sample(prompt, {onText, modelTier, signal}) -> Promise<{text}>,
       download(filename, text),            // optional
       entitlement: { canRead: bool, remaining: number|null, onUpgrade() },
       onLangChange(lang),                  // optional, to sync host UI
       loadCached(chartKey, lang),          // optional -> {n: text} | null
       saveCached(chartKey, lang, n, text)  // optional
     })

   `entitlement.canRead === false` hides every generate control and shows the
   upgrade block instead. The chart and all data tables stay visible — that is
   the free tier.
   ─────────────────────────────────────────────────────────────────────── */
import * as C from '../engine/core.js';
import * as Chart from '../engine/chart.js';
import { SECTIONS, buildPrompt, serializeChart } from '../engine/prompts.js';
import {
  ui, signName, bodyName, dignityName, aspectName, patternName,
  elementName, modalityName, solarPhaseName
} from '../engine/i18n.js';
import { wheelSVG } from './wheel.js';
import { PLACES, cityName, regionName } from './places.js';

let root, P = {}, S = {
  lang: 'ko', input: null, chart: null, timing: null,
  sections: { ko: {}, en: {} }, deep: false, busy: false, tab: 'planets', selected: null
};

export function mount(el, provider = {}) {
  root = el;
  P = provider;
  S.lang = provider.lang || 'ko';
  const saved = loadLocal();
  if (saved) { S.deep = !!saved.deep; if (!provider.lang && saved.lang) S.lang = saved.lang; }
  entryView();
  return { setLang, getChart: () => S.chart, destroy: () => { root.innerHTML = ''; } };
}

export function setLang(lang) {
  S.lang = lang;
  saveLocal();
  if (S.chart) resultView(); else entryView();
  if (P.onLangChange) P.onLangChange(lang);
}

const T = k => ui(S.lang, k);
const bn = k => bodyName(S.lang, k);
const sn = i => signName(S.lang, i);
const pad = n => String(n).padStart(2, '0');
const $ = id => root.querySelector('#' + id);
const esc = s => String(s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));

function chartKey() {
  const i = S.input;
  return [i.year, i.month, i.date, i.hour, i.minute, i.lat.toFixed(4), i.lon.toFixed(4), i.timeUnknown ? 'u' : 't'].join('|');
}

/* ── local convenience storage (never the source of truth) ───────────── */
function saveLocal() {
  try {
    localStorage.setItem('5d.astro', JSON.stringify({
      input: S.input, deep: S.deep, lang: S.lang, key: S.input ? chartKey() : null,
      sections: S.sections
    }));
  } catch (e) { }
}
function loadLocal() {
  try { return JSON.parse(localStorage.getItem('5d.astro') || 'null'); } catch (e) { return null; }
}

/* ── markdown ────────────────────────────────────────────────────────── */
function inline(s) {
  return esc(s)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/`([^`]+)`/g, '<em>$1</em>');
}
function md(src) {
  const lines = String(src).split('\n'), out = [];
  let i = 0, buf = [];
  const flush = () => { if (buf.length) { out.push('<p>' + buf.join('<br>') + '</p>'); buf = []; } };
  while (i < lines.length) {
    const l = lines[i];
    if (/^\s*$/.test(l)) { flush(); i++; continue; }
    if (/^\s*\|/.test(l) && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|/.test(lines[i + 1])) {
      flush();
      const head = l.split('|').slice(1, -1).map(c => '<th>' + inline(c.trim()) + '</th>').join('');
      i += 2;
      const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) {
        rows.push('<tr>' + lines[i].split('|').slice(1, -1).map(c => '<td>' + inline(c.trim()) + '</td>').join('') + '</tr>');
        i++;
      }
      out.push('<table><thead><tr>' + head + '</tr></thead><tbody>' + rows.join('') + '</tbody></table>');
      continue;
    }
    const h = l.match(/^(#{2,4})\s+(.*)$/);
    if (h) { flush(); const lvl = h[1].length === 2 ? 2 : 3; out.push(`<h${lvl}>${inline(h[2])}</h${lvl}>`); i++; continue; }
    if (/^\s*(---|___|\*\*\*)\s*$/.test(l)) { flush(); out.push('<hr>'); i++; continue; }
    if (/^\s*>/.test(l)) { flush(); out.push('<blockquote>' + inline(l.replace(/^\s*>\s?/, '')) + '</blockquote>'); i++; continue; }
    if (/^\s*([-*+]|\d+\.)\s+/.test(l)) {
      flush();
      const ol = /^\s*\d+\./.test(l), items = [];
      while (i < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(lines[i])) {
        items.push('<li>' + inline(lines[i].replace(/^\s*([-*+]|\d+\.)\s+/, '')) + '</li>'); i++;
      }
      out.push(`<${ol ? 'ol' : 'ul'}>${items.join('')}</${ol ? 'ol' : 'ul'}>`);
      continue;
    }
    buf.push(inline(l)); i++;
  }
  flush();
  return out.join('');
}

/* ── language toggle ─────────────────────────────────────────────────── */
function langToggle() {
  return `<div class="langs">
    <button data-l="ko" class="${S.lang === 'ko' ? 'on' : ''}">한국어</button>
    <button data-l="en" class="${S.lang === 'en' ? 'on' : ''}">English</button>
  </div>`;
}
function wireLang() {
  root.querySelectorAll('.langs button').forEach(b => {
    b.addEventListener('click', () => { if (b.dataset.l !== S.lang) setLang(b.dataset.l); });
  });
}

/* ── entry ───────────────────────────────────────────────────────────── */
function entryView() {
  root.innerHTML = `
    ${langToggle()}
    <div class="mast">
      ${wheelSVG(null)}
      <h1>${T('appTitle')}</h1>
      <p>${T('tagline')}</p>
    </div>
    <div class="form">
      <div class="field"><label for="nm">${T('name')}</label><input id="nm" placeholder="${T('namePh')}" autocomplete="off"></div>
      <div class="field"><label for="bd">${T('birthDate')}</label><input id="bd" inputmode="numeric" placeholder="${T('birthDatePh')}" maxlength="10" autocomplete="off"></div>
      <div class="field"><label for="bt">${T('birthTime')}</label><input id="bt" inputmode="numeric" placeholder="${T('birthTimePh')}" maxlength="5" autocomplete="off">
        <div class="hint">${T('birthTimeHint')}</div></div>
      <label class="check"><input type="checkbox" id="unk"> ${T('timeUnknown')}</label>
      <div class="field" id="pf"><label for="pl">${T('birthPlace')}</label><input id="pl" placeholder="${T('birthPlacePh')}" autocomplete="off">
        <div class="hint">${T('placeHint')}</div></div>
      <button class="go" id="run">${T('compute')}</button>
      <div class="foot">${T('footerCalc')}</div>
    </div>`;

  const saved = loadLocal();
  if (saved && saved.input) {
    const p = saved.input;
    $('nm').value = p.name || '';
    $('bd').value = `${p.year}-${pad(p.month)}-${pad(p.date)}`;
    $('bt').value = p.timeUnknown ? '' : `${pad(p.hour)}:${pad(p.minute)}`;
    $('unk').checked = !!p.timeUnknown;
    $('pl').value = p.placeLabel || '';
    S.selected = { lat: p.lat, lon: p.lon, label: p.placeLabel };
  }
  wireLang();
  wireForm();
}

function wireForm() {
  ['nm', 'bd', 'bt', 'pl'].forEach(id => {
    const el = $(id);
    el.addEventListener('focus', () => el.closest('.field').classList.add('focus'));
    el.addEventListener('blur', () => setTimeout(() => el.closest('.field').classList.remove('focus'), 150));
  });
  $('bd').addEventListener('input', e => {
    const v = e.target.value.replace(/[^\d]/g, '').slice(0, 8);
    e.target.value = v.length > 6 ? `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6)}`
      : v.length > 4 ? `${v.slice(0, 4)}-${v.slice(4)}` : v;
  });
  $('bt').addEventListener('input', e => {
    const v = e.target.value.replace(/[^\d]/g, '').slice(0, 4);
    e.target.value = v.length > 2 ? `${v.slice(0, 2)}:${v.slice(2)}` : v;
  });
  $('unk').addEventListener('change', function () {
    $('bt').disabled = this.checked;
    $('bt').style.opacity = this.checked ? .35 : 1;
  });

  const pl = $('pl');
  let box = null, idx = -1, rows = [], seq = 0, debounce = null, abort = null;

  const close = () => { if (box) { box.remove(); box = null; idx = -1; rows = []; } };

  function localMatches(q) {
    return PLACES.filter(r =>
      r[0].toLowerCase().startsWith(q) || r[2].toLowerCase().startsWith(q) ||
      r[1].toLowerCase().includes(q) || r[2].toLowerCase().includes(q)
    ).slice(0, 6).map(r => ({
      name: cityName(r, S.lang), region: regionName(r, S.lang), lat: r[3], lon: r[4]
    }));
  }

  function manualMatch(q) {
    const m = q.match(/^(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)$/);
    if (!m) return null;
    const lat = +m[1], lon = +m[2];
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    return { name: `${T('latitude')} ${lat} / ${T('longitude')} ${lon}`, region: T('manualEntry'), lat, lon, manual: true };
  }

  function paintSuggestions(list, loading) {
    rows = list;
    if (!rows.length && !loading) { close(); return; }
    if (!box) { box = document.createElement('div'); box.className = 'sugg'; $('pf').appendChild(box); }
    box.innerHTML =
      rows.map((r, i) => `<div data-i="${i}">${esc(r.name)}<small>${esc(r.region)}</small></div>`).join('') +
      (loading ? `<div class="searching"><span class="tick"></span>${T('searching')}</div>` : '');
    [...box.querySelectorAll('div[data-i]')].forEach(elm => {
      elm.addEventListener('mousedown', ev => {
        ev.preventDefault();
        const r = rows[+elm.dataset.i];
        S.selected = { lat: r.lat, lon: r.lon, label: r.manual ? r.name : `${r.name}${r.region ? ' (' + r.region + ')' : ''}` };
        pl.value = S.selected.label;
        close();
      });
    });
    idx = -1;
  }

  pl.addEventListener('input', () => {
    S.selected = null;
    const q = pl.value.trim();
    const lc = q.toLowerCase();
    if (debounce) { clearTimeout(debounce); debounce = null; }
    if (abort) { abort.abort(); abort = null; }
    if (!q) { close(); return; }

    const manual = manualMatch(q);
    if (manual) { paintSuggestions([manual], false); return; }

    const local = localMatches(lc);
    const canRemote = !!P.geocode && q.length >= 2;
    paintSuggestions(local, canRemote);
    if (!canRemote) return;

    const mySeq = ++seq;
    debounce = setTimeout(() => {
      abort = typeof AbortController !== 'undefined' ? new AbortController() : null;
      Promise.resolve(P.geocode(q, S.lang, abort ? abort.signal : undefined))
        .then(remote => {
          if (mySeq !== seq) return;
          const seen = new Set(local.map(r => r.lat.toFixed(2) + ',' + r.lon.toFixed(2)));
          const merged = local.concat(
            (remote || []).filter(r => {
              const k = r.lat.toFixed(2) + ',' + r.lon.toFixed(2);
              if (seen.has(k)) return false;
              seen.add(k);
              return true;
            })
          ).slice(0, 10);
          paintSuggestions(merged, false);
        })
        .catch(() => { if (mySeq === seq) paintSuggestions(local, false); });
    }, 380);
  });

  pl.addEventListener('keydown', e => {
    if (!box) return;
    const items = box.querySelectorAll('div[data-i]');
    if (!items.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      idx = (idx + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      [...items].forEach((x, i) => x.classList.toggle('on', i === idx));
    } else if (e.key === 'Enter' && idx >= 0) {
      e.preventDefault(); items[idx].dispatchEvent(new MouseEvent('mousedown'));
    } else if (e.key === 'Escape') close();
  });
  pl.addEventListener('blur', () => setTimeout(close, 180));
  $('run').addEventListener('click', compute);
}

function flash(msg) {
  let e = root.querySelector('.errline');
  if (!e) { e = document.createElement('div'); e.className = 'err errline'; $('run').parentNode.insertBefore(e, $('run')); }
  e.textContent = msg;
}

function compute() {
  const bd = $('bd').value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const unk = $('unk').checked;
  const bt = unk ? ['', '12', '00'] : $('bt').value.match(/^(\d{1,2}):(\d{2})$/);
  if (!bd) return flash(T('errDate'));
  if (!bt) return flash(T('errTime'));
  if (+bt[1] > 23 || +bt[2] > 59) return flash(T('errTimeRange'));
  if (!S.selected) return flash(T('errPlace'));
  const yr = +bd[1];
  if (yr < 1800 || yr > 2200) return flash(T('errYear'));

  const input = {
    name: $('nm').value.trim(), year: yr, month: +bd[2], date: +bd[3],
    hour: +bt[1], minute: +bt[2], lat: S.selected.lat, lon: S.selected.lon,
    placeLabel: S.selected.label, timeUnknown: unk
  };
  $('run').disabled = true;
  $('run').textContent = T('computing');
  setTimeout(() => {
    try {
      S.input = input;
      S.chart = Chart.build(input);
      S.chart.meta.timeUnknown = unk;
      S.timing = Chart.timing(S.chart, new Date());
      const key = chartKey();
      const saved = loadLocal();
      S.sections = (saved && saved.key === key && saved.sections) ? saved.sections : { ko: {}, en: {} };
      if (P.loadCached) {
        ['ko', 'en'].forEach(l => {
          const c = P.loadCached(key, l);
          if (c) S.sections[l] = { ...S.sections[l], ...c };
        });
      }
      saveLocal();
      resultView();
    } catch (e) {
      $('run').disabled = false;
      $('run').textContent = T('compute');
      flash(T('errCompute') + e.message);
    }
  }, 40);
}

/* ── result ──────────────────────────────────────────────────────────── */
function resultView() {
  const ch = S.chart, m = ch.meta;
  const sun = ch.bodies.find(b => b.key === 'sun');
  const moon = ch.bodies.find(b => b.key === 'moon');
  const asc = ch.points.find(p => p.key === 'asc');
  const canRead = !P.entitlement || P.entitlement.canRead !== false;

  root.innerHTML = `
    ${langToggle()}
    <div class="mast" style="padding-top:34px">
      <h1 style="font-size:23px">${m.name ? esc(m.name) + T('chartOf') : T('chartTitle')}</h1>
      <p style="font-size:13px;margin-top:8px">${m.local} · ${esc(m.placeLabel)} · ${m.tz}</p>
      ${wheelSVG(ch)}
    </div>
    ${m.timeUnknown ? `<div class="warn">${T('timeUnknownWarn')}</div>` : ''}
    <div class="ident">
      <div><b>${asc.signGlyph} ${sn(asc.signIndex)}</b><span>${T('ascLabel')} ${asc.deg}°${pad(asc.min)}'</span></div>
      <div><b>${sun.signGlyph} ${sn(sun.signIndex)}</b><span>${T('sunLabel')} · ${sun.wsHouse}${T('houseSuffix')}</span></div>
      <div><b>${moon.signGlyph} ${sn(moon.signIndex)}</b><span>${T('moonLabel')} · ${moon.wsHouse}${T('houseSuffix')}</span></div>
    </div>
    <div class="subline">${m.isDay ? T('dayChart') : T('nightChart')} · ${T('sectLight')} ${bn(m.sectLight)} · ${T('chartRuler')} ${ch.chartRuler ? bn(ch.chartRuler.key) : '—'}</div>
    ${canRead ? `
      <div class="toolbar"><button class="go" id="all" style="margin-top:6px">${T('generateAll')}</button></div>
      <label class="check"><input type="checkbox" id="deep"${S.deep ? ' checked' : ''}> ${T('deepMode')}</label>`
      : `<div class="gate">
          <h3>${T('upgradeTitle')}</h3>
          <p>${T('upgradeBody')}</p>
          <button class="go" id="up">${T('upgradeCta')}</button>
        </div>`}
    <div class="toolbar">
      <button class="ghost" id="reset">${T('newChart')}</button>
      <button class="ghost" id="copy">${T('copyData')}</button>
      ${P.download ? `<button class="ghost" id="dl">${T('saveReading')}</button>` : ''}
    </div>
    <div class="nav" id="nav"></div>
    <div id="secs"></div>
    <div class="foot">${T('disclaimer')}</div>`;

  const wrap = $('secs');
  SECTIONS.forEach(s => {
    const d = document.createElement('section');
    d.className = 'sec';
    d.id = 'sec' + s.n;
    d.innerHTML = `<header><span class="n">${pad(s.n)}</span><h2>${s.title[S.lang]}</h2></header>
      <p class="lead">${s.lead[S.lang]}</p><div class="hold" id="hold${s.n}"></div>`;
    wrap.appendChild(d);
    if (s.code) renderData($('hold' + s.n)); else renderSection(s);
  });
  renderNav();

  wireLang();
  if ($('all')) $('all').addEventListener('click', runAll);
  if ($('deep')) $('deep').addEventListener('change', function () { S.deep = this.checked; saveLocal(); });
  if ($('up')) $('up').addEventListener('click', () => P.entitlement && P.entitlement.onUpgrade && P.entitlement.onUpgrade());
  $('reset').addEventListener('click', () => { S.chart = null; S.selected = null; entryView(); window.scrollTo(0, 0); });
  $('copy').addEventListener('click', () => {
    const t = JSON.stringify(serializeChart(S.chart, S.timing, S.lang, true), null, 2);
    navigator.clipboard.writeText(t).then(() => {
      $('copy').textContent = T('copied');
      setTimeout(() => { $('copy').textContent = T('copyData'); }, 1600);
    });
  });
  if ($('dl')) $('dl').addEventListener('click', saveReading);
  observeNav();
}

function renderNav() {
  const n = $('nav');
  if (!n) return;
  n.innerHTML = SECTIONS.map(s => {
    const done = s.code || S.sections[S.lang][s.n] ? 'done' : '';
    return `<button data-n="${s.n}" class="${done}">${s.n}. ${s.title[S.lang]}</button>`;
  }).join('');
  [...n.children].forEach(b => {
    b.addEventListener('click', () => {
      const el = $('sec' + b.dataset.n);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}
function observeNav() {
  if (!('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver(es => {
    es.forEach(e => {
      if (!e.isIntersecting) return;
      const n = e.target.id.replace('sec', '');
      [...$('nav').children].forEach(b => b.classList.toggle('active', b.dataset.n === n));
      const act = $('nav').querySelector('.active');
      if (act) act.scrollIntoView({ block: 'nearest', inline: 'center' });
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  SECTIONS.forEach(s => { const el = $('sec' + s.n); if (el) io.observe(el); });
}

/* ── section 1: computed tables ──────────────────────────────────────── */
function renderData(host) {
  host.innerHTML = `<div class="tabs" id="tabs">
      <button data-t="planets" class="on">${T('tabPlanets')}</button>
      <button data-t="houses">${T('tabHouses')}</button>
      <button data-t="aspects">${T('tabAspects')}</button>
      <button data-t="balance">${T('tabBalance')}</button>
    </div><div id="plate"></div>`;
  [...$('tabs').children].forEach(b => {
    b.addEventListener('click', () => {
      [...$('tabs').children].forEach(x => x.classList.toggle('on', x === b));
      S.tab = b.dataset.t;
      paintPlate();
    });
  });
  [...$('tabs').children].forEach(b => b.classList.toggle('on', b.dataset.t === S.tab));
  paintPlate();
}

function paintPlate() {
  const ch = S.chart;
  let h = '';
  if (S.tab === 'planets') {
    h = `<div class="plate"><table class="data"><thead><tr>
      <th>${T('thBody')}</th><th>${T('thSign')}</th><th>${T('thDegree')}</th><th>WS</th><th>PL</th>
      <th>${T('thMotion')}</th><th>${T('thDignity')}</th><th>${T('thSolar')}</th></tr></thead><tbody>` +
      ch.points.map(p => {
        const isB = p.kind === 'body';
        const motion = !isB ? '—' : p.motion === 'R' ? T('retrograde') : p.motion === 'S' ? T('stationary') : T('direct');
        const dg = isB
          ? (p.dignity || []).map(k => dignityName(S.lang, k)).join(', ') +
            (p.dignityScore !== null && p.dignityScore !== undefined ? ` (${p.dignityScore > 0 ? '+' : ''}${p.dignityScore})` : '')
          : '—';
        return `<tr><td class="b">${p.glyph} ${bn(p.key)}</td>
          <td class="g">${p.signGlyph} <span style="color:var(--text);font-size:13px">${sn(p.signIndex)}</span></td>
          <td>${p.deg}° ${pad(p.min)}'</td><td>${p.wsHouse || '—'}</td><td>${p.plHouse || '—'}</td>
          <td class="${p.motion === 'R' ? 'r' : ''}">${motion}</td>
          <td class="dim">${dg}</td>
          <td class="dim">${solarPhaseName(S.lang, p.solarPhase) || '—'}</td></tr>`;
      }).join('') + `</tbody></table></div><p class="mini">${T('dignityNote')}</p>`;
  } else if (S.tab === 'houses') {
    h = `<div class="plate"><table class="data"><thead><tr>
      <th>${T('thHouse')}</th><th>${T('thWSSign')}</th><th>${T('thLord')}</th><th>${T('thLordPos')}</th>
      <th>${T('thOccupants')}</th><th>${T('thCusp')}</th></tr></thead><tbody>` +
      ch.wholeHouses.map((w, i) => {
        const p = ch.placidusHouses[i];
        return `<tr><td class="b">${w.house}</td><td>${sn(w.signIndex)}</td>
          <td class="g" style="font-size:13px">${bn(w.lord)}</td>
          <td class="dim">${w.lordSignIndex === null ? '—' : sn(w.lordSignIndex)} · ${w.lordHouseWS || '—'}H</td>
          <td>${w.occupants.length ? w.occupants.map(bn).join(' ') : '<span class="dim">—</span>'}</td>
          <td class="dim">${sn(p.cuspSignIndex)} ${p.cuspDeg}°${pad(p.cuspMin)}' (${p.span}°)</td></tr>`;
      }).join('') + '</tbody></table></div>' +
      (ch.intercepted.length
        ? `<p class="mini">${T('interceptedLabel')}${ch.intercepted.map(sn).join(', ')}</p>`
        : `<p class="mini">${T('noIntercepted')}</p>`) +
      (ch.houseDiffs.length
        ? `<div class="chips">${ch.houseDiffs.map(d => `<span class="chip">${bn(d.body)} <b>WS ${d.whole} → PL ${d.placidus}</b></span>`).join('')}</div>`
        : '');
  } else if (S.tab === 'aspects') {
    h = `<div class="plate"><table class="data"><thead><tr>
      <th>${T('thAspect')}</th><th>${T('thAngle')}</th><th>${T('thOrb')}</th>
      <th>${T('thDirection')}</th><th>${T('thClass')}</th></tr></thead><tbody>` +
      ch.aspects.map(a => `<tr>
        <td class="b">${bn(a.a)} <span class="g">${a.gl}</span> ${bn(a.b)}</td>
        <td class="dim">${a.angle}°</td><td>${a.orb.toFixed(2)}°</td>
        <td class="dim">${a.applying === null ? '—' : a.applying ? T('applying') : T('separating')}</td>
        <td class="dim">${a.level === 'major' ? T('major') : T('minor')}</td></tr>`).join('') +
      '</tbody></table></div>' +
      (ch.patterns.length
        ? `<div class="chips">${ch.patterns.map(p => {
            const note = p.apex ? ` — ${bn(p.apex)}` : p.signIndex !== undefined ? ` — ${sn(p.signIndex)}` : p.element ? ` — ${elementName(S.lang, p.element)}` : '';
            return `<span class="chip"><b>${patternName(S.lang, p.type)}</b> ${p.members.map(bn).join(' · ')}${note}</span>`;
          }).join('')}</div>`
        : `<p class="mini">${T('noPatterns')}</p>`);
  } else {
    const b = ch.balance;
    const bar = v => `<div style="height:4px;background:var(--rule-soft);border-radius:2px;overflow:hidden"><div style="height:100%;width:${v}%;background:var(--brass)"></div></div>`;
    h = '<div class="plate"><table class="data" style="min-width:auto"><tbody>' +
      Object.keys(b.elements).map(k => `<tr><td class="b" style="width:76px">${elementName(S.lang, k)}</td><td style="width:60px">${b.elements[k].pct}%</td><td style="width:100%">${bar(b.elements[k].pct)}</td></tr>`).join('') +
      '<tr><td colspan="3" style="border:0;height:12px"></td></tr>' +
      Object.keys(b.modalities).map(k => `<tr><td class="b">${modalityName(S.lang, k)}</td><td>${b.modalities[k].pct}%</td><td>${bar(b.modalities[k].pct)}</td></tr>`).join('') +
      '<tr><td colspan="3" style="border:0;height:12px"></td></tr>' +
      `<tr><td class="b">${T('yang')}</td><td>${b.polarity.yang.pct}%</td><td>${bar(b.polarity.yang.pct)}</td></tr>` +
      `<tr><td class="b">${T('yin')}</td><td>${b.polarity.yin.pct}%</td><td>${bar(b.polarity.yin.pct)}</td></tr>` +
      '</tbody></table></div>' +
      `<p class="mini" style="margin-top:14px"><b style="color:var(--brass)">${T('dispositorLabel')}</b> — ${T('finalDispositor')}` +
      (ch.dispositors.finals.length ? ch.dispositors.finals.map(bn).join(', ') : T('noFinal')) +
      (ch.dispositors.mutualReception.length
        ? ` · ${T('mutualReception')}` + ch.dispositors.mutualReception.map(m => `${bn(m.a)} ↔ ${bn(m.b)}`).join(', ')
        : '') + '</p>' +
      '<div class="plate"><table class="data" style="min-width:auto"><tbody>' +
      Object.keys(ch.dispositors.chains).map(k => {
        const c = ch.dispositors.chains[k];
        const tail = c.final ? ` (${T('finalPrefix')}${bn(c.final)})` : c.loop ? ` (${bn(c.loop)}${T('loopSuffix')})` : '';
        return `<tr><td class="b" style="width:72px">${bn(k)}</td><td class="dim">${c.path.map(bn).join(' → ')}${tail}</td></tr>`;
      }).join('') + '</tbody></table></div>' +
      `<p class="mini" style="margin-top:14px"><b style="color:var(--brass)">${T('profectionLabel')}</b> — ${S.timing.profection.age}${T('ageUnit')} · ` +
      `${S.timing.profection.house}${T('houseSuffix')}(${sn(S.timing.profection.signIndex)}) · ${T('yearLord')} ${bn(S.timing.profection.yearLord)} · ` +
      `${S.timing.profection.periodFrom} ~ ${S.timing.profection.periodTo}</p>`;
  }
  $('plate').innerHTML = h;
}

/* ── generated sections ──────────────────────────────────────────────── */
function renderSection(s) {
  const host = $('hold' + s.n);
  if (!host) return;
  const canRead = !P.entitlement || P.entitlement.canRead !== false;
  const text = S.sections[S.lang][s.n];

  if (text) {
    host.innerHTML = `<div class="body">${md(text)}</div>` +
      (canRead ? `<div class="toolbar"><button class="ghost regen">${T('regenerate')}</button></div>` : '');
    const b = host.querySelector('.regen');
    if (b) b.addEventListener('click', () => { delete S.sections[S.lang][s.n]; generate(s).catch(() => { }); });
    return;
  }
  if (!canRead) { host.innerHTML = `<p class="mini">${T('upgradeBody')}</p>`; return; }
  host.innerHTML = `<button class="ghost gen-btn">${s.title[S.lang]}${T('generateSection')}</button>`;
  host.querySelector('.gen-btn').addEventListener('click', () => generate(s).catch(() => { }));
}

function generate(s) {
  const host = $('hold' + s.n);
  if (!P.sample) {
    if (host) host.innerHTML = `<p class="err">${T('errNoSample')}</p>`;
    return Promise.reject(new Error('no sample provider'));
  }
  if (P.entitlement && P.entitlement.canRead === false) return Promise.reject(new Error('not entitled'));

  host.innerHTML = `<div class="gen"><span class="tick"></span><span class="lead" style="margin:0">${T('reading')}</span></div><div class="body" id="live${s.n}"></div>`;
  const live = $('live' + s.n);

  return P.sample(buildPrompt(s, S.chart, S.timing, S.lang), {
    modelTier: S.deep ? 'complex' : 'default',
    onText: o => { if (live) live.innerHTML = md(o.text); }
  }).then(r => {
    S.sections[S.lang][s.n] = r.text;
    if (P.saveCached) { try { P.saveCached(chartKey(), S.lang, s.n, r.text); } catch (e) { } }
    renderSection(s); renderNav(); saveLocal();
    return r;
  }).catch(e => {
    if (e && e.text) {
      S.sections[S.lang][s.n] = e.text;
      renderSection(s); renderNav(); saveLocal();
      return;
    }
    const msg = e && e.code === 'rate_limited' ? T('errRateLimit')
      : e && e.code === 'not_granted' ? T('errNotGranted')
      : T('errGenerate') + (e && e.message ? ': ' + e.message : '');
    if (host) {
      host.innerHTML = `<p class="err">${esc(msg)}</p><button class="ghost gen-btn">${T('retry')}</button>`;
      host.querySelector('.gen-btn').addEventListener('click', () => generate(s).catch(() => { }));
    }
    throw e;
  });
}

function runAll() {
  if (S.busy || !P.sample) return;
  S.busy = true;
  const btn = $('all');
  btn.disabled = true;
  const queue = SECTIONS.filter(s => !s.code && !S.sections[S.lang][s.n]);
  let i = 0;
  const next = () => {
    if (i >= queue.length) {
      S.busy = false; btn.disabled = false; btn.textContent = T('generateAll');
      return;
    }
    const s = queue[i++];
    btn.textContent = `${T('generating')}${s.n}. ${s.title[S.lang]} (${i}/${queue.length})`;
    generate(s).then(next, () => {
      S.busy = false; btn.disabled = false; btn.textContent = T('stopped');
    });
  };
  next();
}

function saveReading() {
  const ch = S.chart;
  const lines = [`# ${ch.meta.name || T('chartTitle')}`, '', `- ${ch.meta.local} (${ch.meta.tz})`, `- ${esc(ch.meta.placeLabel)}`, ''];
  SECTIONS.forEach(s => {
    if (s.code) {
      lines.push(`## 1. ${s.title[S.lang]}`, '', '```json', JSON.stringify(serializeChart(ch, S.timing, S.lang, true), null, 2), '```', '');
      return;
    }
    const t = S.sections[S.lang][s.n];
    if (t) lines.push(`## ${s.n}. ${s.title[S.lang]}`, '', t, '');
  });
  P.download((ch.meta.name || 'natal') + `-${S.lang}.md`, lines.join('\n'));
}
