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
