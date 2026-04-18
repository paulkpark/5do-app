/* landing-geo.js — auto-select landing language by IP country on first visit.
   Rule: Korean IP (country code KR) → /landing/ (KO). Everywhere else → /landing/en/.
   Saves the user's explicit choice (if they click a lang switch link) so the
   auto-detect defers to it on future visits. */

(function langRoute() {
  const path = location.pathname;
  const onEnLanding = path.indexOf('/landing/en') === 0;
  const KEY = 'landingLang';

  // Capture explicit language switches via nav links (delegated — runs on every page).
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a');
    if (!a) return;
    const href = a.getAttribute('href') || '';
    if (/^\/landing\/en(\/|$)/.test(href)) {
      try { localStorage.setItem(KEY, 'en'); } catch (_) {}
    } else if (href === '/landing/' || href === '/landing' || href === '/landing/index.html' || href === '/') {
      try { localStorage.setItem(KEY, 'ko'); } catch (_) {}
    }
  }, true);

  // Respect saved user choice.
  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch (_) {}
  if (saved === 'ko' && onEnLanding)  { location.replace('/landing/'); return; }
  if (saved === 'en' && !onEnLanding) { location.replace('/landing/en/'); return; }
  if (saved) return; // saved matches current page — nothing to do

  // First visit — detect IP country via Cloudflare trace.
  function applyDetection(isEn) {
    try { localStorage.setItem(KEY, isEn ? 'en' : 'ko'); } catch (_) {}
    if (isEn && !onEnLanding)  { location.replace('/landing/en/'); }
    else if (!isEn && onEnLanding) { location.replace('/landing/'); }
  }

  fetch('https://www.cloudflare.com/cdn-cgi/trace', { cache: 'no-store' })
    .then(function (r) { return r.text(); })
    .then(function (txt) {
      const m = txt.match(/^loc=([A-Z]{2})/m);
      const country = m ? m[1] : '';
      applyDetection(country && country !== 'KR');
    })
    .catch(function () {
      // Fallback: browser language.
      const nav = (navigator.language || navigator.userLanguage || '').toLowerCase();
      applyDetection(!nav.startsWith('ko'));
    });
})();
