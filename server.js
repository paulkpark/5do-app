import express from 'express';
import akashicFrequency from "./akashic-frequency/api.js";
import compression from 'compression';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 10000;

app.use(compression());
app.use("/akashic-frequency", akashicFrequency);

// ✅ 0) /assets 를 루트 assets 폴더로 정적 서빙 (banners + nav + nav html/images)
app.use('/assets', express.static(path.join(__dirname, 'assets'), { extensions: ['html'] }));

// ✅ 1) /landing 정적 서빙
app.use('/landing', express.static(path.join(__dirname, 'public', 'landing'), { extensions: ['html'] }));

// ✅ 2) 호스트별 홈(/) 분기: 5do.app = 앱, 5do.co.kr = 랜딩
app.get('/', (req, res) => {
  const host = (req.headers.host || '').split(':')[0].toLowerCase();
  if (host === '5do.app' || host === 'www.5do.app') {
    return res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
  return res.sendFile(path.join(__dirname, 'public', 'landing', 'index.html'));
});

// 기존 public 정적 서빙(앱 파일들)
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

app.get('/healthz', (_req, res) => res.status(200).send('ok'));

// SPA fallback
app.get('*', (req, res, next) => {
  // 정적 리소스면 next()
  if (req.path.match(/\.(js|css|png|jpg|jpeg|gif|webp|avif|svg|ico|mp3|wav|ogg|m4a|mp4|webm|json|txt|xml|woff|woff2|ttf|otf)$/i))
    return next();

  const host = (req.headers.host || '').split(':')[0].toLowerCase();

  // 5do.app 은 앱으로 fallback
  if (host === '5do.app' || host === 'www.5do.app') {
    return res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }

  // 5do.co.kr 은 랜딩으로 fallback
  return res.sendFile(path.join(__dirname, 'public', 'landing', 'index.html'));
});

app.listen(PORT, () => console.log(`5DIO server http://localhost:${PORT}`));
