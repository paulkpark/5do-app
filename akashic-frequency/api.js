import express from 'express';
import { userIdFromRequest } from '../services/supabase-admin.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// The model is chosen server-side on purpose. Client JS is served cache-first by the
// service worker, so a stale bundle pinning a retired snapshot would keep failing with
// 404 not_found_error long after a deploy. req.body.model is ignored.
const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

// A single reply is well under this. The cap exists because max_tokens used to
// come straight from the caller, which turns one request into an arbitrarily
// expensive one.
const MAX_TOKENS_CEILING = 4000;

router.use(express.static(path.join(__dirname, 'public')));

// Signed-in callers only.
//
// This forwards to Anthropic on the server's key, so without a check it is a
// free Claude endpoint for anyone who finds the URL — and since the caller also
// supplies `system`, not even a 5DO-shaped one. The natal endpoint was built
// with a gate; this one predates it and was left open.
//
// Identity only, not entitlement: this route backs Soul Code and Synastry, and
// tightening who may use those is a product decision, not a security fix.
router.post('/api/analyze', express.json(), async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.json({ success: false, fallback: true });

  const userId = await userIdFromRequest(req);
  if (!userId) return res.status(401).json({ success: false, error: 'sign in required', code: 'not_granted' });
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      signal: controller.signal,
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: Math.min(Number(req.body.max_tokens) || 1000, MAX_TOKENS_CEILING),
        system: req.body.system || undefined,
        messages: req.body.messages || [],
      })
    });
    clearTimeout(timeout);
    if (!response.ok) return res.json({ success: false, fallback: true });
    const data = await response.json();
    res.json({ success: true, content: data.content });
  } catch (err) { res.json({ success: false, fallback: true }); }
});

router.get('/api/status', (req, res) => {
  res.json({ service: 'akashic-frequency', version: '0.3', apiEnabled: !!process.env.ANTHROPIC_API_KEY });
});

router.get('*', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'index.html')); });

export default router;
