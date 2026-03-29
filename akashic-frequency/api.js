import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

router.use(express.static(path.join(__dirname, 'public')));

router.post('/api/analyze', express.json(), async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.json({ success: false, fallback: true });
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      signal: controller.signal,
      body: JSON.stringify({ model: req.body.model || 'claude-sonnet-4-20250514', max_tokens: req.body.max_tokens || 1000, system: req.body.system || undefined, messages: req.body.messages || [] })
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
