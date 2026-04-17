/* ===== account-ui.js: Login / Account / Upgrade Modals ===== */

// ─── Login Modal ───
function showLoginModal() {
  let m = document.getElementById('loginModal');
  if (m) { m.style.display = 'flex'; return; }

  m = document.createElement('div');
  m.id = 'loginModal';
  m.style.cssText = 'display:flex;position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:9999;align-items:center;justify-content:center';
  m.innerHTML = `
    <div style="background:#1a1e2e;border-radius:20px;padding:32px 28px;width:min(340px,88vw);text-align:center;box-shadow:0 12px 40px rgba(0,0,0,0.6)">
      <div style="font-size:18px;font-weight:700;color:#e0f0ff;margin-bottom:6px" id="loginTitle">로그인</div>
      <div style="font-size:12px;color:rgba(255,255,255,0.5);margin-bottom:24px" id="loginSub">5DO의 모든 기능을 이용하세요</div>
      <button onclick="authSignIn('google')" style="width:100%;padding:12px;margin-bottom:10px;border-radius:10px;border:1px solid rgba(255,255,255,0.12);background:#fff;color:#333;font-size:14px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px">
        <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#4285F4" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#34A853" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#EA4335" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
        Google
      </button>
      <div style="display:flex;align-items:center;gap:12px;margin:12px 0">
        <div style="flex:1;height:1px;background:rgba(255,255,255,0.1)"></div>
        <span style="font-size:11px;color:rgba(255,255,255,0.35)" id="loginOr">또는</span>
        <div style="flex:1;height:1px;background:rgba(255,255,255,0.1)"></div>
      </div>
      <input type="email" id="loginEmail" placeholder="이메일 주소" style="width:100%;padding:12px;margin-bottom:10px;border-radius:10px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.06);color:#e0f0ff;font-size:14px;outline:none;box-sizing:border-box">
      <button onclick="authEmailLogin()" style="width:100%;padding:12px;margin-bottom:10px;border-radius:10px;border:none;background:linear-gradient(135deg,#7C5CFC,#5A3AD9);color:#fff;font-size:14px;font-weight:600;cursor:pointer" id="loginEmailBtn">매직 링크 로그인</button>
      <div id="loginEmailMsg" style="font-size:11px;color:#4ADE80;display:none;margin-bottom:8px"></div>
      <button onclick="document.getElementById('loginModal').style.display='none'" style="margin-top:8px;background:none;border:none;color:rgba(255,255,255,0.4);font-size:12px;cursor:pointer" id="loginClose">닫기</button>
    </div>`;
  document.body.appendChild(m);
  m.addEventListener('click', (e) => { if (e.target === m) m.style.display = 'none'; });
}

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

  // Early bird pricing (Apr 15 ~ Apr 30)
  const earlyBird = typeof SUB !== 'undefined' && SUB.isEarlyBird && SUB.isEarlyBird();
  const monthlyPrice = earlyBird ? '$6.99' : '$9.99';
  const yearlyPrice = earlyBird ? '$39.99' : '$59.99';
  const monthlyKr = earlyBird ? '6,900원' : '9,900원';
  const yearlyKr = earlyBird ? '39,900원' : '59,900원';
  const discount = earlyBird ? (L === 'ko' ? '얼리버드 30% 할인!' : '30% Early Bird Discount!') : '';
  const yearlyNote = L === 'ko' ? '/년' : '/yr';

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

      <div style="display:flex;gap:10px;margin-bottom:12px">
        <div onclick="document.getElementById('_upInterval').value='monthly';document.querySelectorAll('._upPlan').forEach(e=>e.style.borderColor='');this.style.borderColor='rgba(124,92,252,0.7)'" style="flex:1;padding:18px 12px;background:rgba(124,92,252,0.08);border:2px solid rgba(124,92,252,0.25);border-radius:16px;cursor:pointer;transition:all .2s" class="_upPlan">
          <div style="font-size:11px;color:rgba(255,255,255,0.5);margin-bottom:4px">${L === 'ko' ? '월간' : 'Monthly'}</div>
          <div style="font-size:24px;font-weight:700;color:#9B7FFF">${monthlyPrice}</div>
          <div style="font-size:10px;color:rgba(255,255,255,0.35)">${L === 'ko' ? monthlyKr + '/월' : '/month'}</div>
          ${earlyBird ? `<div style="font-size:10px;color:#FFB86C;margin-top:4px;text-decoration:line-through;opacity:0.6">${L==='ko'?'9,900원':'$9.99'}</div>` : ''}
        </div>
        <div onclick="document.getElementById('_upInterval').value='yearly';document.querySelectorAll('._upPlan').forEach(e=>e.style.borderColor='');this.style.borderColor='rgba(62,207,207,0.7)'" style="flex:1;padding:18px 12px;background:rgba(62,207,207,0.08);border:2px solid rgba(62,207,207,0.35);border-radius:16px;cursor:pointer;position:relative;transition:all .2s" class="_upPlan">
          <div style="position:absolute;top:-10px;right:12px;background:linear-gradient(135deg,#3ECFCF,#4ADE80);color:#000;font-size:10px;font-weight:700;padding:3px 10px;border-radius:10px">BEST</div>
          <div style="font-size:11px;color:rgba(255,255,255,0.5);margin-bottom:4px">${L === 'ko' ? '연간' : 'Yearly'}</div>
          <div style="font-size:24px;font-weight:700;color:#3ECFCF">${yearlyPrice}</div>
          <div style="font-size:10px;color:rgba(255,255,255,0.35)">${L === 'ko' ? yearlyKr + yearlyNote : yearlyNote}</div>
          ${earlyBird ? `<div style="font-size:10px;color:#FFB86C;margin-top:4px;text-decoration:line-through;opacity:0.6">${L==='ko'?'59,900원':'$59.99'}</div>` : ''}
        </div>
      </div>
      <input type="hidden" id="_upInterval" value="monthly">
      <div style="display:flex;gap:8px;margin-bottom:16px">
        <div onclick="SUB.startCheckout(document.getElementById('_upInterval').value,'card')" style="flex:1;padding:12px 8px;background:rgba(124,92,252,0.12);border:1px solid rgba(124,92,252,0.3);border-radius:12px;cursor:pointer;text-align:center;transition:all .2s" onmouseover="this.style.borderColor='rgba(124,92,252,0.6)'" onmouseout="this.style.borderColor='rgba(124,92,252,0.3)'">
          <div style="font-size:13px;font-weight:600;color:#F0F0FF">💳 ${L === 'ko' ? '카드 결제' : 'Card'}</div>
          <div style="font-size:9px;color:rgba(255,255,255,0.35);margin-top:3px">${L === 'ko' ? '자동갱신' : 'Auto-renew'}</div>
        </div>
        <div onclick="SUB.startCheckout(document.getElementById('_upInterval').value,'easy')" style="flex:1;padding:12px 8px;background:rgba(255,180,60,0.1);border:1px solid rgba(255,180,60,0.25);border-radius:12px;cursor:pointer;text-align:center;transition:all .2s" onmouseover="this.style.borderColor='rgba(255,180,60,0.5)'" onmouseout="this.style.borderColor='rgba(255,180,60,0.25)'">
          <div style="font-size:13px;font-weight:600;color:#F0F0FF">📱 ${L === 'ko' ? '간편결제' : 'Easy Pay'}</div>
          <div style="font-size:9px;color:rgba(255,255,255,0.35);margin-top:3px">${L === 'ko' ? '카카오·네이버·토스' : 'Kakao·Naver·Toss'}</div>
        </div>
      </div>
      <div style="font-size:11px;color:rgba(255,255,255,0.3);margin-bottom:16px">${L === 'ko' ? '언제든 해지 가능 · 토스페이먼츠 안전 결제' : 'Cancel anytime · Secure Toss payment'}</div>
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
  // Fill account info
  if (!isOpen && window.APP_USER) {
    const name = document.getElementById('accountName');
    if (name) name.textContent = APP_USER.displayName || APP_USER.email || '';
    const tier = document.getElementById('accountTierLabel');
    if (tier) tier.textContent = APP_USER.tier === 'pro' ? 'Pro 플랜' : 'Free 플랜';
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
