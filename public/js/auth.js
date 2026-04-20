/* ===== auth.js: Supabase Auth + Profile Module ===== */

window.APP_USER = null; // { id, email, displayName, avatarUrl, tier, status }

// ─── Auth State Listener ───
SB.auth.onAuthStateChange(async (event, session) => {
  if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
    await _loadUserProfile(session);
    _updateAuthUI();
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
  }
});

// ─── Load User Profile + Subscription Tier ───
async function _loadUserProfile(session) {
  if (!session?.user) return;
  const u = session.user;
  try {
    const { data: profile } = await SB.from('profiles')
      .select('display_name, avatar_url, locale, tier, subscription_status, current_period_end')
      .eq('id', u.id)
      .single();

    window.APP_USER = {
      id: u.id,
      email: u.email,
      displayName: profile?.display_name || u.user_metadata?.full_name || u.email?.split('@')[0] || '',
      avatarUrl: profile?.avatar_url || u.user_metadata?.avatar_url || '',
      tier: profile?.tier || 'free',
      status: profile?.subscription_status || 'none',
      periodEnd: profile?.current_period_end,
      locale: profile?.locale || 'ko',
    };
    SUB.setTier(window.APP_USER.tier, window.APP_USER.status);
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
