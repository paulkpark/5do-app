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
  if (status === 'canceled' && periodEnd) {
    return new Date(now) < new Date(periodEnd);
  }
  return false;
}
