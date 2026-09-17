/* natal/http.js — talking to the reading endpoint.
 *
 * Shared by the 5DO tab and the standalone app. `authHeaders` is the only part
 * that differs between them, so it is the only thing injected; the streaming
 * protocol below — incremental line parsing, a cache hit that answers as plain
 * JSON instead of a stream, a refusal that arrives as a normal end of turn — is
 * subtle enough that a second copy would drift within a release or two.
 */

/**
 * @param {object} o
 * @param {() => Promise<object>} o.authHeaders  Request headers including Authorization.
 *   Throws (with .code) when the caller is not signed in; the error is passed through.
 * @param {string} [o.base]  Prefix for the API paths, for a different origin.
 */
export function createReadingClient({ authHeaders, base = '' }) {
  async function sample(prompt, opts) {
    const o = opts || {};
    const res = await fetch(base + '/api/natal/reading', {
      method: 'POST',
      headers: await authHeaders(),
      signal: o.signal,
      body: JSON.stringify({
        prompt,
        deep: o.modelTier === 'complex',
        section: o.section,
        chartKey: o.chartKey,
        lang: o.lang,
        regenerate: !!o.regenerate,
      }),
    });

    // A cache hit answers as plain JSON instead of a stream, so nothing is
    // regenerated — and nothing is billed — when a saved chart is reopened.
    const ctype = res.headers.get('content-type') || '';
    if (!ctype.includes('text/event-stream')) {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const e = new Error(data.error || 'reading failed');
        e.code = data.code;                  // not_granted | chart_limit | timing_cooldown | rate_limited
        e.availableAt = data.availableAt;
        throw e;
      }
      if (o.onText) o.onText({ text: data.text || '' });
      return { text: data.text || '' };
    }

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '', text = '', failure = null;

    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith('data:')) continue;
        let ev;
        try { ev = JSON.parse(line.slice(5).trim()); } catch (_) { continue; }
        if (ev.type === 'text') {
          text += ev.text;
          if (o.onText) o.onText({ text });
        } else if (ev.type === 'error') {
          failure = new Error(ev.message || 'stream error');
        } else if (ev.type === 'done' && ev.stopReason === 'refusal') {
          // Arrives as a normal end of turn, so say so rather than showing a
          // section that just stops.
          failure = new Error('declined');
          failure.code = 'refusal';
        }
      }
    }

    // Partial text is still worth keeping: the UI shows it and offers a retry.
    if (failure) { failure.text = text; throw failure; }
    return { text };
  }

  // Sections already generated for this chart in this language. A birth chart
  // never changes, so a cached section is served forever and costs nothing.
  async function loadCached(chartKey, lang) {
    try {
      const res = await fetch(`${base}/api/natal/cache?chart_key=${encodeURIComponent(chartKey)}&lang=${encodeURIComponent(lang)}`, {
        headers: await authHeaders(),
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.sections || null;
    } catch (_) {
      return null;                            // a cache miss must never block the chart
    }
  }

  return { sample, loadCached };
}
