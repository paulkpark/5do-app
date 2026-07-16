/* compliance-gate.js — one-time first-run gate for North American launch.
 *
 * Covers two P0 legal items in a single dismissible modal:
 *   1. Wellness/entertainment + non-medical disclaimer shown at point of use
 *      (not buried in Terms) — FTC/FDA health-claim exposure.
 *   2. Lightweight age affirmation (13+) — COPPA minimum.
 *
 * Shown once; acknowledgement is stored in localStorage so it never nags a
 * returning user. Pure vanilla, no dependencies, safe to load last.
 */
(function () {
  var KEY = '5do_compliance_ack_v1';
  try { if (localStorage.getItem(KEY) === '1') return; } catch (_) {}

  function lang() {
    try { if (typeof LANG !== 'undefined' && LANG) return LANG === 'en' ? 'en' : 'ko'; } catch (_) {}
    if (window.APP_REGION === 'INTL') return 'en';
    var n = (navigator.language || '').toLowerCase();
    return n.indexOf('ko') === 0 ? 'ko' : 'en';
  }

  function render() {
    var L = lang();
    var t = L === 'ko' ? {
      title: '시작하기 전에',
      lines: [
        '<strong>5DO는 웰니스·엔터테인먼트 목적의 서비스이며, 의료기기가 아닙니다.</strong> 어떤 질병도 진단·치료·완화·예방하지 않습니다.',
        '주파수·명상 콘텐츠와 Soul Code 분석은 참고·성찰을 위한 것입니다. 건강 문제는 의료 전문가와 상담하세요.',
        '본 서비스는 <strong>만 13세 이상</strong>만 이용할 수 있습니다.',
      ],
      btn: '만 13세 이상이며 동의합니다',
      legal: '약관 및 개인정보 처리방침',
    } : {
      title: 'Before you begin',
      lines: [
        '<strong>5DO is a wellness &amp; entertainment service, not a medical device.</strong> It does not diagnose, treat, cure, or prevent any disease.',
        'Frequency &amp; meditation content and Soul Code readings are for reflection only. Consult a professional for any health concern.',
        'You must be <strong>13 or older</strong> to use this service.',
      ],
      btn: "I'm 13+ and I agree",
      legal: 'Terms &amp; Privacy Policy',
    };

    var legalHref = L === 'ko' ? '/landing/terms.html' : '/landing/en/terms.html';
    var wrap = document.createElement('div');
    wrap.id = 'complianceGate';
    wrap.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,0.86);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:20px';
    wrap.innerHTML =
      '<div role="dialog" aria-modal="true" style="background:linear-gradient(170deg,#1a1e2e,#141428);border:1px solid rgba(124,92,252,0.25);border-radius:22px;padding:30px 26px;width:min(400px,92vw);box-shadow:0 16px 48px rgba(0,0,0,0.6)">' +
        '<div style="font-size:28px;text-align:center;margin-bottom:10px">✦</div>' +
        '<div style="font-size:19px;font-weight:700;color:#f0f0ff;text-align:center;margin-bottom:16px">' + t.title + '</div>' +
        '<div style="font-size:13px;color:rgba(255,255,255,0.7);line-height:1.65;text-align:left">' +
          t.lines.map(function (l) { return '<p style="margin:0 0 12px">' + l + '</p>'; }).join('') +
        '</div>' +
        '<button id="_cgAck" style="width:100%;margin-top:8px;padding:14px 0;border:none;border-radius:14px;background:linear-gradient(135deg,#7C5CFC,#5A3AD9);color:#fff;font-size:14px;font-weight:600;cursor:pointer">' + t.btn + '</button>' +
        '<div style="text-align:center;margin-top:12px"><a href="' + legalHref + '" target="_blank" rel="noopener" style="font-size:11px;color:rgba(255,255,255,0.4)">' + t.legal + '</a></div>' +
      '</div>';
    document.body.appendChild(wrap);
    document.getElementById('_cgAck').addEventListener('click', function () {
      try { localStorage.setItem(KEY, '1'); } catch (_) {}
      wrap.remove();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render);
  } else {
    render();
  }
})();
