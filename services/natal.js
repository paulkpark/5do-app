/* services/natal.js — pure helpers for the natal reading endpoint.
 *
 * Routes live in server.js (same as every other /api/* handler); this module
 * holds the parts worth testing on their own: which model a request gets, the
 * request body we send Anthropic, and the SSE filter that decides what reaches
 * the browser.
 */

// Claude 5 family. Readings are long-form prose, so the default tier is Sonnet;
// deep mode is an Opus opt-in for subscribers.
export const NATAL_MODEL = 'claude-sonnet-5';
export const NATAL_MODEL_DEEP = 'claude-opus-5';

/**
 * Body for POST /v1/messages.
 *
 * Two things the Claude 5 models reject outright, both 400s:
 *   - sampling parameters (temperature / top_p / top_k) — removed on this family
 *   - thinking.budget_tokens — replaced by adaptive thinking
 * So neither appears here. Thinking stays adaptive with its default display
 * ("omitted"): the reading is the product, the reasoning is not, and omitted
 * blocks still stream — they just carry empty text, which the SSE filter drops
 * along with everything else that is not a text delta.
 *
 * max_tokens has to cover thinking as well as the visible answer; a section runs
 * 900–1900 characters of Korean, so 8000 leaves headroom without inviting a
 * runaway.
 */
export function buildReadingRequest({ prompt, deep = false, maxTokens = 8000 }) {
  if (!prompt || typeof prompt !== 'string') throw new Error('prompt required');
  return {
    model: deep ? NATAL_MODEL_DEEP : NATAL_MODEL,
    max_tokens: maxTokens,
    stream: true,
    thinking: { type: 'adaptive' },
    messages: [{ role: 'user', content: prompt }],
  };
}

/**
 * Incremental parser over Anthropic's SSE stream.
 *
 * Returns push(chunk) -> array of events for the browser:
 *   { type: 'text',  text }              a visible text delta
 *   { type: 'done',  stopReason }        the turn ended
 *   { type: 'error', message }           the API reported an error mid-stream
 *
 * Everything else is dropped: thinking deltas, ping, block start/stop, usage.
 * Chunks split anywhere — mid-line, mid-JSON — so the tail is buffered until a
 * newline arrives rather than parsed optimistically.
 */
export function createSSEFilter() {
  let buf = '';
  return function push(chunk) {
    buf += chunk;
    const out = [];
    let nl;
    while ((nl = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith('data:')) continue;   // event:/id:/blank lines carry nothing we need
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      let ev;
      try { ev = JSON.parse(payload); } catch { continue; }
      if (ev.type === 'content_block_delta' && ev.delta && ev.delta.type === 'text_delta') {
        out.push({ type: 'text', text: ev.delta.text });
      } else if (ev.type === 'message_delta' && ev.delta && ev.delta.stop_reason) {
        out.push({ type: 'done', stopReason: ev.delta.stop_reason });
      } else if (ev.type === 'error') {
        out.push({ type: 'error', message: (ev.error && ev.error.message) || 'stream error' });
      }
    }
    return out;
  };
}
