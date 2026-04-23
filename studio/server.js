// Karleido Studio — track-reactive animation generator
// LOCAL-ONLY: runs on the Mac mini, accessed from desktop/mobile via LAN.
// Do NOT deploy to Render.com.

require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const multer = require('multer');

const { runCapture } = require('./render/capture');
const { muxToMp4 } = require('./render/mux');
const ytOAuth = require('./youtube/oauth');
const { uploadVideo } = require('./youtube/upload');

const app = express();
const PORT = process.env.PORT || 10001;

app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/shaders', express.static(path.join(__dirname, 'shaders')));

const RENDERS_DIR = path.join(__dirname, 'renders');
if (!fs.existsSync(RENDERS_DIR)) fs.mkdirSync(RENDERS_DIR, { recursive: true });
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOADS_DIR));

// In-memory job registry. For single-user Mac mini local use, sufficient.
const jobs = new Map();

// ── API ─────────────────────────────────────────────────────────
app.get('/api/presets', (_req, res) => {
  try {
    const p = fs.readFileSync(path.join(__dirname, 'presets.json'), 'utf8');
    res.json(JSON.parse(p));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/palettes', (_req, res) => {
  try {
    const p = fs.readFileSync(path.join(__dirname, 'palettes.json'), 'utf8');
    res.json(JSON.parse(p));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Placeholder: Supabase track listing is done client-side with the JS SDK.
app.get('/api/tracks', (_req, res) => {
  res.json({ tracks: [], note: 'Listed client-side via Supabase SDK.' });
});

// ── Local audio upload ──────────────────────────────────────────
// Stores uploaded audio in /studio/uploads so Puppeteer can reach it via HTTP
// (blob URLs are browser-local and can't be opened in the headless render page).
const audioUpload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS_DIR,
    filename: (_req, file, cb) => {
      const safe = (file.originalname || 'audio')
        .replace(/[^\w가-힣一-龥\.\-]+/g, '_').slice(0, 80);
      cb(null, Date.now() + '_' + safe);
    },
  }),
  limits: { fileSize: 300 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const okMime = /^audio\//i.test(file.mimetype || '');
    const okExt  = /\.(mp3|m4a|aac|wav|flac|ogg)$/i.test(file.originalname || '');
    if (!okMime && !okExt) return cb(new Error('오디오 파일만 업로드 가능합니다'));
    cb(null, true);
  },
});

app.post('/api/upload', (req, res) => {
  audioUpload.single('audio')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file received' });
    res.json({
      filename: req.file.filename,
      url: '/uploads/' + req.file.filename,
      size: req.file.size,
      originalName: req.file.originalname,
    });
  });
});

// Quick list of uploaded files (for cleanup UI; optional use)
app.get('/api/uploads', (_req, res) => {
  try {
    const files = fs.readdirSync(UPLOADS_DIR).map(n => {
      const s = fs.statSync(path.join(UPLOADS_DIR, n));
      return { filename: n, url: '/uploads/' + n, size: s.size, mtime: s.mtimeMs };
    }).sort((a, b) => b.mtime - a.mtime);
    res.json(files);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/uploads/:filename', (req, res) => {
  try {
    const safe = path.basename(req.params.filename);
    fs.unlinkSync(path.join(UPLOADS_DIR, safe));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Render pipeline ─────────────────────────────────────────────
app.post('/api/render', async (req, res) => {
  const cfg = req.body || {};
  if (!cfg.trackUrl) return res.status(400).json({ error: 'trackUrl required' });
  if (!cfg.shaderId) return res.status(400).json({ error: 'shaderId required' });
  if (!cfg.resolution) cfg.resolution = '1920x1080';
  if (!cfg.fps) cfg.fps = 60;
  if (cfg.crf == null) cfg.crf = 18;

  // Resolve the shader filename from presets.json
  try {
    const presets = JSON.parse(fs.readFileSync(path.join(__dirname, 'presets.json'), 'utf8'));
    const p = presets.find(x => x.id === cfg.shaderId);
    if (!p) return res.status(400).json({ error: 'Unknown shaderId: ' + cfg.shaderId });
    cfg.shader = p.shader;
  } catch (e) { return res.status(500).json({ error: e.message }); }

  const jobId = 'r-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e4);
  const jobDir = path.join(RENDERS_DIR, jobId);
  fs.mkdirSync(jobDir, { recursive: true });
  // Wipe any existing capture file (defensive — jobDir is fresh anyway)
  const webmPath = path.join(jobDir, 'capture.webm');

  const job = {
    jobId, jobDir, webmPath,
    status: 'queued', phase: 'queued', progress: 0,
    createdAt: Date.now(), config: cfg, finalized: false,
  };
  jobs.set(jobId, job);

  res.json({ jobId });

  // Run asynchronously
  runJob(job).catch(err => {
    console.error(`[job:${jobId}] failed:`, err);
    job.status = 'error';
    job.error = err.message || String(err);
  });
});

async function runJob(job) {
  try {
    job.status = 'running';
    job.phase = 'starting';
    await runCapture(job.jobId, job, PORT);

    job.phase = 'encoding-mp4';
    const mp4Path = path.join(job.jobDir, 'output.mp4');
    await muxToMp4(job.webmPath, mp4Path, {
      crf: job.config.crf,
      preset: 'medium',
      audioBitrate: '320k',
    });
    job.mp4Path = mp4Path;
    job.status = 'complete';
    job.progress = 100;
    job.phase = 'done';
    console.log(`[job:${job.jobId}] complete → ${mp4Path}`);
  } catch (err) {
    throw err;
  }
}

// Accept WebM chunks from the render page (multipart/form-data).
const chunkUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });
app.post('/api/render/:id/chunk', chunkUpload.single('chunk'), (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'No job' });
  if (!req.file) return res.status(400).json({ error: 'No chunk' });
  try {
    fs.appendFileSync(job.webmPath, req.file.buffer);
    res.json({ ok: true, size: fs.statSync(job.webmPath).size });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/render/:id/finalize', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'No job' });
  job.finalized = true;
  res.json({ ok: true });
});

app.post('/api/render/:id/progress', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'No job' });
  const v = parseInt(req.query.v, 10);
  if (!isNaN(v)) job.progress = Math.min(99, v); // cap <100 until mp4 done
  res.json({ ok: true });
});

app.get('/api/render/:id/status', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'No job' });
  res.json({
    jobId: job.jobId,
    status: job.status,
    phase: job.phase,
    progress: job.progress,
    error: job.error,
    downloadUrl: job.status === 'complete' ? `/api/render/${job.jobId}/download` : null,
  });
});

app.get('/api/render/:id/download', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job || !job.mp4Path || !fs.existsSync(job.mp4Path)) {
    return res.status(404).send('MP4 not ready');
  }
  const trackName = (job.config.trackName || 'render').replace(/[^\w가-힣一-龥\-]+/g, '_').slice(0, 40);
  res.download(job.mp4Path, `karleido-${trackName}-${job.jobId}.mp4`);
});

// ── YouTube OAuth ───────────────────────────────────────────────
app.get('/api/youtube/auth/start', (_req, res) => {
  try {
    const url = ytOAuth.getAuthUrl();
    res.redirect(url);
  } catch (e) {
    res.status(500).send(
      '<h2>OAuth not configured</h2><pre>' + (e.message || e) + '</pre>'
      + '<p>Copy <code>studio/.env.example</code> → <code>studio/.env</code> and fill in your credentials, then restart the server.</p>'
    );
  }
});

app.get('/api/youtube/auth/callback', async (req, res) => {
  const { code, error } = req.query;
  if (error) return res.status(400).send('<h1>Auth denied</h1><p>' + error + '</p>');
  if (!code)  return res.status(400).send('<h1>Missing code</h1>');
  try {
    await ytOAuth.exchangeCodeForTokens(String(code));
    res.send(`<!DOCTYPE html>
<html><head><style>
  body{background:#0A0A0F;color:#F0F0FF;font-family:-apple-system,sans-serif;
       display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
  .box{text-align:center;padding:32px;max-width:420px}
  h1{background:linear-gradient(135deg,#7C5CFC,#3ECFCF);-webkit-background-clip:text;background-clip:text;color:transparent;font-size:22px}
  a{color:#9B7FFF;text-decoration:none;display:inline-block;margin-top:14px;padding:10px 20px;
    border:1px solid #2A2A45;border-radius:10px}
  a:hover{border-color:#7C5CFC}
</style></head><body>
  <div class="box">
    <h1>✓ YouTube 연결 완료</h1>
    <p style="color:#A0A0C0;line-height:1.6;margin-top:10px">
      이제 이 창을 닫고 Karleido Studio로 돌아가세요.<br>
      토큰이 저장되어 앞으로는 자동으로 업로드할 수 있어요.
    </p>
    <a href="/">스튜디오로 돌아가기</a>
  </div>
</body></html>`);
  } catch (e) {
    res.status(500).send('<h1>Token exchange failed</h1><pre>' + (e.message || e) + '</pre>');
  }
});

app.get('/api/youtube/auth/status', async (_req, res) => {
  const tokens = ytOAuth.loadTokens();
  if (!tokens) return res.json({ connected: false });
  try {
    const channel = await ytOAuth.getChannelInfo();
    res.json({ connected: !!channel, channel });
  } catch (e) {
    res.json({ connected: false, error: e.message });
  }
});

app.post('/api/youtube/auth/disconnect', (_req, res) => {
  ytOAuth.clearTokens();
  res.json({ ok: true });
});

// ── YouTube upload ──────────────────────────────────────────────
app.post('/api/youtube/upload', async (req, res) => {
  const { jobId, title, description, tags, privacyStatus, madeForKids, categoryId } = req.body || {};
  const job = jobs.get(jobId);
  if (!job || !job.mp4Path || !fs.existsSync(job.mp4Path)) {
    return res.status(404).json({ error: 'Rendered MP4 not found. Render first.' });
  }

  // If an upload is already in progress for this job, just return its state.
  if (job.yt && job.yt.status === 'uploading') {
    return res.json({ ok: true, jobId, alreadyUploading: true });
  }

  job.yt = {
    status: 'uploading',
    bytesRead: 0,
    fileSize: fs.statSync(job.mp4Path).size,
    startedAt: Date.now(),
  };

  // Respond early — client polls /status endpoint for progress.
  res.json({ ok: true, jobId });

  try {
    const result = await uploadVideo({
      filePath: job.mp4Path,
      title: title || (job.config.trackName || 'Karleido Render'),
      description: description || '',
      tags: Array.isArray(tags)
        ? tags
        : (typeof tags === 'string' ? tags.split(',').map(t => t.trim()).filter(Boolean) : []),
      privacyStatus: privacyStatus || 'private',
      madeForKids: !!madeForKids,
      categoryId: categoryId || '10',
    }, (bytesRead, fileSize) => {
      job.yt.bytesRead = bytesRead;
      if (fileSize) job.yt.fileSize = fileSize;
    });
    job.yt.status = 'complete';
    job.yt.videoId = result.id;
    job.yt.videoUrl = 'https://youtu.be/' + result.id;
    job.yt.finishedAt = Date.now();
    console.log(`[yt:${jobId}] uploaded → ${job.yt.videoUrl}`);
  } catch (e) {
    job.yt.status = 'error';
    job.yt.error = e.message || String(e);
    console.error(`[yt:${jobId}] upload failed:`, e);
  }
});

app.get('/api/youtube/upload/:jobId/status', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (!job.yt) return res.json({ status: 'idle' });
  const pct = job.yt.fileSize
    ? Math.min(100, Math.floor((job.yt.bytesRead / job.yt.fileSize) * 100))
    : 0;
  res.json({
    status: job.yt.status,
    progress: pct,
    bytesRead: job.yt.bytesRead,
    fileSize: job.yt.fileSize,
    videoId: job.yt.videoId,
    videoUrl: job.yt.videoUrl,
    error: job.yt.error,
  });
});

// ── Startup ─────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  const nets = os.networkInterfaces();
  const lanIps = [];
  Object.values(nets).forEach(arr => (arr || []).forEach(i => {
    if (i.family === 'IPv4' && !i.internal) lanIps.push(i.address);
  }));
  console.log('');
  console.log('🎨  Karleido Studio running');
  console.log(`    Local:   http://localhost:${PORT}`);
  lanIps.forEach(ip => console.log(`    LAN:     http://${ip}:${PORT}`));
  console.log('');
});
