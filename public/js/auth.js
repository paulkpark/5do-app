/* ===== auth.js: Supabase Auth + Profile Module ===== */

window.APP_USER = null; // { id, email, displayName, avatarUrl, tier, status }

// ─── Auth State Listener ───
SB.auth.onAuthStateChange(async (event, session) => {
  if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
    await _loadUserProfile(session);
    _updateAuthUI();
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

// ─── Announcement Banner ───
async function _loadAnnouncement() {
  try {
    const { data } = await SB.from('feature_flags')
      .select('metadata').eq('key', 'announcement').single();
    if (!data?.metadata) return;
    const meta = data.metadata;
    const L = (typeof LANG !== 'undefined' && LANG === 'en') ? 'en' : 'ko';
    const msg = L === 'ko' ? (meta.text_ko || meta.text || '') : (meta.text_en || meta.text || '');
    if (!msg) return;

    // Check dismiss: skip if user dismissed this message
    const dismissKey = 'announce_dismissed_' + btoa(msg).slice(0, 16);
    if (localStorage.getItem(dismissKey)) return;

    const banner = document.getElementById('announceBanner');
    const textEl = document.getElementById('announceText');
    if (banner && textEl) {
      textEl.textContent = msg;
      if (meta.url) banner.dataset.url = meta.url;
      banner.style.display = 'block';
      banner.dataset.dismissKey = dismissKey;
    }
  } catch (e) { /* silent */ }
}

function dismissAnnounce() {
  const banner = document.getElementById('announceBanner');
  if (banner) {
    banner.style.display = 'none';
    if (banner.dataset.dismissKey) localStorage.setItem(banner.dataset.dismissKey, '1');
  }
}

// ─── Init: check existing session ───
async function initAuth() {
  await _loadSubFlag();
  const { data: { session } } = await SB.auth.getSession();
  if (session) {
    await _loadUserProfile(session);
  }
  _updateAuthUI();
  _loadAnnouncement();
}
