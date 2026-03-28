# ✦ Akashic Frequency Engine v0.3

**5DO 아카식 공명 주파수 생성기** — AI 기반 PEMF 힐링 트랙 엔진

## 프로젝트 구조

```
akashic-frequency/
├── server.js          # Express 서버 (API 프록시 + 정적 파일 서빙)
├── public/
│   └── index.html     # 프론트엔드 (React SPA, 단일 파일)
├── package.json
├── render.yaml        # Render.com 배포 설정
├── .env.example       # 환경변수 템플릿
└── README.md
```

## 로컬 실행

```bash
# 1. 의존성 설치
npm install

# 2. 환경변수 설정 (선택 — 없으면 폴백 모드로 동작)
cp .env.example .env
# .env 파일에 ANTHROPIC_API_KEY 입력

# 3. 실행
npm start
# → http://localhost:3000
```

## Render.com 배포

### 방법 1: GitHub 연동 (기존 5DO 리포에 추가)

1. 이 폴더를 5DO 리포의 서브디렉토리로 추가 (예: `/akashic-frequency/`)
2. Render 대시보드 → New → Web Service
3. 설정:
   - **Root Directory**: `akashic-frequency`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
4. Environment → `ANTHROPIC_API_KEY` 추가
5. Deploy

### 방법 2: 별도 서비스로 배포

1. Render 대시보드 → New → Web Service → GitHub 리포 선택
2. `render.yaml` 자동 감지됨
3. Environment → `ANTHROPIC_API_KEY` 추가
4. Deploy

## 환경변수

| 변수 | 필수 | 설명 |
|---|---|---|
| `ANTHROPIC_API_KEY` | 선택 | Claude API 키. 미설정 시 폴백 텍스트로 자동 전환 |
| `PORT` | 자동 | Render.com이 자동 할당 |

## API 엔드포인트

- `POST /api/analyze` — Claude API 프록시 (AI 분석 텍스트 생성)
- `GET /api/health` — 헬스체크

## 기능

- 점성술 + 아카식 레코드 기반 영혼 원형 분석
- 성별·혈액형·MBTI·출생지 통합 에너지 체질 분석
- 개인화 PEMF 공명 주파수 계산 및 실시간 오디오 생성
- 한/영 토글
- 바이오피드백 모니터링 UI (Preview)
- AI API 장애 시 자동 폴백 (12초 타임아웃)

---
© 2026 주식회사 스피닛 · 5D Healing
