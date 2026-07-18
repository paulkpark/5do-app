/* ===== account-ui.js: Login / Account / Upgrade Modals ===== */

// ─── In-app browser detection ───
// Google blocks OAuth from embedded WebViews (error: 403 disallowed_useragent).
// SNS in-app browsers (Threads, Instagram, Facebook, TikTok, KakaoTalk, etc.)
// all use WebViews. We detect them and warn the user up-front so they don't
// hit Google's block screen.
function detectInAppBrowser() {
  const ua = navigator.userAgent || '';
  const tests = [
    { name: 'Threads',   re: /\bThreads\b|Barcelona/i },
    { name: 'Instagram', re: /Instagram/i },
    { name: 'Facebook',  re: /FBAN|FBAV|FB_IAB|FB4A/i },
    { name: 'TikTok',    re: /BytedanceWebview|musical_ly|TikTok/i },
    { name: 'X',         re: /Twitter/i },
    { name: 'KakaoTalk', re: /KAKAOTALK/i },
    { name: 'NAVER',     re: /NAVER\(inapp|naver/i },
    { name: 'LINE',      re: /\bLine\/|LINEApp/i },
    { name: 'WeChat',    re: /MicroMessenger/i },
    { name: 'Daum',      re: /DaumApps/i },
  ];
  for (const t of tests) {
    if (t.re.test(ua)) return t.name;
  }
  return null;
}

// ─── Login Modal ───
function showLoginModal() {
  // Always rebuild so language/detection changes are fresh.
  let prev = document.getElementById('loginModal');
  if (prev) prev.remove();

  const L = (typeof LANG !== 'undefined' && LANG === 'en') ? 'en' : 'ko';
  const inApp = detectInAppBrowser();

  const copy = {
    ko: {
      title: '로그인 / 회원가입',
      sub: '5DO의 모든 기능을 이용하세요',
      or: '또는',
      email: '이메일 주소',
      emailBtn: '매직 링크 로그인',
      close: '닫기',
      pwPlaceholder: '비밀번호 (6자 이상)',
      pwLogin: '로그인',
      pwSignup: '회원가입',
      privacy: '✨ 이메일+비밀번호가 가장 사적인 가입 방법 — 추가 정보 없이 시작',
      altLink: '대신 매직 링크로 받기',
      googleAlt: 'Google 계정으로 빠른 로그인',
      googleNote: 'Google 이름·프로필 사진이 5DO에 공유돼요',
      inAppTitle: `${inApp || '인앱'} 브라우저에서는 Google 로그인이 차단됩니다`,
      inAppBody: '구글 정책상 SNS 앱 내부 브라우저에서는 Google 계정 로그인이 불가능합니다. 아래 이메일+비밀번호로 로그인하시거나 외부 브라우저에서 열어주세요.',
      inAppStep1: '① 주소 복사 → Chrome/Safari에 붙여넣기',
      inAppStep2: '② 아래 이메일+비밀번호로 바로 가입·로그인 (이 브라우저에서도 가능)',
      copyBtn: '현재 주소 복사',
      copied: '복사됨!',
      keepLogin: '로그인 유지 (자동 로그아웃 안 함)',
    },
    en: {
      title: 'Sign In / Sign Up',
      sub: 'Unlock all 5DO features',
      or: 'or',
      email: 'Email address',
      emailBtn: 'Send Magic Link',
      close: 'Close',
      pwPlaceholder: 'Password (6+ characters)',
      pwLogin: 'Sign In',
      pwSignup: 'Sign Up',
      privacy: '✨ Email + password is the most private way to sign up — nothing extra shared',
      altLink: 'Send magic link instead',
      googleAlt: 'Quick sign-in with Google',
      googleNote: 'Your Google name and profile photo will be shared with 5DO',
      inAppTitle: `Google sign-in is blocked inside ${inApp || 'in-app'} browser`,
      inAppBody: "Google's policy blocks OAuth from SNS in-app browsers. Use email+password below, or open this page in an external browser.",
      inAppStep1: '① Copy this URL → paste into Chrome / Safari',
      inAppStep2: '② Or sign up / sign in with email + password right here',
      copyBtn: 'Copy URL',
      copied: 'Copied!',
      keepLogin: 'Keep me signed in',
    },
  }[L];

  const banner = inApp ? `
    <div style="background:rgba(251,191,36,0.12);border:1px solid rgba(251,191,36,0.35);border-radius:12px;padding:14px 16px;margin-bottom:20px;text-align:left">
      <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:8px">
        <span style="font-size:18px;line-height:1">⚠️</span>
        <div style="font-size:13px;font-weight:700;color:#fbbf24;line-height:1.4">${copy.inAppTitle}</div>
      </div>
      <div style="font-size:12px;color:rgba(255,255,255,0.75);line-height:1.6;margin-bottom:10px">${copy.inAppBody}</div>
      <div style="font-size:11.5px;color:rgba(255,255,255,0.85);line-height:1.7;margin-bottom:10px">
        ${copy.inAppStep1}<br>${copy.inAppStep2}
      </div>
      <button onclick="_copyLoginUrl(this,'${copy.copied.replace(/'/g,"\\'")}')" style="width:100%;padding:10px;border-radius:8px;border:1px solid rgba(251,191,36,0.4);background:rgba(251,191,36,0.1);color:#fbbf24;font-size:12px;font-weight:600;cursor:pointer">
        📋 ${copy.copyBtn}
      </button>
    </div>` : '';

  // Gray out Google button when blocked, but still clickable in case user wants to try
  const googleBtnStyle = inApp
    ? 'opacity:0.55;filter:grayscale(.3)'
    : '';

  const m = document.createElement('div');
  m.id = 'loginModal';
  m.style.cssText = 'display:flex;position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:9999;align-items:center;justify-content:center;padding:16px;overflow-y:auto';
  m.innerHTML = `
    <div style="background:#1a1e2e;border-radius:20px;padding:28px 24px;width:min(380px,92vw);text-align:center;box-shadow:0 12px 40px rgba(0,0,0,0.6);max-height:92vh;overflow-y:auto">
      <div style="font-size:18px;font-weight:700;color:#e0f0ff;margin-bottom:6px">${copy.title}</div>
      <div style="font-size:12px;color:rgba(255,255,255,0.5);margin-bottom:18px">${copy.sub}</div>
      ${banner}

      <!-- Primary path: email + password (most private, recommended) -->
      <div style="background:rgba(124,92,252,0.06);border:1px solid rgba(124,92,252,0.18);border-radius:12px;padding:14px 14px;margin-bottom:14px;text-align:left">
        <div style="font-size:11px;color:#C4B5FD;margin-bottom:10px;font-weight:500;text-align:center">${copy.privacy}</div>
        <input type="email" id="loginEmail" autocomplete="username" placeholder="${copy.email}" style="width:100%;padding:12px;margin-bottom:8px;border-radius:10px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.06);color:#e0f0ff;font-size:14px;outline:none;box-sizing:border-box">
        <input type="password" id="loginPassword" autocomplete="current-password" placeholder="${copy.pwPlaceholder}" style="width:100%;padding:12px;margin-bottom:10px;border-radius:10px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.06);color:#e0f0ff;font-size:14px;outline:none;box-sizing:border-box">
        <div id="loginPwMsg" style="font-size:11px;color:#F87171;display:none;margin-bottom:8px"></div>
        <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:rgba(200,180,255,0.85);margin-bottom:10px;cursor:pointer;user-select:none">
          <input type="checkbox" id="keepLoggedIn" ${(localStorage.getItem('auth_keep_logged_in') ?? '1') !== '0' ? 'checked' : ''} style="width:14px;height:14px;accent-color:#7C5CFC;cursor:pointer">
          ${copy.keepLogin}
        </label>
        <div style="display:flex;gap:8px">
          <button id="loginPwBtn" onclick="authEmailPasswordLogin()" style="flex:1;padding:12px;border-radius:10px;border:none;background:linear-gradient(135deg,#7C5CFC,#5A3AD9);color:#fff;font-size:14px;font-weight:600;cursor:pointer">${copy.pwLogin}</button>
          <button id="signupBtn" onclick="authEmailSignup()" style="flex:1;padding:12px;border-radius:10px;border:1px solid rgba(124,92,252,0.5);background:transparent;color:#C4B5FD;font-size:14px;font-weight:600;cursor:pointer">${copy.pwSignup}</button>
        </div>
        <button onclick="authEmailLogin()" id="loginEmailBtn" style="width:100%;padding:8px 0;margin-top:10px;background:none;border:none;color:rgba(180,160,255,0.7);font-size:12px;cursor:pointer;text-decoration:underline;text-underline-offset:3px">${copy.altLink}</button>
        <div id="loginEmailMsg" style="font-size:11px;color:#4ADE80;display:none;margin-top:6px;text-align:center"></div>
      </div>

      <!-- Secondary path: Google — smaller, with privacy disclosure -->
      <div style="display:flex;align-items:center;gap:12px;margin:6px 0 12px">
        <div style="flex:1;height:1px;background:rgba(255,255,255,0.08)"></div>
        <span style="font-size:11px;color:rgba(255,255,255,0.3)">${copy.or}</span>
        <div style="flex:1;height:1px;background:rgba(255,255,255,0.08)"></div>
      </div>
      <button onclick="authSignIn('google')" style="width:100%;padding:10px;margin-bottom:6px;border-radius:10px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.92);color:#444;font-size:13px;font-weight:500;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;${googleBtnStyle}">
        <svg width="16" height="16" viewBox="0 0 48 48"><path fill="#4285F4" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#34A853" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#EA4335" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
        ${copy.googleAlt}
      </button>
      <div style="font-size:10px;color:rgba(255,255,255,0.35);margin-bottom:6px;line-height:1.5">${copy.googleNote}</div>

      <button onclick="document.getElementById('loginModal').style.display='none'" style="margin-top:14px;background:none;border:none;color:rgba(255,255,255,0.4);font-size:12px;cursor:pointer">${copy.close}</button>
    </div>`;
  document.body.appendChild(m);
  m.addEventListener('click', (e) => { if (e.target === m) m.style.display = 'none'; });
}

// Copy current URL helper for in-app browser banner
function _copyLoginUrl(btn, copiedLabel) {
  const url = window.location.href;
  const done = () => {
    const orig = btn.innerHTML;
    btn.innerHTML = '✓ ' + copiedLabel;
    setTimeout(() => { btn.innerHTML = orig; }, 1800);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(done).catch(() => {
      // Fallback for older webviews
      const ta = document.createElement('textarea');
      ta.value = url; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (_) {}
      document.body.removeChild(ta);
    });
  } else {
    const ta = document.createElement('textarea');
    ta.value = url; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch (_) {}
    document.body.removeChild(ta);
  }
}

// Consent gate for the upgrade modal's pay buttons. Blocks checkout until the
// user affirmatively agrees to the recurring-billing terms (#_upConsent).
function _upPay(method) {
  const L = (typeof LANG !== 'undefined' && LANG === 'en') ? 'en' : 'ko';
  const c = document.getElementById('_upConsent');
  if (!c || !c.checked) {
    alert(L === 'ko'
      ? '결제를 진행하려면 자동결제 조건에 동의해 주세요.'
      : 'Please agree to the recurring-billing terms to continue.');
    return;
  }
  const interval = document.getElementById('_upInterval').value;
  SUB.startCheckout(interval, method);
}
window._upPay = _upPay;

// ─── Upgrade Modal (Free → Pro) ───
function showUpgradeModal(featureName) {
  let m = document.getElementById('upgradeModal');
  if (m) m.remove();

  const L = (typeof LANG !== 'undefined' && LANG === 'en') ? 'en' : 'ko';
  const featureLabels = {
    category:  { ko: '이 카테고리', en: 'this category' },
    binaural:  { ko: '바이노럴 모드', en: 'Binaural Mode' },
    dual_tone: { ko: '듀얼 톤', en: 'Dual Tone' },
    harmonics: { ko: '하모닉스', en: 'Harmonics' },
    wav_export:{ ko: 'WAV 내보내기', en: 'WAV Export' },
    preset:    { ko: '프리셋 저장', en: 'Preset Save' },
    playlist:  { ko: '플레이리스트', en: 'Playlist' },
    akashic:   { ko: '소울 코드', en: 'Soul Code' },
    soulcode:  { ko: '소울 코드', en: 'Soul Code' },
    qtx:       { ko: 'QTX 모드', en: 'QTX Mode' },
  };
  const feat = featureLabels[featureName] || { ko: featureName, en: featureName };
  const title = L === 'ko' ? '5DO Pro로 업그레이드' : 'Upgrade to 5DO Pro';
  const desc = L === 'ko'
    ? `${feat.ko} 기능은 Pro 멤버십이 필요합니다.`
    : `${feat.en} requires a Pro membership.`;

  // Pricing — pulled from SUB.getPricing() so the modal can never disagree
  // with what subscription.js charges. Provider decides currency: Toss → KRW,
  // Stripe → USD. The .display field is already currency-formatted.
  const provider = SUB.resolveProvider();              // 'toss' | 'stripe'
  const monthlyP = SUB.getPricing('monthly', provider);
  const yearlyP  = SUB.getPricing('yearly', provider);
  const earlyBird = monthlyP.earlyBird;                // Toss-only early-bird
  const fmtReg = (n) => '₩' + n.toLocaleString('ko-KR'); // struck-through KRW regular price
  const discount = earlyBird ? (L === 'ko' ? '얼리버드 30% 할인!' : '30% Early Bird Discount!') : '';
  const yearlyNote = L === 'ko' ? '/년' : '/yr';

  // Region/currency toggle — lets the user override IP-geo detection (e.g. a
  // Korean user paying with an overseas card, or a traveler). Persisted to
  // localStorage.payRegion and re-renders the modal via SUB.resolveProvider().
  const featArg = featureName || 'category';
  const chip = (r, label, active, color) =>
    `<div onclick="try{localStorage.setItem('payRegion','${r}')}catch(_){}; showUpgradeModal('${featArg}')" style="padding:6px 14px;border-radius:999px;cursor:pointer;font-size:12px;font-weight:600;border:1px solid ${active?color:'rgba(255,255,255,0.15)'};color:${active?color:'rgba(255,255,255,0.5)'};background:${active?color.replace('0.7','0.12'):'transparent'}">${label}</div>`;
  const regionToggle = `
      <div style="display:flex;gap:6px;justify-content:center;margin-bottom:16px">
        ${chip('KR', '🇰🇷 대한민국 (₩)', provider === 'toss', 'rgba(124,92,252,0.7)')}
        ${chip('INTL', '🌐 International ($)', provider === 'stripe', 'rgba(62,207,207,0.7)')}
      </div>`;

  // Payment buttons: Toss shows card auto-renew + Korean easy-pay; Stripe shows
  // one button (its hosted checkout offers card, Apple/Google Pay, and PayPal).
  const payButtons = provider === 'stripe'
    ? `<div onclick="_upPay()" style="flex:1;padding:14px 8px;background:rgba(62,207,207,0.14);border:1px solid rgba(62,207,207,0.35);border-radius:12px;cursor:pointer;text-align:center;transition:all .2s" onmouseover="this.style.borderColor='rgba(62,207,207,0.7)'" onmouseout="this.style.borderColor='rgba(62,207,207,0.35)'">
          <div style="font-size:14px;font-weight:700;color:#F0F0FF">${L === 'ko' ? '구독하기' : 'Subscribe'}</div>
          <div style="font-size:9px;color:rgba(255,255,255,0.4);margin-top:3px">Card · Apple Pay · Google Pay · PayPal</div>
        </div>`
    : `<div onclick="_upPay('card')" style="flex:1;padding:12px 8px;background:rgba(124,92,252,0.12);border:1px solid rgba(124,92,252,0.3);border-radius:12px;cursor:pointer;text-align:center;transition:all .2s" onmouseover="this.style.borderColor='rgba(124,92,252,0.6)'" onmouseout="this.style.borderColor='rgba(124,92,252,0.3)'">
          <div style="font-size:13px;font-weight:600;color:#F0F0FF">💳 ${L === 'ko' ? '카드 결제' : 'Card'}</div>
          <div style="font-size:9px;color:rgba(255,255,255,0.35);margin-top:3px">${L === 'ko' ? '자동갱신' : 'Auto-renew'}</div>
        </div>
        <div onclick="_upPay('easy')" style="flex:1;padding:12px 8px;background:rgba(255,180,60,0.1);border:1px solid rgba(255,180,60,0.25);border-radius:12px;cursor:pointer;text-align:center;transition:all .2s" onmouseover="this.style.borderColor='rgba(255,180,60,0.5)'" onmouseout="this.style.borderColor='rgba(255,180,60,0.25)'">
          <div style="font-size:13px;font-weight:600;color:#F0F0FF">📱 ${L === 'ko' ? '간편결제' : 'Easy Pay'}</div>
          <div style="font-size:9px;color:rgba(255,255,255,0.35);margin-top:3px">${L === 'ko' ? '카카오·네이버·토스' : 'Kakao·Naver·Toss'}</div>
        </div>`;
  const secureNote = provider === 'stripe'
    ? (L === 'ko' ? '언제든 해지 가능 · Stripe 안전 결제' : 'Cancel anytime · Secure Stripe payment')
    : (L === 'ko' ? '언제든 해지 가능 · 토스페이먼츠 안전 결제' : 'Cancel anytime · Secure Toss payment');

  // Recurring-billing consent (US FTC negative-option / California ARL): the
  // exact amount + cadence must be clear and conspicuous, with affirmative
  // consent, before the charge. _upPay() blocks checkout until this is checked.
  const recurringLine = L === 'ko'
    ? `결제 시 선택한 플랜(월 ${monthlyP.display} · 연 ${yearlyP.display})이 각 주기마다 자동으로 반복 청구되며, 프로필 → 구독 관리에서 언제든 해지할 수 있습니다.`
    : `The plan you select (${monthlyP.display}/mo · ${yearlyP.display}/yr) auto-renews and is charged each period until you cancel. Cancel anytime in Profile → Subscription.`;
  const consentBlock = `
      <label style="display:flex;gap:8px;align-items:flex-start;text-align:left;margin-bottom:14px;cursor:pointer">
        <input type="checkbox" id="_upConsent" style="margin-top:2px;flex-shrink:0;accent-color:#7C5CFC">
        <span style="font-size:11px;color:rgba(255,255,255,0.6);line-height:1.5">${recurringLine} <span style="color:rgba(255,255,255,0.92);font-weight:600">${L === 'ko' ? '위 자동결제 조건에 동의합니다.' : 'I agree to these recurring charges.'}</span></span>
      </label>`;

  m = document.createElement('div');
  m.id = 'upgradeModal';
  m.style.cssText = 'display:flex;position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:9999;align-items:center;justify-content:center;backdrop-filter:blur(4px)';
  m.innerHTML = `
    <div style="background:linear-gradient(170deg,#1a1e2e,#141428);border:1px solid rgba(124,92,252,0.2);border-radius:24px;padding:36px 28px;width:min(380px,90vw);text-align:center;box-shadow:0 16px 48px rgba(0,0,0,0.6)">
      <div style="font-size:32px;margin-bottom:8px">✦</div>
      <div style="font-size:20px;font-weight:700;color:#f0f0ff;margin-bottom:8px">${title}</div>
      <div style="font-size:13px;color:rgba(255,255,255,0.6);margin-bottom:4px">${desc}</div>
      ${earlyBird ? `<div style="font-size:13px;color:#FFB86C;font-weight:600;margin-bottom:16px">🔥 ${discount}</div>` : '<div style="margin-bottom:16px"></div>'}

      <div style="text-align:left;margin-bottom:20px;padding:0 8px">
        <div style="font-size:12px;font-weight:600;color:#9B7FFF;margin-bottom:10px;text-transform:uppercase;letter-spacing:1px">PRO features</div>
        <div style="font-size:12px;color:rgba(255,255,255,0.65);line-height:2">
          ✓ ${L==='ko'?'전체 라이브러리 (150+ 트랙)':'Full library (150+ tracks)'}<br>
          ✓ ${L==='ko'?'Soul Code AI 영혼 분석':'Soul Code AI soul reading'}<br>
          ✓ ${L==='ko'?'주파수 생성기 풀 기능 (바이노럴/하모닉스/듀얼톤)':'Full generator (binaural/harmonics/dual-tone)'}<br>
          ✓ ${L==='ko'?'WAV 내보내기':'WAV export'}<br>
          ✓ ${L==='ko'?'QTX 출력 모드':'QTX output mode'}<br>
          ✓ ${L==='ko'?'무제한 프리셋 & 플레이리스트':'Unlimited presets & playlists'}
        </div>
      </div>

      ${regionToggle}
      <div style="display:flex;gap:10px;margin-bottom:12px">
        <div onclick="document.getElementById('_upInterval').value='monthly';document.querySelectorAll('._upPlan').forEach(e=>e.style.borderColor='');this.style.borderColor='rgba(124,92,252,0.7)'" style="flex:1;padding:18px 12px;background:rgba(124,92,252,0.08);border:2px solid rgba(124,92,252,0.25);border-radius:16px;cursor:pointer;transition:all .2s" class="_upPlan">
          <div style="font-size:11px;color:rgba(255,255,255,0.5);margin-bottom:4px">${L === 'ko' ? '월간' : 'Monthly'}</div>
          <div style="font-size:24px;font-weight:700;color:#9B7FFF">${monthlyP.display}</div>
          <div style="font-size:10px;color:rgba(255,255,255,0.35)">${L === 'ko' ? '/월' : '/month'}</div>
          ${earlyBird ? `<div style="font-size:10px;color:#FFB86C;margin-top:4px;text-decoration:line-through;opacity:0.6">${fmtReg(monthlyP.regularAmount)}</div>` : ''}
        </div>
        <div onclick="document.getElementById('_upInterval').value='yearly';document.querySelectorAll('._upPlan').forEach(e=>e.style.borderColor='');this.style.borderColor='rgba(62,207,207,0.7)'" style="flex:1;padding:18px 12px;background:rgba(62,207,207,0.08);border:2px solid rgba(62,207,207,0.35);border-radius:16px;cursor:pointer;position:relative;transition:all .2s" class="_upPlan">
          <div style="position:absolute;top:-10px;right:12px;background:linear-gradient(135deg,#3ECFCF,#4ADE80);color:#000;font-size:10px;font-weight:700;padding:3px 10px;border-radius:10px">BEST</div>
          <div style="font-size:11px;color:rgba(255,255,255,0.5);margin-bottom:4px">${L === 'ko' ? '연간' : 'Yearly'}</div>
          <div style="font-size:24px;font-weight:700;color:#3ECFCF">${yearlyP.display}</div>
          <div style="font-size:10px;color:rgba(255,255,255,0.35)">${yearlyNote}</div>
          ${earlyBird ? `<div style="font-size:10px;color:#FFB86C;margin-top:4px;text-decoration:line-through;opacity:0.6">${fmtReg(yearlyP.regularAmount)}</div>` : ''}
        </div>
      </div>
      <input type="hidden" id="_upInterval" value="monthly">
      ${consentBlock}
      <div style="display:flex;gap:8px;margin-bottom:16px">
        ${payButtons}
      </div>
      <div style="font-size:11px;color:rgba(255,255,255,0.3);margin-bottom:16px">${secureNote}</div>
      <button onclick="document.getElementById('upgradeModal').style.display='none'" style="background:none;border:none;color:rgba(255,255,255,0.35);font-size:12px;cursor:pointer">${L === 'ko' ? '나중에' : 'Maybe later'}</button>
    </div>`;
  document.body.appendChild(m);
  m.addEventListener('click', (e) => { if (e.target === m) m.style.display = 'none'; });
}

// ─── Account Dropdown Toggle ───
function toggleAccountDrop() {
  const drop = document.getElementById('accountDrop');
  if (!drop) return;
  const isOpen = drop.style.display === 'block';
  drop.style.display = isOpen ? 'none' : 'block';
  // Fill account info + localize labels (they're hard-coded KO in 5do.html;
  // set them here on every open so the dropdown follows the language toggle).
  if (!isOpen && window.APP_USER) {
    const L = (typeof LANG !== 'undefined' && LANG === 'en') ? 'en' : 'ko';
    const name = document.getElementById('accountName');
    if (name) name.textContent = APP_USER.displayName || APP_USER.email || '';
    const tier = document.getElementById('accountTierLabel');
    if (tier) tier.textContent = APP_USER.tier === 'pro'
      ? (L === 'ko' ? 'Pro 플랜' : 'Pro plan')
      : (L === 'ko' ? 'Free 플랜' : 'Free plan');
    const manageBtn = document.getElementById('accountManageBtn');
    if (manageBtn) manageBtn.textContent = L === 'ko' ? '구독 관리' : 'Manage subscription';
    const referralBtn = document.getElementById('accountReferralBtn');
    if (referralBtn) referralBtn.textContent = L === 'ko' ? '🎁 친구 초대' : '🎁 Invite friends';
    const logoutBtn = document.getElementById('accountLogoutBtn');
    if (logoutBtn) logoutBtn.textContent = L === 'ko' ? '로그아웃' : 'Sign out';
    // Hide the coupon-entry row for Pro members — they've already redeemed
    // or purchased and don't need a coupon entry point in their account menu.
    const couponBtn = document.getElementById('accountCouponBtn');
    if (couponBtn) {
      couponBtn.textContent = L === 'ko' ? '쿠폰 입력' : 'Enter coupon';
      couponBtn.style.display = (APP_USER.tier === 'pro') ? 'none' : '';
    }
  }
  // Close on outside click
  if (!isOpen) {
    setTimeout(() => {
      const handler = (e) => {
        if (!document.getElementById('authUserBtn')?.contains(e.target)) {
          drop.style.display = 'none';
          document.removeEventListener('click', handler);
        }
      };
      document.addEventListener('click', handler);
    }, 0);
  }
}

// ─── Coupon Modal ───
function showCouponModal() {
  // Close account dropdown
  const ad = document.getElementById('accountDrop');
  if (ad) ad.style.display = 'none';

  if (!window.APP_USER) { showLoginModal(); return; }

  let m = document.getElementById('couponModal');
  if (m) { m.style.display = 'flex'; return; }

  const L = (typeof LANG !== 'undefined' && LANG === 'en') ? 'en' : 'ko';
  m = document.createElement('div');
  m.id = 'couponModal';
  m.style.cssText = 'display:flex;position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:9999;align-items:center;justify-content:center';
  m.innerHTML = `
    <div style="background:#1a1e2e;border-radius:20px;padding:32px 28px;width:min(340px,88vw);text-align:center;box-shadow:0 12px 40px rgba(0,0,0,0.6)">
      <div style="font-size:18px;font-weight:700;color:#e0f0ff;margin-bottom:6px">${L === 'ko' ? '쿠폰 입력' : 'Enter Coupon'}</div>
      <div style="font-size:12px;color:rgba(255,255,255,0.5);margin-bottom:20px">${L === 'ko' ? 'QTX 고객 전용 코드를 입력하세요' : 'Enter your QTX customer code'}</div>
      <input type="text" id="couponInput" placeholder="5DO-XXXX-XXXX" style="width:100%;padding:14px;margin-bottom:12px;border-radius:10px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.06);color:#e0f0ff;font-size:16px;text-align:center;letter-spacing:2px;outline:none;box-sizing:border-box;text-transform:uppercase">
      <div id="couponMsg" style="font-size:12px;display:none;margin-bottom:10px"></div>
      <button onclick="redeemCoupon()" style="width:100%;padding:12px;border-radius:10px;border:none;background:linear-gradient(135deg,#FFB86C,#FF6B9D);color:#fff;font-size:14px;font-weight:600;cursor:pointer" id="couponBtn">${L === 'ko' ? '쿠폰 적용' : 'Apply Coupon'}</button>
      <button onclick="document.getElementById('couponModal').style.display='none'" style="margin-top:10px;background:none;border:none;color:rgba(255,255,255,0.4);font-size:12px;cursor:pointer">${L === 'ko' ? '닫기' : 'Close'}</button>
    </div>`;
  document.body.appendChild(m);
  m.addEventListener('click', (e) => { if (e.target === m) m.style.display = 'none'; });
}

async function redeemCoupon() {
  const input = document.getElementById('couponInput');
  const msg = document.getElementById('couponMsg');
  const btn = document.getElementById('couponBtn');
  const code = input?.value?.trim();
  if (!code) { input.focus(); return; }
  if (!window.APP_USER) { showLoginModal(); return; }

  const L = (typeof LANG !== 'undefined' && LANG === 'en') ? 'en' : 'ko';
  btn.disabled = true; btn.style.opacity = '0.5';

  try {
    const res = await fetch('/api/coupon/redeem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, user_id: window.APP_USER.id }),
    });
    const data = await res.json();
    if (data.ok) {
      msg.textContent = L === 'ko' ? '🎉 Lifetime Pro가 활성화되었습니다!' : '🎉 Lifetime Pro activated!';
      msg.style.color = '#4ADE80'; msg.style.display = 'block';
      // Refresh profile
      const { data: { session } } = await SB.auth.getSession();
      if (session && typeof _loadUserProfile === 'function') await _loadUserProfile(session);
      if (typeof _updateAuthUI === 'function') _updateAuthUI();
      setTimeout(() => { document.getElementById('couponModal').style.display = 'none'; }, 2000);
    } else {
      const errMap = {
        INVALID_CODE: L === 'ko' ? '유효하지 않은 쿠폰 코드입니다.' : 'Invalid coupon code.',
        ALREADY_USED: L === 'ko' ? '이미 사용된 쿠폰입니다.' : 'This coupon has already been used.',
      };
      msg.textContent = errMap[data.error] || data.error;
      msg.style.color = '#F87171'; msg.style.display = 'block';
    }
  } catch (e) {
    msg.textContent = e.message; msg.style.color = '#F87171'; msg.style.display = 'block';
  }
  btn.disabled = false; btn.style.opacity = '1';
}

// ─── Referral (Invite friends) ───
async function showReferralModal() {
  const ad = document.getElementById('accountDrop');
  if (ad) ad.style.display = 'none';
  if (!window.APP_USER) { showLoginModal(); return; }

  const L = (typeof LANG !== 'undefined' && LANG === 'en') ? 'en' : 'ko';
  let m = document.getElementById('referralModal');
  if (m) m.remove();
  m = document.createElement('div');
  m.id = 'referralModal';
  m.style.cssText = 'display:flex;position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:9999;align-items:center;justify-content:center';
  m.innerHTML = `
    <div style="background:#1a1e2e;border-radius:20px;padding:30px 26px;width:min(360px,90vw);text-align:center;box-shadow:0 12px 40px rgba(0,0,0,0.6)">
      <div style="font-size:26px;margin-bottom:6px">🎁</div>
      <div style="font-size:18px;font-weight:700;color:#e0f0ff;margin-bottom:6px">${L === 'ko' ? '친구 초대' : 'Invite friends'}</div>
      <div style="font-size:12px;color:rgba(255,255,255,0.6);line-height:1.6;margin-bottom:18px">${L === 'ko'
        ? '친구가 내 링크로 가입 후 첫 구독을 하면<br><strong style="color:#4ADE80">친구 +14일</strong>, <strong style="color:#4ADE80">나 +30일</strong> Pro 무료!'
        : 'When a friend subscribes via your link,<br>they get <strong style="color:#4ADE80">+14 days</strong> and you get <strong style="color:#4ADE80">+30 days</strong> of Pro, free!'}</div>
      <div id="refLinkBox" style="display:flex;gap:6px;margin-bottom:12px">
        <input id="refLink" readonly value="${L === 'ko' ? '불러오는 중…' : 'Loading…'}" style="flex:1;padding:12px;border-radius:10px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.06);color:#9BE7C4;font-size:12px;outline:none;box-sizing:border-box">
        <button id="refCopyBtn" onclick="_copyReferral()" style="padding:0 16px;border-radius:10px;border:none;background:linear-gradient(135deg,#4ADE80,#3ECFCF);color:#04220f;font-size:13px;font-weight:700;cursor:pointer">${L === 'ko' ? '복사' : 'Copy'}</button>
      </div>
      <div id="refStats" style="font-size:12px;color:rgba(255,255,255,0.5);margin-bottom:16px">&nbsp;</div>
      <button onclick="document.getElementById('referralModal').style.display='none'" style="background:none;border:none;color:rgba(255,255,255,0.4);font-size:12px;cursor:pointer">${L === 'ko' ? '닫기' : 'Close'}</button>
    </div>`;
  document.body.appendChild(m);
  m.addEventListener('click', (e) => { if (e.target === m) m.style.display = 'none'; });

  try {
    const res = await fetch('/api/referral/me?user_id=' + encodeURIComponent(window.APP_USER.id));
    const d = await res.json();
    const linkEl = document.getElementById('refLink');
    if (linkEl && d.link) linkEl.value = d.link;
    const statsEl = document.getElementById('refStats');
    if (statsEl) statsEl.innerHTML = L === 'ko'
      ? `초대 ${d.invited || 0}명 · 구독 전환 ${d.qualified || 0}명 · 획득 <strong style="color:#4ADE80">${d.daysEarned || 0}일</strong>`
      : `${d.invited || 0} invited · ${d.qualified || 0} subscribed · <strong style="color:#4ADE80">${d.daysEarned || 0} days</strong> earned`;
  } catch (_) {}
}

function _copyReferral() {
  const el = document.getElementById('refLink');
  const btn = document.getElementById('refCopyBtn');
  const L = (typeof LANG !== 'undefined' && LANG === 'en') ? 'en' : 'ko';
  if (!el || !el.value) return;
  const done = () => { if (btn) btn.textContent = L === 'ko' ? '복사됨!' : 'Copied!'; };
  try {
    if (navigator.clipboard) { navigator.clipboard.writeText(el.value).then(done, () => { el.select(); document.execCommand('copy'); done(); }); }
    else { el.select(); document.execCommand('copy'); done(); }
  } catch (_) { el.select(); }
}
window.showReferralModal = showReferralModal;
window._copyReferral = _copyReferral;

// ─── Account Dropdown Lang ───
function updateAuthLang() {
  const L = (typeof LANG !== 'undefined' && LANG === 'en') ? 'en' : 'ko';
  const t = document.getElementById('loginTitle');
  if (t) t.textContent = L === 'ko' ? '로그인' : 'Sign In';
  const s = document.getElementById('loginSub');
  if (s) s.textContent = L === 'ko' ? '5DO의 모든 기능을 이용하세요' : 'Unlock all features';
  const c = document.getElementById('loginClose');
  if (c) c.textContent = L === 'ko' ? '닫기' : 'Close';
}
