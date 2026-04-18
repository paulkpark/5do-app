/* ===== theme.js: Backdrop/Theme panel — library, opacity, persistence ===== */
/* Depends on: LANG (i18n), MEDIA_BASE (config), window.applyLang (for re-render on lang toggle) */

(function(){
  const BD_ID_KEY  = 'fiveDO_backdrop_id';
  const BD_OP_KEY  = 'fiveDO_backdrop_opacity';
  const UI_OP_KEY  = 'fiveDO_ui_opacity';

  function init() {
    const backdropLayer = document.getElementById('backdropLayer');
    const backdropDim   = document.getElementById('backdropDim');
    const panel         = document.getElementById('backdropPanel');
    const grid          = document.getElementById('bdGrid');
    const btnOpen       = document.getElementById('menuBackdrop');
    const btnClose      = document.getElementById('bdCloseBtn');
    const bdOpacityEl   = document.getElementById('bdOpacity');
    const bdOpacityVal  = document.getElementById('bdOpacityVal');
    const uiOpacityEl   = document.getElementById('uiOpacity');
    const uiOpacityVal  = document.getElementById('uiOpacityVal');

    if (!backdropLayer || !panel || !grid) {
      console.warn('[theme] required elements missing');
      return;
    }

    // ═══ Theme Library — CSS variable sets ═══
    const BACKDROP_LIBRARY = [
      { id:'deep_ocean', name:{ko:'딥 오션',      en:'Deep Ocean'},      kind:'theme',
        preview:'linear-gradient(135deg, #0C1828 0%, #39E3FF 50%, #7FFFD4 100%)',
        vars:{ '--bg':'#060A12','--bg-elevated':'#0C1220','--bg-card':'#111828','--surface':'#1A2438',
          '--border':'#1E2D45','--primary':'#39E3FF','--primary-light':'#7EECFF','--primary-dark':'#1AB8D9',
          '--secondary':'#7FFFD4','--text-primary':'#E8F2FF','--text-secondary':'#8AAAC8','--text-tertiary':'#4A6580',
          '--glass':'rgba(12,18,32,.75)','--glass-border':'rgba(57,227,255,.06)',
          '--title-glow':'0 0 6px rgba(57,227,255,.7), 0 0 16px rgba(57,227,255,.4), 0 0 32px rgba(57,227,255,.2)' }},

      { id:'cosmic_purple', name:{ko:'코스믹 퍼플', en:'Cosmic Purple'},  kind:'theme',
        preview:'linear-gradient(135deg, #1A1030 0%, #B490FF 50%, #FF90D0 100%)',
        vars:{ '--bg':'#0A0614','--bg-elevated':'#12081E','--bg-card':'#1A1030','--surface':'#28204A',
          '--border':'#32285A','--primary':'#B490FF','--primary-light':'#D0B8FF','--primary-dark':'#8A60E6',
          '--secondary':'#FF90D0','--text-primary':'#F0EAFF','--text-secondary':'#A090C8','--text-tertiary':'#6A5890',
          '--glass':'rgba(20,12,38,.75)','--glass-border':'rgba(180,144,255,.06)',
          '--title-glow':'0 0 6px rgba(180,144,255,.7), 0 0 16px rgba(180,144,255,.4), 0 0 32px rgba(180,144,255,.2)' }},

      { id:'forest_night', name:{ko:'포레스트 나이트', en:'Forest Night'}, kind:'theme',
        preview:'linear-gradient(135deg, #0E2014 0%, #4ADE80 50%, #80DEEA 100%)',
        vars:{ '--bg':'#060E08','--bg-elevated':'#0C1A10','--bg-card':'#12241A','--surface':'#1E3828',
          '--border':'#284A34','--primary':'#4ADE80','--primary-light':'#7AEEA0','--primary-dark':'#2AB860',
          '--secondary':'#80DEEA','--text-primary':'#E8FFE8','--text-secondary':'#8AC8A0','--text-tertiary':'#4A8060',
          '--glass':'rgba(10,20,14,.75)','--glass-border':'rgba(74,222,128,.06)',
          '--title-glow':'0 0 6px rgba(74,222,128,.7), 0 0 16px rgba(74,222,128,.4), 0 0 32px rgba(74,222,128,.2)' }},

      { id:'ember_glow', name:{ko:'엠버 글로우',   en:'Ember Glow'},      kind:'theme',
        preview:'linear-gradient(135deg, #201410 0%, #FFB86C 50%, #FF8A65 100%)',
        vars:{ '--bg':'#100806','--bg-elevated':'#1A100C','--bg-card':'#241A14','--surface':'#382820',
          '--border':'#4A3828','--primary':'#FFB86C','--primary-light':'#FFD4A0','--primary-dark':'#E09040',
          '--secondary':'#FF8A65','--text-primary':'#FFF0E0','--text-secondary':'#C8A888','--text-tertiary':'#806848',
          '--glass':'rgba(24,16,10,.75)','--glass-border':'rgba(255,184,108,.06)',
          '--title-glow':'0 0 6px rgba(255,184,108,.7), 0 0 16px rgba(255,184,108,.4), 0 0 32px rgba(255,184,108,.2)' }},

      { id:'midnight_rose', name:{ko:'미드나잇 로즈', en:'Midnight Rose'}, kind:'theme',
        preview:'linear-gradient(135deg, #20101A 0%, #FF6B9D 50%, #FFB0C8 100%)',
        vars:{ '--bg':'#0E060A','--bg-elevated':'#160C12','--bg-card':'#20141C','--surface':'#382030',
          '--border':'#4A2840','--primary':'#FF6B9D','--primary-light':'#FF90B8','--primary-dark':'#D94878',
          '--secondary':'#FFB0C8','--text-primary':'#FFE8F0','--text-secondary':'#C890A8','--text-tertiary':'#805870',
          '--glass':'rgba(22,12,18,.75)','--glass-border':'rgba(255,107,157,.06)',
          '--title-glow':'0 0 6px rgba(255,107,157,.7), 0 0 16px rgba(255,107,157,.4), 0 0 32px rgba(255,107,157,.2)' }},

      { id:'pure_dark', name:{ko:'퓨어 다크',      en:'Pure Dark'},       kind:'theme',
        preview:'linear-gradient(135deg, #1A1A1A 0%, #888888 50%, #FFFFFF 100%)',
        vars:{ '--bg':'#080808','--bg-elevated':'#121212','--bg-card':'#1A1A1A','--surface':'#252525',
          '--border':'#303030','--primary':'#FFFFFF','--primary-light':'#FFFFFF','--primary-dark':'#CCCCCC',
          '--secondary':'#888888','--text-primary':'#F0F0F0','--text-secondary':'#999999','--text-tertiary':'#555555',
          '--glass':'rgba(18,18,18,.75)','--glass-border':'rgba(255,255,255,.06)',
          '--title-glow':'0 0 4px rgba(255,255,255,.5), 0 0 12px rgba(255,255,255,.2)' }},
    ];

    function bdLabel(item) {
      const LANG_ = (typeof LANG !== 'undefined') ? LANG : 'ko';
      return (LANG_ === 'ko') ? (item.name?.ko || item.id) : (item.name?.en || item.id);
    }

    function setBackdropCss(item) {
      if (!item) return;
      const MEDIA_BASE_ = (typeof MEDIA_BASE !== 'undefined') ? MEDIA_BASE : '';
      if (item.kind === 'theme' && item.vars) {
        const root = document.documentElement;
        Object.entries(item.vars).forEach(([k, v]) => root.style.setProperty(k, v));
        root.style.setProperty('--blue',  item.vars['--primary'] || '');
        root.style.setProperty('--blue2', item.vars['--primary-dark'] || '');
        root.style.setProperty('--teal',  item.vars['--secondary'] || '');
        root.style.setProperty('--txt',   item.vars['--text-primary'] || '');
        root.style.setProperty('--muted', item.vars['--text-secondary'] || '');
        root.style.setProperty('--card',  item.vars['--bg-card'] || '');
        root.style.setProperty('--panel', item.vars['--bg-elevated'] || '');
        backdropLayer.style.backgroundImage = item.preview || 'none';
        backdropLayer.style.opacity = '0';
      } else if (item.kind === 'gradient') {
        backdropLayer.style.backgroundImage = item.value;
        backdropLayer.style.opacity = '';
      } else {
        const base = MEDIA_BASE_ + '/_system/backdrops/';
        backdropLayer.style.backgroundImage = 'url("' + (base + item.file) + '")';
        backdropLayer.style.opacity = '';
      }
    }

    function renderBackdropGrid(selectedId) {
      const MEDIA_BASE_ = (typeof MEDIA_BASE !== 'undefined') ? MEDIA_BASE : '';
      grid.innerHTML = '';
      BACKDROP_LIBRARY.forEach(item => {
        const tile = document.createElement('button');
        tile.type = 'button';
        tile.className = 'bd-tile' + (item.id === selectedId ? ' bd-selected' : '');
        tile.title = bdLabel(item);

        const thumb = document.createElement('div');
        thumb.className = 'bd-thumb';
        if (item.kind === 'theme') {
          thumb.style.backgroundImage = item.preview || 'linear-gradient(135deg,#111,#222)';
        } else if (item.kind === 'gradient') {
          thumb.style.backgroundImage = item.value;
        } else {
          const base = MEDIA_BASE_ + '/_system/backdrops/';
          thumb.style.backgroundImage = 'url("' + (base + item.file) + '")';
        }

        const cap = document.createElement('div');
        cap.className = 'bd-caption';
        cap.textContent = bdLabel(item);

        tile.append(thumb, cap);
        tile.addEventListener('click', () => {
          applyBackdrop(item.id);
          closeBackdropPanel();
        });
        grid.appendChild(tile);
      });
    }

    function applyBackdrop(id) {
      const item = BACKDROP_LIBRARY.find(x => x.id === id) || BACKDROP_LIBRARY[0];
      if (!item) return;
      setBackdropCss(item);
      localStorage.setItem(BD_ID_KEY, item.id);
      renderBackdropGrid(item.id);
    }

    function setBackdropOpacity(v) {
      const x = Math.max(0.15, Math.min(1.0, Number(v) || 1));
      backdropLayer.style.opacity = String(x);
      if (bdOpacityVal) bdOpacityVal.textContent = x.toFixed(2);
      localStorage.setItem(BD_OP_KEY, String(x));
    }

    function setUiOpacity(v) {
      const x = Math.max(0.35, Math.min(1.0, Number(v) || 0.92));
      document.documentElement.style.setProperty('--uiOpacity', String(x));
      if (uiOpacityVal) uiOpacityVal.textContent = x.toFixed(2);
      localStorage.setItem(UI_OP_KEY, String(x));
    }

    function openBackdropPanel() {
      panel.style.display = 'flex';
      renderBackdropGrid(localStorage.getItem(BD_ID_KEY) || BACKDROP_LIBRARY[0].id);
    }
    function closeBackdropPanel() {
      panel.style.display = 'none';
    }

    // Expose open function for menu.js
    window.openBackdropPanel = openBackdropPanel;

    // Bindings
    if (btnOpen)  btnOpen.addEventListener('click', openBackdropPanel);
    if (btnClose) btnClose.addEventListener('click', closeBackdropPanel);
    panel.addEventListener('click', (e) => { if (e.target === panel) closeBackdropPanel(); });
    window.addEventListener('keydown', (e) => {
      if (panel.style.display !== 'none' && e.key === 'Escape') closeBackdropPanel();
    });

    // Init sliders
    const initBdOp = parseFloat(localStorage.getItem(BD_OP_KEY) || '1');
    const initUiOp = parseFloat(localStorage.getItem(UI_OP_KEY) || '0.92');
    if (bdOpacityEl) {
      bdOpacityEl.value = String(isFinite(initBdOp) ? initBdOp : 1);
      bdOpacityEl.addEventListener('input', () => setBackdropOpacity(bdOpacityEl.value));
    }
    if (uiOpacityEl) {
      uiOpacityEl.value = String(isFinite(initUiOp) ? initUiOp : 0.92);
      uiOpacityEl.addEventListener('input', () => setUiOpacity(uiOpacityEl.value));
    }
    setBackdropOpacity(isFinite(initBdOp) ? initBdOp : 1);
    setUiOpacity(isFinite(initUiOp) ? initUiOp : 0.92);
    if (backdropDim) backdropDim.style.opacity = '1';

    const initId = localStorage.getItem(BD_ID_KEY) || BACKDROP_LIBRARY[0].id;
    applyBackdrop(initId);

    // Re-render backdrop grid when language toggles
    const _applyLang = window.applyLang;
    window.applyLang = function() {
      try { _applyLang && _applyLang(); } catch (_) {}
      try {
        const LANG_ = (typeof LANG !== 'undefined') ? LANG : 'ko';
        if (btnOpen) btnOpen.title = (LANG_ === 'en' ? 'Backdrop' : '백드롭');
        renderBackdropGrid(localStorage.getItem(BD_ID_KEY) || BACKDROP_LIBRARY[0].id);
      } catch (_) {}
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
