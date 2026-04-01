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
  // provider: 'google' | 'apple' | 'kakao'
  const { error } = await SB.auth.signInWithOAuth({
    provider,
    options: { redirectTo: window.location.origin + '/5do.html' }
  });
  if (error) console.error('[Auth] sign in error:', error);
}

// ─── Sign Out ───
async function authSignOut() {
  await SB.auth.signOut();
  window.APP_USER = null;
  SUB.setTier('free', 'none');
  _updateAuthUI();
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

  if (window.APP_USER) {
    // Logged in
    if (loginBtn) loginBtn.style.display = 'none';
    if (userBtn) userBtn.style.display = 'flex';
    if (userAvatar && window.APP_USER.avatarUrl) {
      userAvatar.src = window.APP_USER.avatarUrl;
    }
  } else {
    // Logged out — keep login button hidden until auth system is live
    if (loginBtn) loginBtn.style.display = 'none';
    if (userBtn) userBtn.style.display = 'none';
    if (accountDrop) accountDrop.style.display = 'none';
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
}
