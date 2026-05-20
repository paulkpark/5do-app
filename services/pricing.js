/* services/pricing.js — server-side source of truth for Pro plan pricing.
 *
 * Reason this exists: clients send `amount` and `orderName` in Toss successUrl
 * query strings, but those values cannot be trusted — a tampered redirect
 * could otherwise charge the user's billing key for ₩900 when they thought
 * they were paying ₩69,000. The server derives both values from `interval`
 * alone, ignoring whatever the client claimed.
 *
 * Keep prices and FREE_TRIAL_END_ISO in sync with public/js/subscription.js.
 */

export const FREE_TRIAL_END_ISO = '2026-05-29T00:00:00+09:00';

const PRICES = {
  monthly: { early: 6900,  full: 9900,  label: '월간' },
  yearly:  { early: 69000, full: 99000, label: '연간' },
};

export function isEarlyBird(now = new Date()) {
  return now < new Date(FREE_TRIAL_END_ISO);
}

export function computeProPrice(interval, now = new Date()) {
  const row = PRICES[interval];
  if (!row) throw new Error('invalid interval: ' + interval);
  const eb = isEarlyBird(now);
  return {
    amount: eb ? row.early : row.full,
    orderName: eb
      ? `5DO Pro ${row.label} (얼리버드 30% 할인)`
      : `5DO Pro ${row.label}`,
  };
}

// Mirrors the client-side formula in public/js/subscription.js:
//   'cust_' + user.id.replace(/-/g, '').substring(0, 20)
// Used to verify that the customerKey Toss hands back matches the userId
// claimed in the success-callback URL, so a tampered userId can't redirect
// the Pro entitlement to a different account.
export function customerKeyFor(userId) {
  if (!userId || typeof userId !== 'string') {
    throw new Error('userId required');
  }
  return 'cust_' + userId.replace(/-/g, '').substring(0, 20);
}
