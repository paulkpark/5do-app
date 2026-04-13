/* ===== subscription.js: Feature Gating Module (Free / Pro) ===== */

const FREE_CATEGORIES = ['Divine_Tunes', 'Chakra_Activation', 'Crystal_Frequencies', 'White_Noise'];
const FREE_PRESET_LIMIT = 3;
const FREE_PLAYLIST_LIMIT = 1;

const SUB = {
  tier: 'free',       // 'free' | 'pro'
  status: 'none',     // 'none' | 'active' | 'past_due' | 'canceled' | 'lifetime'
  _live: false,       // feature flag: subscription system is live

  // Set from auth.js after login
  setTier(tier, status) {
    this.tier = tier || 'free';
    this.status = status || 'none';
  },

  setLive(enabled) {
    this._live = !!enabled;
  },

  // Is the subscription system active? (false = pre-launch, everyone gets full access)
  isLive() {
    return this._live;
  },

  // Is user on Pro plan with active or lifetime status?
  isPro() {
    return this.tier === 'pro' && (this.status === 'active' || this.status === 'lifetime');
  },

  // Legacy alias
  isPaid() { return this.isPro(); },

  // ─── Feature Gates ───

  // Category access: Free = 4 categories, Pro = all
  canAccess(category) {
    if (!this.isLive()) return true;
    if (this.isPro()) return true;
    return FREE_CATEGORIES.includes(category);
  },

  // Generator features: Pro only
  canUseBinaural() {
    if (!this.isLive()) return true;
    return this.isPro();
  },

  canUseDualTone() {
    if (!this.isLive()) return true;
    return this.isPro();
  },

  canUseHarmonics() {
    if (!this.isLive()) return true;
    return this.isPro();
  },

  canExportWav() {
    if (!this.isLive()) return true;
    return this.isPro();
  },

  // Presets: Free = 3, Pro = unlimited
  canSavePreset(currentCount) {
    if (!this.isLive()) return true;
    if (this.isPro()) return true;
    return currentCount < FREE_PRESET_LIMIT;
  },

  // Playlists: Free = 1, Pro = unlimited
  canCreatePlaylist(currentCount) {
    if (!this.isLive()) return true;
    if (this.isPro()) return true;
    return currentCount < FREE_PLAYLIST_LIMIT;
  },

  // Soul Code (Akashic AI): Pro only
  canUseSoulCode() {
    if (!this.isLive()) return true;
    return this.isPro();
  },

  // Legacy alias
  canUseAkashic() { return this.canUseSoulCode(); },

  // Guided Meditation: Always free
  canUseGuidedMeditation() { return true; },

  // Is early bird period? (Apr 15 - Apr 30, 2026)
  isEarlyBird() {
    const now = new Date();
    return now >= new Date('2026-04-15') && now < new Date('2026-05-01');
  },

  // QTX Output Mode: Pro only
  canUseQTX() {
    if (!this.isLive()) return true;
    return this.isPro();
  },

  // ─── Upgrade Prompt ───

  showUpgradePrompt(featureName) {
    if (typeof window.showUpgradeModal === 'function') {
      window.showUpgradeModal(featureName);
    } else {
      const msg = (typeof LANG !== 'undefined' && LANG === 'en')
        ? `This feature requires 5DO Pro.\nUpgrade to unlock all features!`
        : `이 기능은 5DO Pro 멤버십이 필요합니다.\n모든 기능을 잠금 해제하려면 업그레이드하세요!`;
      alert(msg);
    }
  },

  // ─── Checkout (Toss Payments) ───

  async startCheckout(interval) {
    // interval: 'monthly' | 'yearly'
    const user = window.APP_USER;
    if (!user || !user.id) {
      // Not logged in → show login modal first
      if (typeof showLoginModal === 'function') showLoginModal();
      return;
    }

    try {
      // Initialize Toss SDK
      const clientKey = typeof TOSS_CLIENT_KEY !== 'undefined' ? TOSS_CLIENT_KEY : window.TOSS_CLIENT_KEY;
      if (!clientKey) { alert('결제 시스템이 준비되지 않았습니다.'); return; }

      const tossPayments = TossPayments(clientKey);
      const billing = tossPayments.billing();
      const customerKey = 'cust_' + user.id.replace(/-/g, '').substring(0, 20);

      // Amount based on interval + early bird
      const earlyBird = this.isEarlyBird();
      let amount, orderName;
      if (interval === 'yearly') {
        amount = earlyBird ? 69000 : 99000;
        orderName = earlyBird ? '5DO Pro 연간 (얼리버드 30% 할인)' : '5DO Pro 연간';
      } else {
        amount = earlyBird ? 6900 : 9900;
        orderName = earlyBird ? '5DO Pro 월간 (얼리버드 30% 할인)' : '5DO Pro 월간';
      }

      // Request billing auth (card registration)
      await billing.requestBillingAuth({
        method: 'CARD',
        successUrl: window.location.origin + '/api/toss/billing-success?interval=' + interval + '&amount=' + amount + '&orderName=' + encodeURIComponent(orderName) + '&userId=' + user.id,
        failUrl: window.location.origin + '/5do.html?sub=cancel',
        customerEmail: user.email || '',
        customerName: user.displayName || '',
        customerKey: customerKey,
      });
    } catch (e) {
      console.error('[SUB] Toss checkout error:', e);
      if (e.code === 'USER_CANCEL') return; // user cancelled
      alert('결제 오류: ' + (e.message || e.code));
    }
  },

  async openPortal() {
    // Free users → show upgrade modal
    if (!this.isPro || !this.isPro()) {
      if (typeof showUpgradeModal === 'function') showUpgradeModal('category');
      return;
    }
    // Pro users → show cancel UI
    const L = (typeof LANG !== 'undefined' && LANG === 'en') ? 'en' : 'ko';
    const msg = L === 'ko'
      ? '구독을 취소하시겠습니까?\n취소 후 현재 결제 기간이 끝날 때까지 Pro 기능을 계속 이용할 수 있습니다.'
      : 'Cancel your subscription?\nYou can continue using Pro features until the end of your current billing period.';
    if (!confirm(msg)) return;

    try {
      const user = window.APP_USER || {};
      const res = await fetch('/api/toss/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id || '' }),
      });
      const data = await res.json();
      if (data.ok) {
        alert(L === 'ko' ? '구독이 취소되었습니다.' : 'Subscription cancelled.');
        if (typeof _loadUserProfile === 'function') _loadUserProfile();
      } else {
        alert(data.error || 'Cancel failed');
      }
    } catch (e) {
      console.error('[SUB] cancel error:', e);
    }
  },
};

// Load feature flag from Supabase
async function _loadSubFlag() {
  try {
    const { data } = await SB.from('feature_flags').select('enabled').eq('key', 'subscription_live').single();
    if (data) SUB.setLive(data.enabled);
  } catch (e) {
    // Feature flags table may not exist yet — keep default (false)
  }
}

// Handle post-checkout redirect (?sub=success or ?sub=cancel)
function _handleCheckoutRedirect() {
  const params = new URLSearchParams(window.location.search);
  const subResult = params.get('sub');
  if (!subResult) return;

  // Clean URL
  window.history.replaceState({}, '', window.location.pathname);

  if (subResult === 'success') {
    // Refresh profile to get updated tier
    setTimeout(async () => {
      if (typeof _loadUserProfile === 'function') await _loadUserProfile();
      const msg = (typeof LANG !== 'undefined' && LANG === 'en')
        ? '🎉 Welcome to 5DO Pro! All features are now unlocked.'
        : '🎉 5DO Pro에 오신 것을 환영합니다! 모든 기능이 잠금 해제되었습니다.';
      alert(msg);
    }, 1500);
  } else if (subResult === 'cancel') {
    // User cancelled checkout — do nothing special
  }
}

// Auto-run on load
if (typeof window !== 'undefined') {
  window.addEventListener('load', _handleCheckoutRedirect);
}
