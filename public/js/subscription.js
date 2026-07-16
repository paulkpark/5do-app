/* ===== subscription.js: Feature Gating Module (Free / Pro) =====

   Gate rules:
   ┌─────────────────────┬────────────────┬──────────────────┬──────────────┐
   │ Period              │ Non-member     │ Free member      │ Pro member   │
   ├─────────────────────┼────────────────┼──────────────────┼──────────────┤
   │ Now ~ May 28, 2026  │ 🔒 login req.  │ ✅ all features  │ ✅ all       │
   │ May 29, 2026 onward │ 🔒 login req.  │ 🔒 Pro required  │ ✅ all       │
   └─────────────────────┴────────────────┴──────────────────┴──────────────┘

   Post-trial Free: limited categories only (FREE_CATEGORIES), 3 presets,
   1 playlist. Everything else requires Pro.
*/

// Non-members (not logged in) can browse these categories only.
// Also displayed at the top of the library strip so the allowed set is obvious.
const NON_MEMBER_CATEGORIES = ['Chakra_Activation', 'Meditation_and_Breathwork', 'White_Noise'];

// Post-trial Free members (logged in, after May 29) limited to these categories.
// Pro-only categories (anything not in this list AND not in NON_MEMBER_CATEGORIES):
//   - Holland_Resonance — OPEF 11th-harmonic carrier × 11 pair tracks. Pro-gated by
//     omission. The category surfaces a disclaimer banner via its meta.json
//     _folder.disclaimer_* field — see public/5do.html renderStrip().
const FREE_CATEGORIES = ['Divine_Tunes', 'Chakra_Activation', 'Crystal_Frequencies', 'White_Noise'];

const FREE_PRESET_LIMIT = 3;
const FREE_PLAYLIST_LIMIT = 1;

// Expose for listRoot() sort ordering in supabase-api.js
if (typeof window !== 'undefined') {
  window.NON_MEMBER_CATEGORIES = NON_MEMBER_CATEGORIES;
}

const FREE_TRIAL_START = '2026-04-15T00:00:00+09:00';
// Extended from 2026-05-01 → 2026-05-29 because Toss Payments merchant
// approval is taking ~3 more weeks. Free members who sign up before this
// date still lock in the 30% early-bird lifetime discount on Pro.
const FREE_TRIAL_END   = '2026-05-29T00:00:00+09:00';   // Pro gate activates at this moment

const SUB = {
  tier: 'free',       // 'free' | 'pro'
  status: 'none',     // 'none' | 'active' | 'past_due' | 'canceled' | 'lifetime'
  _forceLive: false,  // Manual override — force Pro gate regardless of date

  // Set from auth.js after login
  setTier(tier, status) {
    this.tier = tier || 'free';
    this.status = status || 'none';
  },

  setLive(enabled) {
    this._forceLive = !!enabled;
  },

  // ─── Period checks ───

  // Pro-gating period: Free members now need Pro to access paid features.
  // Before May 29 → false (Free trial active). After May 29 → true.
  isLive() {
    if (this._forceLive) return true;
    return new Date() >= new Date(FREE_TRIAL_END);
  },

  // Free-trial window (Apr 15 ~ May 28): logged-in Free members get full access.
  isFreeTrial() {
    if (this._forceLive) return false;
    const now = new Date();
    return now >= new Date(FREE_TRIAL_START) && now < new Date(FREE_TRIAL_END);
  },

  // Legacy: login gate is now always active (non-members blocked from paid features).
  isLoginGateLive() { return true; },

  // Is user on Pro plan with active or lifetime status?
  // Canceled users keep Pro access until current_period_end (the server's
  // cancel handler intentionally preserves periodEnd for the same reason
  // and the cancel-confirmation modal makes the same promise to users).
  // ──────────────────────────────────────────────────────────────────
  //  Keep this logic in sync with services/tier.js → isProEffective().
  //  tests/tier.test.mjs locks the expected behavior.
  // ──────────────────────────────────────────────────────────────────
  isPro() {
    if (this.tier !== 'pro') return false;
    if (this.status === 'active' || this.status === 'lifetime') return true;
    if (this.status === 'canceled') {
      const periodEnd = window.APP_USER?.periodEnd;
      if (periodEnd) return new Date() < new Date(periodEnd);
    }
    return false;
  },

  // Legacy alias
  isPaid() { return this.isPro(); },

  isLoggedIn() { return !!window.APP_USER; },

  // ─── Unified paid-feature gate ───
  // Non-member → false   |   Pro → true   |   Free trial → true   |   Post-trial Free → false
  _canUsePaid() {
    if (!this.isLoggedIn()) return false;
    if (this.isPro()) return true;
    if (this.isFreeTrial()) return true;
    return false;
  },

  // ─── Feature Gates ───

  // Category access:
  //   Non-member: limited to NON_MEMBER_CATEGORIES (Chakra / Meditation / White Noise)
  //   Pro / free-trial member: all categories
  //   Post-trial Free member: FREE_CATEGORIES only
  canAccess(category) {
    if (!this.isLoggedIn()) return NON_MEMBER_CATEGORIES.includes(category);
    if (this.isPro()) return true;
    if (this.isFreeTrial()) return true;
    return FREE_CATEGORIES.includes(category);
  },

  // Generator features (Pro only outside trial; non-members always blocked)
  canUseBinaural()  { return this._canUsePaid(); },
  canUseDualTone()  { return this._canUsePaid(); },
  canUseHarmonics() { return this._canUsePaid(); },
  canExportWav()    { return this._canUsePaid(); },

  // Presets: non-member blocked, Pro/trial unlimited, post-trial Free = 3
  canSavePreset(currentCount) {
    if (!this.isLoggedIn()) return false;
    if (this.isPro()) return true;
    if (this.isFreeTrial()) return true;
    return currentCount < FREE_PRESET_LIMIT;
  },

  // Playlists: non-member blocked, Pro/trial unlimited, post-trial Free = 1
  canCreatePlaylist(currentCount) {
    if (!this.isLoggedIn()) return false;
    if (this.isPro()) return true;
    if (this.isFreeTrial()) return true;
    return currentCount < FREE_PLAYLIST_LIMIT;
  },

  // Soul Code (Akashic AI), Guided Meditation, QTX — all paid features
  canUseSoulCode()         { return this._canUsePaid(); },
  canUseAkashic()          { return this._canUsePaid(); }, // legacy alias
  canUseGuidedMeditation() { return this._canUsePaid(); },
  canUseQTX()              { return this._canUsePaid(); },
  canUseCymaticsFullscreen() { return this._canUsePaid(); },

  // Early-bird pricing window (same as free trial currently — used by checkout for discount)
  isEarlyBird() { return this.isFreeTrial(); },

  // ─── Pricing (single source of truth, client-side) ───
  // Mirrors server-side services/pricing.js — keep amounts in sync. The server
  // is authoritative for the actual charge (see fix: derive amount from
  // interval); this helper is only for UI display.
  // Which payment provider to route this checkout through.
  //   'toss'   → domestic, charges KRW (billing-key auto-renew + easy pay)
  //   'stripe' → international, charges USD (Stripe Checkout, incl. Apple/
  //              Google Pay & PayPal)
  // Priority: explicit user override (localStorage 'payRegion') > IP-geo
  // (window.APP_REGION set by i18n detectLangByIp) > LANG fallback.
  resolveProvider() {
    try {
      const forced = localStorage.getItem('payRegion');
      if (forced === 'KR') return 'toss';
      if (forced === 'INTL') return 'stripe';
    } catch (_) {}
    const region = window.APP_REGION
      || ((typeof LANG !== 'undefined' && LANG === 'en') ? 'INTL' : 'KR');
    return region === 'INTL' ? 'stripe' : 'toss';
  },

  getPricing(interval, provider) {
    provider = provider || this.resolveProvider();
    if (provider === 'stripe') {
      // Fixed USD pricing — mirrors Stripe Price objects (source of truth for
      // the actual charge lives in the Stripe dashboard). Amount in cents.
      const cents = interval === 'yearly' ? 6990 : 699;
      return {
        provider: 'stripe',
        currency: 'USD',
        amount: cents,
        regularAmount: cents,
        earlyBird: false,
        display: '$' + (cents / 100).toFixed(2),
        orderName: interval === 'yearly' ? '5DO Pro Yearly' : '5DO Pro Monthly',
      };
    }
    const eb = this.isEarlyBird();
    if (interval === 'yearly') {
      return {
        provider: 'toss',
        currency: 'KRW',
        amount: eb ? 69000 : 99000,
        regularAmount: 99000,
        earlyBird: eb,
        display: '₩' + (eb ? 69000 : 99000).toLocaleString('ko-KR'),
        orderName: eb ? '5DO Pro 연간 (얼리버드 30% 할인)' : '5DO Pro 연간',
      };
    }
    return {
      provider: 'toss',
      currency: 'KRW',
      amount: eb ? 6900 : 9900,
      regularAmount: 9900,
      earlyBird: eb,
      display: '₩' + (eb ? 6900 : 9900).toLocaleString('ko-KR'),
      orderName: eb ? '5DO Pro 월간 (얼리버드 30% 할인)' : '5DO Pro 월간',
    };
  },

  // ─── Upgrade / Login Prompt ───

  showUpgradePrompt(featureName) {
    // Non-member → prompt login first (subscribing comes after account exists)
    if (!this.isLoggedIn()) {
      if (typeof showLoginModal === 'function') {
        showLoginModal();
      } else {
        const msg = (typeof LANG !== 'undefined' && LANG === 'en')
          ? 'Please log in to use this feature.'
          : '이 기능을 사용하려면 로그인해 주세요.';
        alert(msg);
      }
      return;
    }
    // Logged-in user → Pro upgrade flow
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

  // Provider-agnostic entry point used by the upgrade modal. Routes to Toss
  // (domestic) or Stripe (international) based on resolveProvider().
  async startCheckout(interval, payMethod) {
    if (this.resolveProvider() === 'stripe') return this.startStripeCheckout(interval);
    return this.startTossCheckout(interval, payMethod);
  },

  // ─── Stripe Checkout (international, USD) ───
  async startStripeCheckout(interval) {
    const user = window.APP_USER;
    if (!user || !user.id) {
      if (typeof showLoginModal === 'function') showLoginModal();
      return;
    }
    try {
      const res = await fetch('/api/subscription/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interval, email: user.email, user_id: user.id }),
      });
      const data = await res.json();
      if (data.url) {
        // Hosted Stripe Checkout — handles card, Apple/Google Pay, PayPal, and
        // subscription auto-renewal. Entitlement is granted via the Stripe
        // webhook (checkout.session.completed), not this redirect.
        window.location.href = data.url;
      } else {
        alert(data.error || 'Checkout is not available right now.');
      }
    } catch (e) {
      console.error('[SUB] Stripe checkout error:', e);
      alert('Payment error: ' + (e.message || ''));
    }
  },

  async startTossCheckout(interval, payMethod) {
    // interval: 'monthly' | 'yearly'
    // payMethod: 'card' (default, auto-renew) | 'easy' (간편결제, one-time)
    const user = window.APP_USER;
    if (!user || !user.id) {
      if (typeof showLoginModal === 'function') showLoginModal();
      return;
    }

    try {
      const clientKey = typeof TOSS_CLIENT_KEY !== 'undefined' ? TOSS_CLIENT_KEY : window.TOSS_CLIENT_KEY;
      if (!clientKey) { alert('결제 시스템이 준비되지 않았습니다.'); return; }

      const tossPayments = TossPayments(clientKey);
      const customerKey = 'cust_' + user.id.replace(/-/g, '').substring(0, 20);
      const payment = tossPayments.payment({ customerKey: customerKey });

      // Display amount/name — the server independently recomputes both from
      // `interval` before charging, so a tampered redirect can't override.
      const { amount, orderName } = this.getPricing(interval);

      if (payMethod === 'easy') {
        // 간편결제 (일회결제) — 카카오페이/네이버페이/토스페이 등 선택 가능
        const orderId = 'order_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
        await payment.requestPayment({
          method: 'CARD',
          amount: { currency: 'KRW', value: amount },
          orderId,
          orderName: orderName,
          successUrl: window.location.origin + '/api/toss/payment-success?interval=' + interval + '&userId=' + user.id,
          failUrl: window.location.origin + '/5do.html?sub=cancel&source=toss',
          card: { useEasyPay: true },
        });
      } else {
        // 카드 자동결제 (빌링키)
        await payment.requestBillingAuth({
          method: 'CARD',
          successUrl: window.location.origin + '/api/toss/billing-success?interval=' + interval + '&amount=' + amount + '&orderName=' + encodeURIComponent(orderName) + '&userId=' + user.id,
          failUrl: window.location.origin + '/5do.html?sub=cancel&source=toss',
        });
      }
    } catch (e) {
      console.error('[SUB] Toss checkout error:', e);
      if (e.code === 'USER_CANCEL') return;
      alert('결제 오류: ' + (e.message || e.code));
    }
  },

  async openPortal() {
    // Free users → show upgrade modal
    if (!this.isPro || !this.isPro()) {
      if (typeof showUpgradeModal === 'function') showUpgradeModal('category');
      return;
    }
    const L = (typeof LANG !== 'undefined' && LANG === 'en') ? 'en' : 'ko';
    const user = window.APP_USER || {};

    // Stripe subscribers manage/cancel via the Stripe Customer Portal, which
    // owns cancellation, card updates, and invoices. Route them there instead
    // of the Toss cancel endpoint.
    if (user.tierSource === 'stripe') {
      try {
        const res = await fetch('/api/subscription/portal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: user.id || '' }),
        });
        const data = await res.json();
        if (data.url) { window.location.href = data.url; return; }
        alert(data.error || 'Portal is not available right now.');
      } catch (e) {
        console.error('[SUB] Stripe portal error:', e);
      }
      return;
    }

    // Toss subscribers → in-app cancel (keeps Pro until current_period_end).
    const msg = L === 'ko'
      ? '구독을 취소하시겠습니까?\n취소 후 현재 결제 기간이 끝날 때까지 Pro 기능을 계속 이용할 수 있습니다.'
      : 'Cancel your subscription?\nYou can continue using Pro features until the end of your current billing period.';
    if (!confirm(msg)) return;

    try {
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

// Load feature flag from Supabase (manual override for "force Pro gate on")
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

  // Log all params for debugging
  console.log('[SUB] Redirect params:', window.location.search);

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
    const errMsg = params.get('error') || params.get('message') || '';
    const code = params.get('code') || '';
    if (errMsg || code) {
      alert('결제 실패: ' + (errMsg || code));
    }
  }
}

// Auto-run on load
if (typeof window !== 'undefined') {
  window.addEventListener('load', _handleCheckoutRedirect);
}
