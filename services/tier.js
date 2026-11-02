/* services/tier.js — pure subscription-tier evaluation.
 *
 * Reason this exists: the cancel handler in server.js promises "Keep
 * current_period_end so they can use until it expires" and the modal
 * tells users the same. The previous SUB.isPro() definition returned
 * false the instant status flipped to 'canceled', breaking that promise.
 *
 * This module is the single source of truth for "is this user Pro right
 * now". Both the client (public/js/subscription.js) and any future
 * server-side gate should agree with isProEffective().
 *
 * NOTE: public/js/subscription.js inlines the same logic in SUB.isPro()
 * because the client is served as a plain <script> tag, not ESM. Keep
 * the two in sync — the test in tests/tier.test.mjs locks the behavior.
 */

export function isProEffective(tier, status, periodEnd, now = new Date()) {
  if (tier !== 'pro') return false;
  if (status === 'active' || status === 'lifetime') return true;
  // 'canceled' keeps access until period end; 'promo' (referral bonus days for
  // a non-subscriber) behaves the same — Pro until it expires, no auto-renew.
  if ((status === 'canceled' || status === 'promo') && periodEnd) {
    return new Date(now) < new Date(periodEnd);
  }
  return false;
}

// Days an 'active' Pro subscription is past the period the customer actually
// paid for — 0 when it is fine.
//
// Why this is not just `!isProEffective(...)`: it is deliberately NOT the same
// question. isProEffective returns true for 'active' without looking at
// current_period_end, which is correct — access must not blink out because a
// renewal is a few hours late, and revoking it is a business decision, not a
// clock one. But that also means a renewal that never happens is invisible:
// the row stays 'active', the subscriber keeps everything, no charge is made
// and nobody complains. Toss renewals only run when something POSTs
// /api/toss/renew, and nothing in this repo schedules that — the first time
// anyone counted, six monthly subscribers had gone 42–132 days uncharged.
//
// So this reports the condition and changes no entitlement. Callers surface it.
export const BILLING_GRACE_DAYS = 3;

export function billingStalledDays(tier, status, periodEnd, now = new Date(), graceDays = BILLING_GRACE_DAYS) {
  if (tier !== 'pro') return 0;
  // Only 'active' can stall. 'lifetime' has no period to renew, and
  // 'canceled'/'promo'/'past_due' are *supposed* to lapse at periodEnd —
  // isProEffective already stops honoring those, so they are not silent.
  if (status !== 'active') return 0;
  // An 'active' row with no periodEnd is a manual/legacy grant with nothing to
  // charge against; there is no renewal to miss, so it is out of scope here.
  if (!periodEnd) return 0;
  const end = new Date(periodEnd);
  if (Number.isNaN(end.getTime())) return 0;
  const days = Math.floor((new Date(now) - end) / 86400000);
  return days > graceDays ? days : 0;
}
