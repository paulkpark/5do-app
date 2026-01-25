import express from 'express';
import compression from 'compression';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 10000;

app.use(compression());

// ✅ 1) /landing 경로를 landing 폴더로 먼저 정적 서빙
app.use(
  '/landing',
  express.static(path.join(__dirname, 'public', 'landing'), { extensions: ['html'] })
);

// ✅ 2) 루트(/)로 오면 landing/index.html 반환
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'landing', 'index.html'));
});

// 기존 public 정적 서빙 (앱 본체)
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

app.get('/healthz', (_req, res) => res.status(200).send('ok'));

// ✅ 3) SPA fallback: 단, /landing은 여기서 제외
app.get('*', (req, res, next) => {
  // /landing으로 시작하면 위의 static 라우트가 처리해야 하므로 next()
  if (req.path.startsWith('/landing')) return next();

  // 정적 파일이면 next()
  if (req.path.match(/\.(js|css|png|jpg|jpeg|webp|svg|ico|mp3|wav|ogg|m4a|json)$/i)) return next();

  // 그 외는 기존 앱(index.html)로
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`5DIO server http://localhost:${PORT}`));
