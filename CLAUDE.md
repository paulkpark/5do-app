# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

5DO (5th Dimensional Oscillator) — a web-based sound healing platform with healing frequency library, frequency generator, and AI-powered Akashic resonance analysis. Deployed on Render.com at 5do.app (app) and 5do.co.kr (landing page).

## Commands

```bash
npm install          # Install dependencies
npm run dev          # Start dev server (NODE_ENV=development, port 10000)
npm start            # Start production server (port 10000)
```

No build step — pure HTML/JS frontend served statically by Express.

## Architecture

### Server (server.js)

Express server with host-based routing:
- `5do.app` → `public/5do.html` (main app)
- `5do.co.kr` → `public/landing/index.html` (landing page)
- `/akashic-frequency` → sub-app router from `akashic-frequency/api.js` (Claude API proxy)
- `/api/webhooks/stripe` — Stripe webhook (raw body, before express.json())
- `/api/subscription/checkout` — Stripe checkout session
- `/api/flags` — Feature flags from Supabase

### Frontend (public/5do.html)

Single-file SPA (~4,400 lines) with inline `<script>` blocks. No framework, no build tools.

**Script load order matters:**
1. Supabase UMD (CDN) → `config.js` → inline `SB = createClient()` → `supabase-api.js`
2. `subscription.js` → `i18n.js` (defines `LANG`, `I18N`, `applyLang()`)
3. Inline `<script>` blocks (8 total, app logic)
4. `account-ui.js` → `auth.js` (loaded at end of body)

**Key globals:** `SB` (Supabase client), `LANG` ('ko'|'en'), `STATE` (app state), `SUB` (subscription gating), `APP_USER` (auth user)

### Akashic Frequency Sub-App (akashic-frequency/)

React SPA loaded via CDN (no build step). Mounted at `/akashic-frequency`. Proxies to Claude API via `POST /api/analyze`. Embedded in main app via iframe in the "Akashic AI" tab.

Key data modules (plain JS, no modules):
- `saju-data.js` — 만세력 (Korean traditional calendar) engine with 절기 solar term boundaries (1940-2060), accurate day/month/year pillar calculation
- `astro-events.js` — Meeus algorithm for moon phases + pre-computed retrogrades/eclipses (2024-2035)

### Supabase Integration

- **Storage bucket `media`**: Audio tracks, thumbnails (folder.webp/folder_e.webp for KO/EN), meta.json
- **Database tables**: `profiles`, `subscription_events`, `feature_flags` (schema in `supabase-schema.sql`)
- **Auth**: Google, Apple, Kakao OAuth (configured in Supabase dashboard)
- **Client-side**: Anon key in `public/js/config.js` (read-only storage access)
- **Server-side**: Service role key via `SUPABASE_SERVICE_ROLE_KEY` env var

### Subscription System

Feature gating via `subscription.js` with `SUB.isLive()` flag (default: false = everyone gets full access). When live:
- **Free**: Divine_Tunes, Chakra_Activation, Crystal_Frequencies, White_Noise only. No binaural/harmonics/WAV export/Akashic AI. 3 presets, 1 playlist.
- **Basic** ($4.99/mo, $39.99/yr): Full access except Bio Feedback.
- **Premium**: Basic + Bio Feedback (placeholder).

Launch activation: `UPDATE feature_flags SET enabled=true WHERE key='subscription_live'`

### CSS Architecture

Separate CSS files in `public/css/`: `base.css` (variables/resets), `layout.css` (sticky header/tabs/nav), `components.css` (cards/modals/search), `player.css` (audio player), `generator-metallic.css` (generator UI).

Sticky stack: header (z:20, top:0) → tab-bar (z:19, top:41px) → nav-row (z:18, top:81px) → searchbar (z:17, top:121px).

### Landing Pages (public/landing/)

Standalone HTML pages (no shared JS with app). KO at `/landing/index.html`, EN at `/landing/en/index.html`. Category thumbnails use Supabase URLs: `folder.webp` (KO), `folder_e.webp` (EN). Generator manual at `generator-manual.html`.

### i18n

`LANG` global ('ko'|'en'). `I18N` object in `i18n.js` with key-value pairs. DOM elements use `data-i18n` attribute. Menu content loaded from `public/texts/{key}_{ko|en}.txt`. Akashic iframe receives language via `postMessage({ type: 'setLang', lang })`.

## Environment Variables

```
SUPABASE_SERVICE_ROLE_KEY  # Server-side DB admin (never expose to client)
STRIPE_SECRET_KEY          # Stripe API
STRIPE_WEBHOOK_SECRET      # Webhook signature verification
STRIPE_PRICE_MONTHLY       # Stripe price ID for monthly plan
STRIPE_PRICE_YEARLY        # Stripe price ID for yearly plan
ANTHROPIC_API_KEY          # Claude API for Akashic analysis
```

## Key Constraints

- **iOS audio**: `<audio>.volume` is read-only on iOS. Crossfade uses Web Audio API GainNode on desktop/Android, simulation fallback on iOS. Never connect main player to AudioContext (breaks background playback).
- **Visualizer**: Hybrid — real AnalyserNode on desktop/Android, CSS simulation on iOS. Detection via `_isIOS` flag.
- **Divine_Tunes folder**: Mixer panel hidden when playing tracks from this category. BGM disabled.
- **5do.html is a god file**: ~4,400 lines. Known issue tracked in REFACTOR_PLAN.md. Avoid making it larger; prefer extracting to `/js/` modules.
- **No build step**: All frontend JS is plain ES5/ES6 loaded via `<script>` tags. Akashic sub-app uses Babel transpilation via CDN for JSX.
- **Normal/QTX dual output**: Tracks have two versions — `filename.mp3` (normal, 5kHz lowpass + compression) and `filename_qtx.mp3` (PEMF optimized). Toggle in player switches URL. `_qtx` files filtered from library listing.

## 5DO Design System (Apple HIG)

### 컬러 토큰 (Dark Theme First)
- --bg: #0A0A0F (기본 배경)
- --bg-elevated: #141420 (높은 레벨 배경)
- --bg-card: #1A1A2E (카드 배경)
- --surface: #252540 (입력필드, 비활성 요소)
- --border: #2A2A45 (구분선, 테두리)
- --primary: #7C5CFC (메인 CTA, 활성 탭, 주요 강조)
- --primary-light: #9B7FFF
- --primary-dark: #5A3AD9
- --secondary: #3ECFCF (보조 강조, 상태 라벨)
- --accent: #FF6B9D (포인트)
- --accent-warm: #FFB86C (알림, 배지)
- --success: #4ADE80
- --warning: #FBBF24
- --error: #F87171
- --text-primary: #F0F0FF
- --text-secondary: #A0A0C0
- --text-tertiary: #6B6B8D
- --glass: rgba(26, 26, 46, 0.7) (블러 오버레이)

### 타이포그래피
- Display: SF Pro Display, 32-56px, weight 800, tracking -2
- Title 1: SF Pro Display, 24px, weight 700, tracking -0.5
- Title 2: SF Pro Display, 20px, weight 700
- Title 3: SF Pro Display, 18px, weight 600
- Body: SF Pro Text, 15px, weight 400, line-height 1.5
- Caption: SF Pro Text, 12px, weight 400
- Overline: SF Mono, 11px, weight 600, tracking 1, uppercase

### 간격 체계
- Base unit: 4px (모든 간격은 4의 배수)
- Content margin: 16px
- Card padding: 16-24px
- Section gap: 32-48px
- Touch target: 최소 44x44pt

### 컴포넌트 규칙
- 버튼: Primary(gradient #7C5CFC→#5A3AD9), Secondary(solid #252540), Destructive(solid #F87171)
- 카드: border-radius 14px, 1px border, bg-card 배경
- 입력: 48px 높이, 14px radius, surface 배경
- 아이콘: Lucide 또는 SF Symbols, 20px 기본

### 네비게이션 (iOS Tab Bar)
5개 탭: Home, Explore, Akashic(중앙), Library, Profile
Player는 bottom sheet → full screen modal

### 접근성
- WCAG AA 준수 (텍스트 대비 4.5:1, UI 대비 3:1)
- Dynamic Type 지원
- VoiceOver label + hint 필수
- Reduce Motion 대응 필수

### 다국어
- 한국어/영어 토글 지원
- 레이아웃 리플로우 없이 언어 전환
