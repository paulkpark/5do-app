// public/natal/index.js — the one entry the Soul Code host calls.
//
// Everything the natal tab needs is loaded here, on demand, and mounted inside a
// shadow root:
//
//   - vendor/cnh.js   the ephemeris. 850KB, CommonJS-only upstream, built once
//                     into an IIFE (see scripts/cnh-entry.js). Loaded by <script>
//                     tag exactly once and never before the tab is opened, so the
//                     PWA's first paint does not pay for it.
//   - engine/, ui/    plain ES modules, dynamically imported so they too stay out
//                     of the initial bundle.
//
// Shadow DOM is what keeps the two UIs apart. The reference stylesheet was
// written for a standalone page (:root, body, *, h1 rules); in a shadow tree
// those are contained, and ui/app.js only ever queries its own root, so nothing
// had to change in the UI code. The stylesheet itself was rewritten to :host /
// .natal-root — see the header in ui/styles.css.
//
// Usage (from the host):
//   const natal = await mountNatal(hostEl, { lang, sample, entitlement, ... });
//   natal.setLang('en'); natal.destroy();
//
// `provider` is passed straight through to ui/app.js mount() — see its header
// for the full contract (sample, entitlement, loadCached, saveCached, geocode).

const VENDOR_URL = new URL('../vendor/cnh.js', import.meta.url).href;
const STYLE_URL  = new URL('./ui/styles.css', import.meta.url).href;

let cnhPromise = null;
function loadCNH() {
  if (window.CNH && window.CNH.Origin && window.CNH.Horoscope) return Promise.resolve(window.CNH);
  if (cnhPromise) return cnhPromise;
  cnhPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = VENDOR_URL;
    s.async = true;
    s.onload = () => (window.CNH && window.CNH.Origin)
      ? resolve(window.CNH)
      : reject(new Error('natal: vendor loaded but CNH global missing'));
    s.onerror = () => { cnhPromise = null; reject(new Error('natal: failed to load ephemeris')); };
    document.head.appendChild(s);
  });
  return cnhPromise;
}

let stylePromise = null;
function loadStyle() {
  if (!stylePromise) {
    stylePromise = fetch(STYLE_URL).then(r => {
      if (!r.ok) throw new Error('natal: stylesheet ' + r.status);
      return r.text();
    }).catch(e => { stylePromise = null; throw e; });
  }
  return stylePromise;
}

/**
 * Mount the natal reading UI into `hostEl`. Resolves once everything is loaded
 * and drawn; rejects if the ephemeris or modules cannot be fetched, so the host
 * can show its own fallback instead of a blank panel.
 *
 * Extra options beyond the ui/app.js contract:
 *   hideLangToggle  true when the host owns language (5DO does) — the UI's own
 *                   ko/en switch is hidden and setLang() is the only way in.
 */
export async function mountNatal(hostEl, provider = {}) {
  const { hideLangToggle = true, ...uiProvider } = provider;

  const [cnh, css, chart, ui] = await Promise.all([
    loadCNH(),
    loadStyle(),
    import('./engine/chart.js'),
    import('./ui/app.js'),
  ]);
  chart.setEphemeris(cnh);

  const shadow = hostEl.shadowRoot || hostEl.attachShadow({ mode: 'open' });
  shadow.innerHTML = '';

  const style = document.createElement('style');
  style.textContent = css + (hideLangToggle ? '\n.langs{display:none!important}' : '');
  shadow.appendChild(style);

  // The UI replaces its root's innerHTML wholesale on every view change, so it
  // gets an inner element of its own and the <style> lives beside it, untouched.
  const inner = document.createElement('div');
  inner.className = 'natal-root';
  shadow.appendChild(inner);

  // The stylesheet keys English body metrics off :host([lang="en"]); the UI never
  // sets that attribute itself (the demo page's <html lang> did), so keep it here.
  const syncLang = (lang) => hostEl.setAttribute('lang', lang);
  syncLang(uiProvider.lang || 'ko');

  const handle = ui.mount(inner, {
    ...uiProvider,
    onLangChange: (lang) => {
      syncLang(lang);
      if (uiProvider.onLangChange) uiProvider.onLangChange(lang);
    },
  });

  return {
    setLang(lang) { ui.setLang(lang); },
    refresh() { handle.refresh(); },
    getChart: handle.getChart,
    destroy() { handle.destroy(); shadow.innerHTML = ''; },
  };
}
