/* ===== auth.js: Supabase Auth + Profile Module ===== */

window.APP_USER = null; // { id, email, displayName, avatarUrl, tier, status }

// Capture a referral code from ?ref= and keep it until the user signs up, at
// which point _maybeAttributeReferral() binds it. See server /api/referral/*.
(function captureReferral() {
  try {
    var ref = new URLSearchParams(location.search).get('ref');
    if (ref) localStorage.setItem('5do_ref', ref.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8));
  } catch (_) {}
})();

// After a user is logged in, bind any stored referral code. The server only
// binds brand-new accounts (self-referral / old-account / dupe guarded), so
// calling this on every login is safe; we clear the code on a definitive result.
async function _maybeAttributeReferral() {
  var ref;
  try { ref = localStorage.getItem('5do_ref'); } catch (_) {}
  if (!ref || !window.APP_USER || !window.APP_USER.id) return;
  try {
    const res = await fetch('/api/referral/attribute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: window.APP_USER.id, ref_code: ref }),
    });
    const data = await res.json();
    if (data.ok || ['already_attributed', 'account_too_old', 'self', 'invalid_code'].indexOf(data.reason) !== -1) {
      try { localStorage.removeItem('5do_ref'); } catch (_) {}
    }
  } catch (_) {}
}

// Start the 72h free trial once for free users (server stamps trial_started_at
// if null, authoritative & non-resettable). Then refresh SUB + the trial UI.
async function _maybeStartTrial() {
  const u = window.APP_USER;
  if (!u || !u.id) return;
  if (SUB.isPro && SUB.isPro()) return;   // paid users don't get a trial clock
  try {
    if (!u.trialStart) {
      const res = await fetch('/api/trial/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: u.id }),
      });
      const data = await res.json();
      if (data && data.trial_started_at) {
        u.trialStart = data.trial_started_at;
        SUB.setTrialStart(data.trial_started_at);
      }
    }
  } catch (_) {}
  // Let the app react (banner / expiry modal / re-render gated UI).
  try { if (typeof window.onTrialResolved === 'function') window.onTrialResolved(); } catch (_) {}
}

// ─── Keep-Logged-In: active session refresh ───
// Supabase auto-refreshes the JWT (default 1h) while the page is open,
// but it can't refresh during a closed tab. If the refresh token expires
// during a long idle period, the user comes back signed out. When the
// "Keep me signed in" toggle is on, we run an extra refresh every 30 min
// while the tab is open so the refresh-token clock keeps resetting.
const _KEEPALIVE_MS = 30 * 60 * 1000;
let _keepaliveTimer = null;
function _startKeepalive() {
  if (_keepaliveTimer) return;
  _keepaliveTimer = setInterval(async () => {
    const keep = (localStorage.getItem('auth_keep_logged_in') ?? '1') !== '0';
    if (!keep || !window.APP_USER) return;
    try { await SB.auth.refreshSession(); }
    catch (e) { console.warn('[Auth] keepalive refresh failed:', e?.message || e); }
  }, _KEEPALIVE_MS);
}
function _stopKeepalive() {
  if (_keepaliveTimer) { clearInterval(_keepaliveTimer); _keepaliveTimer = null; }
}

// ─── Auth State Listener ───
SB.auth.onAuthStateChange(async (event, session) => {
  if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
    await _loadUserProfile(session);
    _updateAuthUI();
    _startKeepalive();
    // Send welcome email on first login
    if (event === 'SIGNED_IN' && session?.user?.id) {
      const welcomeKey = 'welcome_sent_' + session.user.id;
      if (!localStorage.getItem(welcomeKey)) {
        localStorage.setItem(welcomeKey, '1');
        fetch('/api/email/welcome', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: session.user.id }),
        }).catch(() => {});
      }
    }
  } else if (event === 'SIGNED_OUT') {
    window.APP_USER = null;
    SUB.setTier('free', 'none');
    _updateAuthUI();
    _stopKeepalive();
  }
});

// ─── Load User Profile + Subscription Tier ───
async function _loadUserProfile(session) {
  if (!session?.user) return;
  const u = session.user;
  try {
    const { data: profile } = await SB.from('profiles')
      .select('display_name, avatar_url, locale, tier, tier_source, subscription_status, current_period_end, trial_started_at')
      .eq('id', u.id)
      .single();

    window.APP_USER = {
      id: u.id,
      email: u.email,
      displayName: profile?.display_name || u.user_metadata?.full_name || u.email?.split('@')[0] || '',
      avatarUrl: profile?.avatar_url || u.user_metadata?.avatar_url || '',
      tier: profile?.tier || 'free',
      // Which payment provider owns this subscription — routes cancel/portal
      // in SUB.openPortal(). 'toss' | 'stripe' | 'admin' | null.
      tierSource: profile?.tier_source || null,
      status: profile?.subscription_status || 'none',
      periodEnd: profile?.current_period_end,
      trialStart: profile?.trial_started_at || null,
      locale: profile?.locale || 'ko',
    };
    SUB.setTier(window.APP_USER.tier, window.APP_USER.status);
    SUB.setTrialStart(window.APP_USER.trialStart);
    _maybeStartTrial();       // stamp the 72h trial once for free users
    _maybeAttributeReferral();
  } catch (e) {
    console.warn('[Auth] profile load failed:', e);
    window.APP_USER = {
      id: u.id, email: u.email,
      displayName: u.user_metadata?.full_name || u.email?.split('@')[0] || '',
      avatarUrl: u.user_metadata?.avatar_url || '',
      tier: 'free', status: 'none',
    };
    SUB.setTier('free', 'none');
  }
  // The library strip may have rendered with the wrong lock state because
  // SUB.canAccess was called before the profile resolved (cold-start race).
  // Trigger a re-render now that APP_USER + SUB.tier are correct.
  if (typeof window.refreshLibraryStrip === 'function') {
    try { window.refreshLibraryStrip(); } catch (_) {}
  }
}

// ─── Sign In ───
async function authSignIn(provider) {
  // provider: 'google' | 'kakao'
  const opts = { redirectTo: window.location.origin + '/5do.html' };
  if (provider === 'kakao') {
    opts.scopes = 'profile_nickname profile_image';
  }
  const { error } = await SB.auth.signInWithOAuth({ provider, options: opts });
  if (error) console.error('[Auth] sign in error:', error);
}

// ─── Email Magic Link Login ───
async function authEmailLogin() {
  const emailInput = document.getElementById('loginEmail');
  const msgEl = document.getElementById('loginEmailMsg');
  const btn = document.getElementById('loginEmailBtn');
  const email = emailInput?.value?.trim();
  if (!email) { emailInput.focus(); return; }

  btn.disabled = true;
  btn.style.opacity = '0.5';
  const { error } = await SB.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin + '/5do.html' }
  });
  btn.disabled = false;
  btn.style.opacity = '1';

  if (error) {
    if (msgEl) { msgEl.textContent = error.message; msgEl.style.color = '#F87171'; msgEl.style.display = 'block'; }
  } else {
    if (msgEl) {
      const L = (typeof LANG !== 'undefined' && LANG === 'en') ? 'en' : 'ko';
      msgEl.textContent = L === 'ko' ? '로그인 링크가 이메일로 전송되었습니다!' : 'Login link sent to your email!';
      msgEl.style.color = '#4ADE80';
      msgEl.style.display = 'block';
    }
  }
}

// ─── Email + Password Login ───
// Co-exists with the magic-link flow. Same email field, expandable
// password section in the login modal. Required for review accounts
// (e.g., Toss Payments app review) where reviewers can't access an
// inbox to click a magic link.
async function authEmailPasswordLogin() {
  const email = document.getElementById('loginEmail')?.value?.trim();
  const pw = document.getElementById('loginPassword')?.value;
  const msgEl = document.getElementById('loginPwMsg');
  const L = (typeof LANG !== 'undefined' && LANG === 'en') ? 'en' : 'ko';
  const showErr = (txt) => {
    if (!msgEl) return;
    msgEl.textContent = txt;
    msgEl.style.color = '#F87171';
    msgEl.style.display = 'block';
  };
  if (!email || !pw) {
    showErr(L === 'ko' ? '이메일과 비밀번호를 입력하세요' : 'Email and password required');
    return;
  }
  // Persist "keep me signed in" preference before the auth round-trip so the
  // keepalive interval picks it up on the SIGNED_IN event.
  const keep = document.getElementById('keepLoggedIn');
  if (keep) localStorage.setItem('auth_keep_logged_in', keep.checked ? '1' : '0');
  const btn = document.getElementById('loginPwBtn');
  if (btn) { btn.disabled = true; btn.style.opacity = '0.5'; }
  const { error } = await SB.auth.signInWithPassword({ email, password: pw });
  if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
  if (error) {
    let m = error.message;
    if (/Invalid login credentials/i.test(m))
      m = L === 'ko' ? '이메일 또는 비밀번호가 잘못되었습니다' : 'Invalid email or password';
    else if (/not confirmed|Email not confirmed/i.test(m))
      m = L === 'ko' ? '이메일 확인이 필요합니다 (받은 메일의 링크 클릭)' : 'Please confirm your email first';
    showErr(m);
  } else {
    document.getElementById('loginModal')?.style.setProperty('display', 'none');
  }
}

async function authEmailSignup() {
  const email = document.getElementById('loginEmail')?.value?.trim();
  const pw = document.getElementById('loginPassword')?.value;
  const msgEl = document.getElementById('loginPwMsg');
  const L = (typeof LANG !== 'undefined' && LANG === 'en') ? 'en' : 'ko';
  const showMsg = (txt, color) => {
    if (!msgEl) return;
    msgEl.textContent = txt;
    msgEl.style.color = color;
    msgEl.style.display = 'block';
  };
  if (!email || !pw || pw.length < 6) {
    showMsg(L === 'ko' ? '비밀번호는 6자 이상이어야 합니다' : 'Password must be 6+ characters', '#F87171');
    return;
  }
  const keep = document.getElementById('keepLoggedIn');
  if (keep) localStorage.setItem('auth_keep_logged_in', keep.checked ? '1' : '0');
  const btn = document.getElementById('signupBtn');
  if (btn) { btn.disabled = true; btn.style.opacity = '0.5'; }
  const { data, error } = await SB.auth.signUp({
    email, password: pw,
    options: { emailRedirectTo: window.location.origin + '/5do.html' },
  });
  if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
  if (error) {
    showMsg(error.message, '#F87171');
    return;
  }
  // Already-registered email: with email-enumeration protection on, Supabase
  // does NOT error — it returns a decoy user with an EMPTY identities array
  // and sends no email. Without this check the user is told "confirmation
  // email sent" and waits forever for a mail that never comes (often the
  // email belongs to an OAuth-only account, e.g. Google sign-in).
  if (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    showMsg(
      L === 'ko'
        ? '이미 가입된 이메일입니다. Google 로그인 또는 비밀번호 찾기를 이용하세요.'
        : 'This email is already registered. Use Google sign-in or reset your password.',
      '#FBBF24',
    );
    return;
  }
  // If session is returned, Supabase has "Confirm email" disabled and the
  // user is signed in immediately. Otherwise a confirmation email was sent
  // and they must click it before signInWithPassword will work.
  if (data?.session) {
    document.getElementById('loginModal')?.style.setProperty('display', 'none');
  } else {
    showMsg(
      L === 'ko'
        ? '확인 메일을 보냈습니다. 메일의 링크를 클릭한 뒤 비밀번호로 다시 로그인하세요.'
        : 'Confirmation email sent. Click the link, then sign in again.',
      '#4ADE80',
    );
  }
}

// Toggle visibility of the password section in the login modal.
function _togglePasswordSection() {
  const sec = document.getElementById('loginPwSection');
  const tog = document.getElementById('loginPwToggle');
  if (!sec || !tog) return;
  const open = sec.style.display !== 'none';
  sec.style.display = open ? 'none' : 'block';
  // Flip the chevron
  tog.querySelector('.chev')?.style.setProperty(
    'transform', open ? 'rotate(0deg)' : 'rotate(180deg)',
  );
  if (!open) document.getElementById('loginPassword')?.focus();
}


// ─── Sign Out ───
async function authSignOut() {
  try {
    await SB.auth.signOut();
  } catch (e) {
    console.error('[Auth] sign out error:', e);
  }
  window.APP_USER = null;
  SUB.setTier('free', 'none');
  _updateAuthUI();
  // Close menus
  const menuDrop = document.getElementById('menuDrop');
  if (menuDrop) menuDrop.style.display = 'none';
  const accountDrop = document.getElementById('accountDrop');
  if (accountDrop) accountDrop.style.display = 'none';
}

// ─── Get Current User ───
function getUser() {
  return window.APP_USER;
}

// ─── Update Header UI ───
function _updateAuthUI() {
  const loginBtn = document.getElementById('authLoginBtn');
  const userBtn = document.getElementById('authUserBtn');
  const userAvatar = document.getElementById('authUserAvatar');
  const accountDrop = document.getElementById('accountDrop');

  const menuLogout = document.getElementById('menuLogout');
  if (window.APP_USER) {
    // Logged in
    if (loginBtn) loginBtn.style.display = 'none';
    if (userBtn) userBtn.style.display = 'flex';
    if (userAvatar && window.APP_USER.avatarUrl) {
      userAvatar.src = window.APP_USER.avatarUrl;
    }
    if (menuLogout) menuLogout.style.display = 'block';
  } else {
    // Logged out — show login button
    if (loginBtn) loginBtn.style.display = 'flex';
    if (userBtn) userBtn.style.display = 'none';
    if (accountDrop) accountDrop.style.display = 'none';
    if (menuLogout) menuLogout.style.display = 'none';
  }
}

// ─── Notification Bell ───
let _notiData = null;

async function _loadAnnouncement() {
  try {
    const { data, error } = await SB.from('feature_flags')
      .select('metadata').eq('key', 'announcement').maybeSingle();
    if (error || !data?.metadata) return;
    const meta = data.metadata;
    const L = (typeof LANG !== 'undefined' && LANG === 'en') ? 'en' : 'ko';
    const msg = L === 'ko' ? (meta.text_ko || meta.text || '') : (meta.text_en || meta.text || '');
    if (!msg) return;

    _notiData = { msg, url: meta.url || '' };
    const bell = document.getElementById('notiBell');
    const badge = document.getElementById('notiBadge');
    if (bell) bell.style.display = 'flex';

    // Show badge if not yet read
    const readKey = 'noti_read_' + btoa(unescape(encodeURIComponent(msg))).slice(0, 16);
    if (badge && !localStorage.getItem(readKey)) badge.style.display = 'block';
    if (bell) bell.dataset.readKey = readKey;
  } catch (e) { console.warn('[Noti] load error:', e); }
}

function showNotiModal() {
  if (!_notiData) return;

  // Mark as read
  const bell = document.getElementById('notiBell');
  const badge = document.getElementById('notiBadge');
  if (badge) badge.style.display = 'none';
  if (bell?.dataset.readKey) localStorage.setItem(bell.dataset.readKey, '1');

  let m = document.getElementById('notiModal');
  if (m) m.remove();

  const L = (typeof LANG !== 'undefined' && LANG === 'en') ? 'en' : 'ko';
  m = document.createElement('div');
  m.id = 'notiModal';
  m.style.cssText = 'display:flex;position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:9999;align-items:center;justify-content:center';
  m.innerHTML = `
    <div style="background:#1a1e2e;border-radius:20px;padding:28px 24px;width:min(340px,88vw);text-align:center;box-shadow:0 12px 40px rgba(0,0,0,0.6)">
      <div style="font-size:28px;margin-bottom:12px">🔔</div>
      <div style="font-size:15px;color:#e0f0ff;line-height:1.6;margin-bottom:16px;white-space:pre-line">${_notiData.msg}</div>
      ${_notiData.url ? `<a href="${_notiData.url}" target="_blank" style="display:inline-block;padding:10px 24px;background:linear-gradient(135deg,#7C5CFC,#5A3AD9);color:#fff;border-radius:10px;text-decoration:none;font-size:13px;font-weight:600;margin-bottom:12px">${L === 'ko' ? '자세히 보기' : 'Learn more'}</a><br>` : ''}
      <button onclick="document.getElementById('notiModal').style.display='none'" style="background:none;border:none;color:rgba(255,255,255,0.4);font-size:12px;cursor:pointer;margin-top:4px">${L === 'ko' ? '닫기' : 'Close'}</button>
    </div>`;
  document.body.appendChild(m);
  m.addEventListener('click', (e) => { if (e.target === m) m.style.display = 'none'; });
}

// ─── Init: check existing session ───
// Cold-start friendly: paint the logged-out UI immediately so the login button
// always shows up on time, then restore the session in the background. If a
// session is found, _updateAuthUI() runs a second time with the user data.
// Every awaited call has a timeout so a slow/hung IndexedDB or network never
// blocks the login button from rendering.
async function initAuth() {
  // 1) Show baseline UI (logged-out) immediately — don't wait on anything
  try { _updateAuthUI(); } catch (e) {}

  // 2) Feature flag — fire-and-forget, won't block
  Promise.race([
    _loadSubFlag(),
    new Promise(r => setTimeout(r, 3000)),
  ]).catch(() => {});

  // 3) Session restore with 6s timeout so a slow IndexedDB open can't hang
  //    the rest of the init. If it times out here, the periodic retry in
  //    5do.html will try again at 1s / 3s / 6s intervals.
  try {
    const session = await Promise.race([
      SB.auth.getSession().then(r => r?.data?.session || null),
      new Promise((_, reject) => setTimeout(() => reject(new Error('getSession timeout')), 6000)),
    ]);
    if (session) {
      await _loadUserProfile(session);
      _updateAuthUI();
    }
  } catch (e) {
    console.warn('[Auth] initial session restore failed/timeout:', e.message);
  }

  // 4) Announcement load — also non-blocking / guarded
  try { _loadAnnouncement(); } catch (e) {}
}

// Self-healing init: don't rely on the DOMContentLoaded listener at the bottom
// of 5do.html — if anything in that file errors before that line, initAuth()
// would never fire and the auth icon would silently never appear. Run it
// directly here as soon as auth.js parses, deferring until DOMContentLoaded
// only when we beat it.
if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { try { initAuth(); } catch (e) { console.warn('[Auth] init failed:', e); } }, { once: true });
  } else {
    setTimeout(() => { try { initAuth(); } catch (e) { console.warn('[Auth] init failed:', e); } }, 0);
  }
}
