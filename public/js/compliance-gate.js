/* compliance-gate.js — one-time first-run gate for North American launch.
 *
 * Covers two P0 legal items in a single dismissible modal:
 *   1. Wellness/entertainment + non-medical disclaimer shown at point of use
 *      (not buried in Terms) — FTC/FDA health-claim exposure.
 *   2. Lightweight age affirmation (13+) — COPPA minimum.
 *
 * Colours are TOKENS (base.css). This modal shipped with the abandoned purple
 * theme — a #7C5CFC→#5A3AD9 gradient button — so the first screen anyone ever
 * saw of 5DO was in a palette the rest of the app had stopped using.
 *
 * Shown once; acknowledgement is stored in localStorage so it never nags a
 * returning user. Pure vanilla, no dependencies, safe to load last.
 *
 * Language: this paints immediately in whatever LANG the page knows
 * synchronously (saved choice, else navigator.language) — a legal notice must
 * not wait on a network round trip. boot's IP detect lands a moment later and
 * may flip LANG; the modal is usually still open at that point, so it exposes
 * window.refreshComplianceGateLang() for boot to call. Without that repaint the
 * copy froze at the first guess: a first-time visitor abroad on a Korean-set
 * phone got an English app under a Korean consent dialog, and vice versa in
 * Korea on an English-set phone.
 */
(function () {
  var KEY = '5do_compliance_ack_v1';
  try { if (localStorage.getItem(KEY) === '1') return; } catch (_) {}

  function lang() {
    // LANG is a script-scoped `let` in i18n.js — reachable as a bare identifier,
    // never as window.LANG. It already carries the IP refinement and an explicit
    // user choice, so it wins. APP_REGION is only a fallback for a page that
    // loads this gate without i18n.js.
    try { if (typeof LANG !== 'undefined' && LANG) return LANG === 'en' ? 'en' : 'ko'; } catch (_) {}
    if (window.APP_REGION === 'INTL') return 'en';
    var n = (navigator.language || '').toLowerCase();
    return n.indexOf('ko') === 0 ? 'ko' : 'en';
  }

  var COPY = {
    ko: {
      title: '시작하기 전에',
      lines: [
        '<strong>5DO는 웰니스·엔터테인먼트 목적의 서비스이며, 의료기기가 아닙니다.</strong> 어떤 질병도 진단·치료·완화·예방하지 않습니다.',
        '주파수·명상 콘텐츠와 Soul Code 분석은 참고·성찰을 위한 것입니다. 건강 문제는 의료 전문가와 상담하세요.',
        '본 서비스는 <strong>만 13세 이상</strong>만 이용할 수 있습니다.',
      ],
      btn: '만 13세 이상이며 동의합니다',
      legal: '약관 및 개인정보 처리방침',
      legalHref: '/landing/terms.html',
    },
    en: {
      title: 'Before you begin',
      lines: [
        '<strong>5DO is a wellness &amp; entertainment service, not a medical device.</strong> It does not diagnose, treat, cure, or prevent any disease.',
        'Frequency &amp; meditation content and Soul Code readings are for reflection only. Consult a professional for any health concern.',
        'You must be <strong>13 or older</strong> to use this service.',
      ],
      btn: "I'm 13+ and I agree",
      legal: 'Terms &amp; Privacy Policy',
      legalHref: '/landing/en/terms.html',
    },
  };

  var painted = null;   // the language currently on screen
  var closed = false;

  // Writes the copy into the already-built shell. Safe to call repeatedly; a
  // no-op once the user has acknowledged, so a late IP result cannot resurrect
  // a dismissed dialog.
  function paint() {
    if (closed) return;
    var L = lang();
    if (L === painted) return;
    var t = COPY[L] || COPY.en;
    var title = document.getElementById('_cgTitle');
    var body = document.getElementById('_cgBody');
    var btn = document.getElementById('_cgAck');
    var legal = document.getElementById('_cgLegal');
    if (!title || !body || !btn || !legal) return;
    title.innerHTML = t.title;
    body.innerHTML = t.lines.map(function (l) {
      return '<p style="margin:0 0 12px">' + l + '</p>';
    }).join('');
    btn.innerHTML = t.btn;
    legal.innerHTML = t.legal;
    legal.setAttribute('href', t.legalHref);
    document.documentElement.setAttribute('data-cg-lang', L);
    painted = L;
  }

  function render() {
    var wrap = document.createElement('div');
    wrap.id = 'complianceGate';
    wrap.style.cssText = 'position:fixed;inset:0;z-index:100000;background:var(--scrim-deep);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:20px';
    wrap.innerHTML =
      '<div role="dialog" aria-modal="true" style="background:linear-gradient(170deg,var(--bg-card),var(--bg-elevated));border:1px solid var(--tint-strong);border-radius:22px;padding:30px 26px;width:min(400px,92vw);box-shadow:0 16px 48px var(--scrim)">' +
        '<div style="font-size:28px;text-align:center;margin-bottom:10px">✦</div>' +
        '<div id="_cgTitle" style="font-size:19px;font-weight:700;color:var(--text-primary);text-align:center;margin-bottom:16px"></div>' +
        '<div id="_cgBody" style="font-size:13px;color:var(--text-secondary);line-height:1.65;text-align:left"></div>' +
        '<button id="_cgAck" style="width:100%;margin-top:8px;padding:14px 0;border:none;border-radius:14px;background:linear-gradient(135deg,var(--primary),var(--primary-dark));color:var(--text-primary);font-size:14px;font-weight:600;cursor:pointer"></button>' +
        '<div style="text-align:center;margin-top:12px"><a id="_cgLegal" href="#" target="_blank" rel="noopener" style="font-size:11px;color:var(--text-tertiary)"></a></div>' +
      '</div>';
    document.body.appendChild(wrap);
    paint();
    document.getElementById('_cgAck').addEventListener('click', function () {
      closed = true;
      try { localStorage.setItem(KEY, '1'); } catch (_) {}
      wrap.remove();
    });
  }

  // boot calls this when the IP detect resolves to a different language.
  window.refreshComplianceGateLang = paint;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render);
  } else {
    render();
  }
})();
