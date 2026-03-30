/* ===== subscription.js: Feature Gating Module ===== */

const FREE_CATEGORIES = ['Divine_Tunes', 'Chakra_Activation', 'Crystal_Frequencies', 'White_Noise'];
const FREE_PRESET_LIMIT = 3;
const FREE_PLAYLIST_LIMIT = 1;

const SUB = {
  tier: 'free',       // 'free' | 'basic' | 'premium'
  status: 'none',     // 'none' | 'active' | 'past_due' | 'canceled'
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

  // Is user on a paid plan with active status?
  isPaid() {
    return (this.tier === 'basic' || this.tier === 'premium') && this.status === 'active';
  },

  // ─── Feature Gates ───

  canAccess(category) {
    if (!this.isLive()) return true;
    if (this.isPaid()) return true;
    return FREE_CATEGORIES.includes(category);
  },

  canUseBinaural() {
    if (!this.isLive()) return true;
    return this.isPaid();
  },

  canUseDualTone() {
    if (!this.isLive()) return true;
    return this.isPaid();
  },

  canUseHarmonics() {
    if (!this.isLive()) return true;
    return this.isPaid();
  },

  canExportWav() {
    if (!this.isLive()) return true;
    return this.isPaid();
  },

  canSavePreset(currentCount) {
    if (!this.isLive()) return true;
    if (this.isPaid()) return true;
    return currentCount < FREE_PRESET_LIMIT;
  },

  canCreatePlaylist(currentCount) {
    if (!this.isLive()) return true;
    if (this.isPaid()) return true;
    return currentCount < FREE_PLAYLIST_LIMIT;
  },

  canUseAkashic() {
    if (!this.isLive()) return true;
    return this.isPaid();
  },

  canUseBioFeedback() {
    if (!this.isLive()) return true;
    return this.tier === 'premium' && this.status === 'active';
  },

  // ─── Upgrade Prompt ───

  showUpgradePrompt(featureName) {
    if (typeof window.showUpgradeModal === 'function') {
      window.showUpgradeModal(featureName);
    } else {
      const msg = (typeof LANG !== 'undefined' && LANG === 'en')
        ? `This feature requires a Basic membership.\nUpgrade to unlock all features!`
        : `이 기능은 Basic 멤버십이 필요합니다.\n모든 기능을 잠금 해제하려면 업그레이드하세요!`;
      alert(msg);
    }
  },

  // ─── Checkout ───

  async startCheckout(interval) {
    // interval: 'monthly' | 'yearly'
    try {
      const res = await fetch('/api/subscription/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interval }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        console.error('[SUB] checkout failed:', data);
      }
    } catch (e) {
      console.error('[SUB] checkout error:', e);
    }
  },

  async openPortal() {
    try {
      const res = await fetch('/api/subscription/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (e) {
      console.error('[SUB] portal error:', e);
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
