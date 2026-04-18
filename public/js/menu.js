/* ===== menu.js: Hamburger menu + text modal (FAQ / Manual / Contact / About / Revision) ===== */

(function(){
  const $ = (s, r = document) => r.querySelector(s);

  function init() {
    const menuBtn   = $('#menuBtn');
    const menuDrop  = $('#menuDrop');
    const backdrop  = $('#backdrop');
    const modal     = $('#modal');
    const modalTitle = $('#modalTitle');
    const modalBody  = $('#modalBody');
    const modalClose = $('#modalClose');
    if (!menuBtn || !menuDrop) return;

    // ── Hamburger open/close ──
    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const v = menuDrop.style.display === 'block' ? 'none' : 'block';
      menuDrop.style.display = v;
    });
    menuDrop.addEventListener('click', (e) => e.stopPropagation());
    document.addEventListener('click', () => { menuDrop.style.display = 'none'; });

    // ── Text modal close ──
    if (backdrop && modal) {
      backdrop.addEventListener('click', () => {
        backdrop.style.display = 'none';
        modal.style.display = 'none';
      });
    }
    if (modalClose && backdrop && modal) {
      modalClose.addEventListener('click', () => {
        backdrop.style.display = 'none';
        modal.style.display = 'none';
      });
    }

    // ── Fetch menu text (FAQ / Manual / etc.) ──
    async function fetchMenuText(key) {
      const cleanKey = String(key || '').trim().replace(/[^a-z0-9_\-]/gi, '');
      if (!cleanKey) throw new Error('invalid key');
      const langSuffix = `_${(typeof LANG !== 'undefined' && LANG === 'en') ? 'en' : 'ko'}`;
      const urlObj = new URL(`texts/${encodeURIComponent(cleanKey)}${langSuffix}.txt`, location.href);
      urlObj.searchParams.set('v', Date.now());
      const res = await fetch(urlObj.toString(), { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.text();
    }

    if (!window.__MENU_TEXT_DELEGATED__) {
      window.__MENU_TEXT_DELEGATED__ = true;

      // Theme/backdrop item -> open backdrop panel
      const menuBackdropEl = $('#menuBackdrop');
      if (menuBackdropEl) {
        menuBackdropEl.addEventListener('click', (e) => {
          e.preventDefault();
          try { menuDrop.style.display = 'none'; } catch (_) {}
          if (typeof window.openBackdropPanel === 'function') window.openBackdropPanel();
        });
      }

      // Text modals (FAQ / Manual / Contact / About / Revision)
      menuDrop.addEventListener('click', async (e) => {
        const a = e.target.closest('a.menu-text');
        if (!a) return;
        e.preventDefault();
        e.stopPropagation();

        try { menuDrop.style.display = 'none'; } catch (_) {}

        const key = a.dataset.txt;
        const label = (a.textContent || 'Info').trim();
        const LANG_ = (typeof LANG !== 'undefined') ? LANG : 'ko';

        try {
          const txt = await fetchMenuText(key);
          if (modalTitle) modalTitle.textContent = label;
          if (modalBody)  modalBody.textContent  = txt;
          if (backdrop) backdrop.style.display = 'block';
          if (modal)    modal.style.display = 'block';
        } catch (err) {
          console.warn('[menu modal] load failed', err);
          const hint = (location.protocol === 'file:')
            ? (LANG_ === 'en'
                ? 'Failed to load because this page is opened via file://.\n\nRun via a web server.'
                : 'file:// 로 열려서 불러오기가 차단되었습니다.\n\n로컬 웹서버로 실행하세요.')
            : (LANG_ === 'en' ? 'Failed to load.' : '불러오기에 실패했습니다.');
          if (modalTitle) modalTitle.textContent = (LANG_ === 'en' ? 'Error' : '오류');
          if (modalBody)  modalBody.textContent  = hint + (err?.message ? `\n\n(${err.message})` : '');
          if (backdrop) backdrop.style.display = 'block';
          if (modal)    modal.style.display = 'block';
        }
      }, true); // capture to avoid click-swallowing by other handlers
    }
  }

  // Ensure DOM is ready before wiring
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
