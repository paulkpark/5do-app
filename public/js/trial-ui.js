/* trial-ui.js — 72-hour free-trial banners + expiry prompt.
 *
 * SUB (subscription.js) holds the state: SUB.isInTrial(), SUB.trialExpired(),
 * SUB.trialMsLeft(). This file just renders the user-facing bits:
 *   • last 12h of the trial  → a dismissible top banner + bell badge
 *   • trial just expired      → the upgrade modal (once), then re-gate the UI
 * window.onTrialResolved() (called from auth.js after the trial is stamped)
 * triggers a re-check. A light timer also re-checks while the app stays open.
 */
(function () {
  const WARN_MS = 12 * 3600 * 1000;
  let _lastState = null;   // 'active' | 'warn' | 'expired' | null
  let _timer = null;

  function L() { return (typeof LANG !== 'undefined' && LANG === 'en') ? 'en' : 'ko'; }

  function removeBanner() {
    const b = document.getElementById('trialBanner');
    if (b) b.remove();
  }

  function showBanner(kind) {
    removeBanner();
    const en = L() === 'en';
    const hrs = (typeof SUB !== 'undefined' && SUB.trialHoursLeft) ? SUB.trialHoursLeft() : 0;
    const msg = kind === 'warn'
      ? (en ? `Your free trial ends in about ${hrs}h — upgrade to keep every feature.`
            : `무료 체험이 약 ${hrs}시간 뒤 종료돼요 — 지금 업그레이드하면 끊김 없이 이용할 수 있어요.`)
      : (en ? 'Your 72-hour free trial has ended. Upgrade to unlock Pro features again.'
            : '72시간 무료 체험이 끝났어요. 업그레이드하면 Pro 기능을 다시 이용할 수 있어요.');
    const cta = en ? 'Upgrade' : '업그레이드';
    const bar = document.createElement('div');
    bar.id = 'trialBanner';
    const bg = kind === 'warn'
      ? 'linear-gradient(90deg,rgba(255,180,60,.16),rgba(124,92,252,.16))'
      : 'linear-gradient(90deg,rgba(248,113,113,.18),rgba(124,92,252,.18))';
    bar.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:9998;display:flex;gap:10px;align-items:center;justify-content:center;flex-wrap:wrap;padding:9px 44px 9px 14px;font-size:12.5px;color:#f0f0ff;background:' + bg + ';backdrop-filter:blur(8px);border-bottom:1px solid rgba(255,255,255,.12)';
    bar.innerHTML =
      '<span style="opacity:.95">' + msg + '</span>' +
      '<button id="trialBannerCta" style="padding:5px 14px;border-radius:14px;border:none;background:linear-gradient(135deg,#7C5CFC,#5A3AD9);color:#fff;font-size:12px;font-weight:600;cursor:pointer">' + cta + '</button>' +
      '<button id="trialBannerX" aria-label="close" style="position:absolute;right:12px;top:50%;transform:translateY(-50%);background:none;border:none;color:rgba(255,255,255,.55);font-size:16px;cursor:pointer">✕</button>';
    document.body.appendChild(bar);
    document.getElementById('trialBannerCta').addEventListener('click', () => {
      if (typeof showUpgradeModal === 'function') showUpgradeModal('category');
    });
    document.getElementById('trialBannerX').addEventListener('click', () => {
      removeBanner();
      // Don't nag again this session for the same state.
      try { sessionStorage.setItem('5do_trial_banner_dismissed_' + kind, '1'); } catch (_) {}
    });
    // Bell badge (visible even after dismissing the banner)
    const badge = document.getElementById('notiBadge');
    if (badge) badge.style.display = '';
  }

  function dismissed(kind) {
    try { return sessionStorage.getItem('5do_trial_banner_dismissed_' + kind) === '1'; } catch (_) { return false; }
  }

  function check() {
    if (typeof SUB === 'undefined') return;
    // Pro / non-logged-in / no trial → nothing to show.
    if (!SUB.isLoggedIn() || (SUB.isPro && SUB.isPro())) { removeBanner(); _lastState = null; return; }

    if (SUB.trialExpired && SUB.trialExpired()) {
      if (_lastState !== 'expired') {
        _lastState = 'expired';
        // Re-apply the gate everywhere (library strip, etc.).
        if (typeof renderStrip === 'function') { try { renderStrip(); } catch (_) {} }
        // Prompt to upgrade — once per app session.
        let shown = false;
        try { shown = sessionStorage.getItem('5do_trial_expired_prompted') === '1'; } catch (_) {}
        if (!shown && typeof showUpgradeModal === 'function') {
          showUpgradeModal('category');
          try { sessionStorage.setItem('5do_trial_expired_prompted', '1'); } catch (_) {}
        }
      }
      if (!dismissed('expired')) showBanner('expired'); else removeBanner();
      return;
    }

    if (SUB.isInTrial && SUB.isInTrial()) {
      const left = SUB.trialMsLeft ? SUB.trialMsLeft() : Infinity;
      if (left <= WARN_MS) {
        if (_lastState !== 'warn') _lastState = 'warn';
        if (!dismissed('warn')) showBanner('warn'); else removeBanner();
      } else {
        _lastState = 'active';
        removeBanner();
      }
      return;
    }
    // Logged-in free user, no trial stamp yet — nothing to show.
    removeBanner();
  }

  // Called by auth.js once the trial is loaded/stamped.
  window.onTrialResolved = function () {
    check();
    if (!_timer) {
      // Re-check every 5 min so the banner/expiry appear without a reload.
      _timer = setInterval(check, 5 * 60 * 1000);
    }
  };

  // Also re-check on language change so the banner text follows the toggle.
  window.refreshTrialUI = check;
})();
