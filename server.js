import express from 'express';
import compression from 'compression';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 10000;

app.use(compression());

// ✅ /landing 은 landing 폴더 정적 서빙
app.use(
  '/landing',
  express.static(path.join(__dirname, 'public', 'landing'), { extensions: ['html'] })
);

// ✅ 호스트별 홈(/) 분기
app.get('/', (req, res) => {
  const host = (req.headers.host || '').split(':')[0].toLowerCase();

  // 5do.app 으로 들어오면 앱 홈
  if (host === '5do.app' || host === 'www.5do.app') {
    return res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }

  // 그 외(5do.co.kr 등) 는 랜딩 홈
  return res.sendFile(path.join(__dirname, 'public', 'landing', 'index.html'));
});

// 기존 public 정적 서빙(앱 리소스)
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

app.get('/healthz', (_req, res) => res.status(200).send('ok'));

// SPA fallback
app.get('*', (req, res, next) => {
  // 정적 파일이면 next()
  if (req.path.match(/\.(js|css|png|jpg|jpeg|webp|svg|ico|mp3|wav|ogg|m4a|json)$/i)) return next();

  const host = (req.headers.host || '').split(':')[0].toLowerCase();

  // 5do.app 은 앱으로 fallback
  if (host === '5do.app' || host === 'www.5do.app') {
    return res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }

  // 5do.co.kr 은 랜딩으로 fallback (원하면 여기서 landing이 아닌 앱으로 보내도 됨)
  return res.sendFile(path.join(__dirname, 'public', 'landing', 'index.html'));
});

app.listen(PORT, () => console.log(`5DIO server http://localhost:${PORT}`));
