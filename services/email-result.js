/* services/email-result.js — classify one resend.emails.send() outcome.
 *
 * Reason this exists as its own module: the Resend SDK RESOLVES with
 * `{ data, error }` rather than throwing. It throws only for a missing API key
 * or a failed React render — never for an API-level rejection. So a settled
 * promise whose status is 'fulfilled' is NOT a sent mail, and the admin bulk
 * sender used to count it as one:
 *
 *     results.forEach(r => r.status === 'fulfilled' ? sent++ : failed++);
 *
 * Every address Resend turned away — unverified sending domain, suppressed or
 * bounced recipient, rate limit, malformed address — was scored a success and
 * reported to the operator as such. The admin screen now shows these numbers,
 * so getting them right is the difference between a report and a reassurance.
 *
 * Pure, so tests/admin-email-recipients.test.mjs can state the contract
 * directly instead of grepping for it.
 */

export function classifySendResult(result) {
  // `result.value` must actually be there. Optional chaining alone would read a
  // missing value as "no error present" and score it sent, which is the same
  // mistake one level down: absence of a refusal is not evidence of a send.
  if (result && result.status === 'fulfilled' && result.value && !result.value.error) {
    return { ok: true, id: result.value.data?.id || null };
  }
  let error;
  if (result && result.status === 'rejected') {
    // A genuine throw: network failure, missing API key.
    error = result.reason?.message || String(result.reason ?? 'unknown error');
  } else {
    // The common case — the API answered, and the answer was no.
    error = result?.value?.error?.message || result?.value?.error?.name || 'unknown error';
  }
  return { ok: false, error };
}
