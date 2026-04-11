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
      <button onclick="authSignIn('apple')" style="width:100%;padding:12px;margin-bottom:10px;border-radius:10px;border:1px solid rgba(255,255,255,0.12);background:#000;color:#fff;font-size:14px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px">
        <svg width="16" height="18" viewBox="0 0 14 17" fill="white"><path d="M13.1 13.1c-.5 1-1 1.9-1.9 2.7-.7.7-1.5 1.1-2.3 1.1-.5 0-1.2-.2-2-.5-.8-.3-1.4-.5-1.9-.5s-1.1.2-1.9.5c-.8.3-1.4.5-1.9.5C.3 16.8-.4 16 -1 15c-1.5-2.2-2.2-4.3-2.2-6.5 0-1.9.5-3.4 1.4-4.6.9-1.2 2.1-1.8 3.5-1.8.7 0 1.5.2 2.4.6.9.4 1.5.6 1.8.6.2 0 .8-.2 1.8-.7.9-.4 1.7-.6 2.3-.6 1.7.1 3 .8 3.8 2.2-1.6 1-2.3 2.3-2.3 3.9 0 1.5.5 2.7 1.6 3.7.5.5 1 .8 1.6 1.1-.1.4-.3.8-.5 1.2zM9.5 0c0 1.2-.4 2.2-1.3 3.2-.9 1-2 1.6-3.2 1.5 0-.1 0-.2 0-.4 0-1.1.5-2.3 1.3-3.2C7.2.3 8.3-.2 9.5 0z"/></svg>
        Apple
      </button>
      <button onclick="authSignIn('kakao')" style="width:100%;padding:12px;margin-bottom:10px;border-radius:10px;border:none;background:#FEE500;color:#3C1E1E;font-size:14px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="#3C1E1E"><path d="M12 3C6.48 3 2 6.36 2 10.5c0 2.67 1.76 5.02 4.41 6.38l-1.12 4.12c-.1.35.31.64.62.44l4.84-3.18c.41.04.83.07 1.25.07 5.52 0 10-3.36 10-7.5S17.52 3 12 3z"/></svg>
        KakaoTalk
      </button>
      <button onclick="document.getElementById('loginModal').style.display='none'" style="margin-top:8px;background:none;border:none;color:rgba(255,255,255,0.4);font-size:12px;cursor:pointer" id="loginClose">닫기</button>
    </div>`;
  document.body.appendChild(m);
  m.addEventListener('click', (e) => { if (e.target === m) m.style.display = 'none'; });
}

// ─── Upgrade Modal ───
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
  };
  const feat = featureLabels[featureName] || { ko: featureName, en: featureName };
  const title = L === 'ko' ? 'Basic 멤버십으로 업그레이드' : 'Upgrade to Basic';
  const desc = L === 'ko'
    ? `${feat.ko} 기능은 Basic 멤버십이 필요합니다.`
    : `${feat.en} requires a Basic membership.`;

  m = document.createElement('div');
  m.id = 'upgradeModal';
  m.style.cssText = 'display:flex;position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:9999;align-items:center;justify-content:center';
  m.innerHTML = `
    <div style="background:#1a1e2e;border-radius:20px;padding:32px 28px;width:min(360px,90vw);text-align:center;box-shadow:0 12px 40px rgba(0,0,0,0.6)">
      <div style="font-size:28px;margin-bottom:8px">✦</div>
      <div style="font-size:18px;font-weight:700;color:#e0f0ff;margin-bottom:8px">${title}</div>
      <div style="font-size:13px;color:rgba(255,255,255,0.6);margin-bottom:24px">${desc}</div>
      <div style="display:flex;gap:10px;margin-bottom:16px">
        <div onclick="SUB.startCheckout('monthly')" style="flex:1;padding:16px 12px;background:rgba(57,227,255,0.08);border:1px solid rgba(57,227,255,0.2);border-radius:14px;cursor:pointer">
          <div style="font-size:12px;color:rgba(255,255,255,0.5);margin-bottom:4px">${L === 'ko' ? '월간' : 'Monthly'}</div>
          <div style="font-size:22px;font-weight:700;color:#39e3ff">$4.99</div>
          <div style="font-size:11px;color:rgba(255,255,255,0.4)">${L === 'ko' ? '/월' : '/mo'}</div>
        </div>
        <div onclick="SUB.startCheckout('yearly')" style="flex:1;padding:16px 12px;background:rgba(127,255,212,0.08);border:2px solid rgba(127,255,212,0.3);border-radius:14px;cursor:pointer;position:relative">
          <div style="position:absolute;top:-10px;right:12px;background:#7fffd4;color:#000;font-size:10px;font-weight:700;padding:2px 8px;border-radius:8px">BEST</div>
          <div style="font-size:12px;color:rgba(255,255,255,0.5);margin-bottom:4px">${L === 'ko' ? '연간' : 'Yearly'}</div>
          <div style="font-size:22px;font-weight:700;color:#7fffd4">$39.99</div>
          <div style="font-size:11px;color:rgba(255,255,255,0.4)">${L === 'ko' ? '/년 (33% 할인)' : '/yr (33% off)'}</div>
        </div>
      </div>
      <div style="font-size:11px;color:rgba(255,255,255,0.35);margin-bottom:16px">${L === 'ko' ? '언제든 해지 가능 · 안전한 결제' : 'Cancel anytime · Secure payment'}</div>
      <button onclick="document.getElementById('upgradeModal').style.display='none'" style="background:none;border:none;color:rgba(255,255,255,0.4);font-size:12px;cursor:pointer">${L === 'ko' ? '나중에' : 'Maybe later'}</button>
    </div>`;
  document.body.appendChild(m);
  m.addEventListener('click', (e) => { if (e.target === m) m.style.display = 'none'; });

  // If not logged in, show login first
  if (!window.APP_USER) {
    m.style.display = 'none';
    showLoginModal();
  }
}
window.showUpgradeModal = showUpgradeModal;

// ─── Account Dropdown Toggle ───
function toggleAccountDrop() {
  const drop = document.getElementById('accountDrop');
  if (!drop) return;
  drop.style.display = (drop.style.display === 'block') ? 'none' : 'block';
}

// ─── Apply Language to Login/Upgrade Modals ───
function updateAuthLang() {
  const L = (typeof LANG !== 'undefined' && LANG === 'en') ? 'en' : 'ko';
  const t = document.getElementById('loginTitle');
  const s = document.getElementById('loginSub');
  const c = document.getElementById('loginClose');
  if (t) t.textContent = L === 'ko' ? '로그인' : 'Sign In';
  if (s) s.textContent = L === 'ko' ? '5DO의 모든 기능을 이용하세요' : 'Access all features of 5DO';
  if (c) c.textContent = L === 'ko' ? '닫기' : 'Close';

  // Account dropdown labels
  const tierEl = document.getElementById('accountTierLabel');
  const manageEl = document.getElementById('accountManageBtn');
  const logoutEl = document.getElementById('accountLogoutBtn');
  if (tierEl && window.APP_USER) {
    const tierName = { free: 'Free', basic: 'Basic', premium: 'Premium' }[window.APP_USER.tier] || 'Free';
    tierEl.textContent = L === 'ko' ? `${tierName} 플랜` : `${tierName} Plan`;
  }
  if (manageEl) manageEl.textContent = L === 'ko' ? '구독 관리' : 'Manage Subscription';
  if (logoutEl) logoutEl.textContent = L === 'ko' ? '로그아웃' : 'Sign Out';
}
