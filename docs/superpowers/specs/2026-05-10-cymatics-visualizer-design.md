# Cymatics WebGL Visualizer — Design

**Date:** 2026-05-10
**Status:** Approved (brainstorming session, awaiting implementation plan)
**Repo:** 5do-app
**Target:** Track player (`libPlayerView`)

## Summary

Add a toggle-able WebGL Cymatics visualizer to the 5DO track player. Replaces the thumbnail in the small player view when enabled, expands to full-screen on demand. Drives 4 distinct cymatics-inspired patterns (Chladni, Mandala, Liquid, Particle) from pre-baked FFT sidecar files so the experience is identical across iOS, Android, and desktop without breaking iOS native background playback.

## Goals

- Visually represent each track's frequency content as a dynamic, healing-aesthetic visual
- Work uniformly across iOS, Android, desktop (no platform-degraded UX)
- Preserve iOS background playback, lock screen controls, AirPlay, CarPlay (do not introduce Web Audio routing on the main player)
- Curate visual identity per track (track creators specify intended pattern via metadata)
- Allow user override of pattern style and remember user preferences
- Performance: 60 fps on iPhone 12+ / mid-range Android; auto-degrade to 30 fps below

## Non-Goals

- Real-time FFT analysis on iOS (deferred; not necessary given sidecar approach)
- Per-frequency precision matching the audio (cymatics is impressionistic)
- 3D camera, raymarching, or compute shader effects
- A "Vivid Mode" toggle (color cycling is always on by default)
- Editor for users to tune visualizer parameters

## Confirmed Brainstorm Decisions

| Topic | Decision |
|---|---|
| Pattern set | All 4 supported: Chladni nodal grid, Mandala bloom, Liquid plate, Particle vortex |
| Audio→Visual data path | Pre-baked FFT sidecar JSON files; **no Web Audio routing on main player** |
| Small-mode layout | Cymatics canvas replaces thumbnail; side spectrums (`vizLeft`/`vizRight`) remain visible |
| Pattern selection | Hybrid — track-level `cymatics_preset` from `meta.json` (auto), user can override via Style selector |
| Subscription gating | Free in small mode; **fullscreen requires Basic+ tier** |
| Default state | ON; user enable/disable choice persisted to `localStorage` |
| Color cycling | Always-on hue rotation over per-pattern base palette |

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│ Track Player (libPlayerView)                                │
│                                                             │
│   ┌──────────────────────────────────────────────────────┐  │
│   │ thumb-viz-wrap                                       │  │
│   │  ┌────┐  ┌──────────────────────────────┐  ┌────┐    │  │
│   │  │viz │  │ thumbnail (default)  OR      │  │viz │    │  │
│   │  │Left│  │ <canvas id="cymatics">       │  │Rght│    │  │
│   │  └────┘  └──────────────────────────────┘  └────┘    │  │
│   └──────────────────────────────────────────────────────┘  │
│                                                             │
│   [⚡ Cymatics ON/OFF]   Style: [Auto ▾]   [⛶ Fullscreen]   │
└─────────────────────────────────────────────────────────────┘
```

### Data flow

```
Track plays → audio.currentTime ──┐
                                  ↓
                          fft-sidecar loader
                          (fetch <track>.fft.json,
                           parse to Float32Array,
                           lookup [frame] by t)
                                  ↓
                          32-bin FFT snapshot ──→ texture upload (1×32 RG8)
                                                    ↓
                                          fragment shader (single program)
                                          - u_mode (0..3)
                                          - u_fftTex
                                          - u_time
                                          - u_paletteBase
                                          - u_intensity
                                                    ↓
                                                <canvas>
```

### Fallback matrix (sidecar availability × platform)

| Platform | Sidecar present | Sidecar missing |
|---|---|---|
| iOS Safari | Use sidecar (primary path) | Procedural simulation: layered sine/cosine functions of `audio.currentTime` and `audio.duration` to fill the 32-bin array — match the approach used by the existing side spectrum (`5do.html:1206-1224`) for visual consistency between the two visualizers |
| Android Chrome | Use sidecar | Real-time `AnalyserNode` (existing path, preserved) |
| Desktop (Chrome/Firefox/Safari) | Use sidecar | Real-time `AnalyserNode` |
| WebGL context creation fails | n/a — toggle hidden, console warning |

Backfill plan: bake FFT sidecars for the entire existing library in batch. **Non-blocking for initial ship** — feature can launch with the fallback matrix above and library backfill can proceed afterward at its own pace.

## Components

### 1. `public/js/cymatics.js` (NEW, ~700 LOC)

Self-contained module exposing a singleton API. Loaded via `<script>` tag in `5do.html` (matches existing module convention — no bundler).

```js
window.Cymatics = {
  init(canvas, opts),           // create WebGL context, compile shaders
  attach(audioElement),          // bind to <audio> for currentTime
  loadTrack(trackUrl),           // fetch .fft.json sidecar (or fall back)
  setEnabled(bool),              // toggle on/off
  setStyle(name),                // 'auto'|'chladni'|'mandala'|'liquid'|'particle'
  enterFullscreen(),             // Fullscreen API + iOS overlay fallback
  exitFullscreen(),
  destroy()
}
```

Internals:

- **Shader program**: single fragment shader with `switch(u_mode)` over 4 patterns. Shared helpers (palette, hue rotation, bloom). Vertex shader is a trivial full-screen quad.
- **FFT texture**: 32×1 RG8 texture, updated each frame with current bins. R = magnitude, G = (reserved for smoothed running average).
- **Pattern smoothing**: temporal smoothing inside shader (mix with previous frame from a small ping-pong texture, optional).
- **Render loop**: `requestAnimationFrame`. Pauses when `audio.paused` or `document.visibilityState !== 'visible'` or canvas is `display:none`.
- **DPR cap**: `Math.min(window.devicePixelRatio, 2.0)`.
- **FPS auto-degrade**: rolling 60-frame average; if < 45 fps for 2 seconds, switch to 30 fps RAF skip mode.
- **Re-parent fullscreen**: same `<canvas>` element moved between in-player container and fullscreen overlay container on enter/exit. Single render loop.
- **Fullscreen lifecycle**: track change while in fullscreen → cymatics keeps running and seamlessly switches to new track's sidecar/preset (no auto-exit). Fullscreen exits only on user gesture (Esc, swipe-down on iOS overlay, dedicated exit button) or Fullscreen API close event.

### 2. `public/js/cymatics-fft-loader.js` (NEW, ~150 LOC)

Standalone module for fetching/parsing/sampling FFT sidecars.

```js
window.CymFFT = {
  async load(audioUrl) → { hasSidecar, sample(timeSec) → Float32Array(32) }
}
```

Logic:
- Construct sidecar URL by replacing `.mp3` extension with `.fft.json`
- HEAD request to check existence (cheap; Supabase responds 200/404 fast)
- If exists: GET, parse JSON, dequantize int8 → Float32 (0..1 range)
- If absent + on desktop/Android: connect existing `AnalyserNode` path
- If absent + on iOS: return `sample()` that produces procedural simulation based on `audio.currentTime`/`audio.duration`

`sample(t)`:
- `frame = Math.floor(t * fps)`
- Linear interpolate between `frames[frame]` and `frames[frame+1]` for smoothness

### 3. `public/5do.html` modifications

- Add `<canvas id="cymatics">` inside `.thumb-viz-wrap`, initially hidden
- Add toggle, style selector, fullscreen button DOM near player controls
- Add `<script src="js/cymatics.js">` and `<script src="js/cymatics-fft-loader.js">` after subscription.js
- Wire boot code (~30 LOC) in existing inline `<script>` block: track-change handler calls `Cymatics.loadTrack()`, toggle handler calls `Cymatics.setEnabled()`, etc.

### 4. `public/js/subscription.js` additions

```js
SUB.canUseCymaticsFullscreen = function() {
  if (!this.isLive()) return true;       // pre-launch: everyone gets full access
  return this._canUsePaid();              // Basic or Premium tier
};
```

Toggle and small-mode are not gated; only fullscreen entry checks `canUseCymaticsFullscreen()`.

### 5. `public/css/player.css` additions (~50 LOC)

- `#cymatics` sized to match thumbnail dimensions, `border-radius: 12px`
- `.thumb-viz-wrap.cymatics-active` hides `#statusThumb`, shows `#cymatics`
- `.cymatics-fullscreen-overlay` — `position: fixed; inset: 0; z-index: 999; background: #000;` (iOS Fullscreen API fallback)
- Toggle and style selector styling reuses `.gen-switch` and a new `.cym-style-chip` class

### 6. `scripts/bake-fft.js` (NEW, ~150 LOC)

Standalone Node.js CLI. Run manually as part of Track 3 production workflow, or in batch over the library.

```bash
node scripts/bake-fft.js <input.mp3> [output.fft.json]
node scripts/bake-fft.js --batch <directory>
```

Algorithm:
1. Decode audio via `ffmpeg-static` to 22050 Hz mono PCM (cymatics doesn't need full 44.1)
2. Sliding window FFT: window = 2048 samples, hop = 22050/30 ≈ 735 samples (30 fps)
3. Logarithmic binning: 32 bins log-spaced over 20 Hz – 11025 Hz (Nyquist of 22050)
4. Magnitude → log scale → normalize to 0..1 range per-track (peak-normalized)
5. Quantize to int8 (0..255), output JSON

Dependencies (devDependencies only — never shipped to client):
- `ffmpeg-static` — bundled ffmpeg binary
- `fft.js` — pure-JS FFT
- (no other new deps)

### 7. `package.json` changes

- Add `ffmpeg-static`, `fft.js` to `devDependencies`
- Add `"scripts.bake-fft": "node scripts/bake-fft.js"`

## Data Specs

### FFT sidecar JSON format

```json
{
  "version": 1,
  "fps": 30,
  "bins": 32,
  "duration": 612.5,
  "frames": [
    [12, 8, 5, 3, 2, 1, 1, 0, ...32 values],
    [13, 7, 6, 3, 2, 1, 1, 0, ...32 values],
    ...
  ]
}
```

- `version`: schema version, currently `1`
- `fps`: frames per second (always 30)
- `bins`: bin count per frame (always 32)
- `duration`: total audio duration in seconds (used by loader for sanity checks)
- `frames`: array of int8 (0..255) arrays, length `Math.ceil(duration * fps)`
- File compresses well via Supabase's gzip transfer encoding (~60–70% reduction)
- Expected size for 10 min track: ~575 KB raw, ~200 KB on the wire

### `meta.json` schema additions (optional, per-track or per-folder)

Track 3 production may add to `<Folder>/<filename.mp3>` entries:

```json
{
  "title_ko": "...",
  "...": "...",
  "cymatics_preset": "mandala"
}
```

Or to `<Folder>/_folder` for category-wide default:

```json
{
  "disclaimer_ko": "...",
  "cymatics_preset": "liquid"
}
```

Lookup precedence (highest to lowest):
1. User override (from `localStorage.cymatics_prefs.style` if not `'auto'`)
2. Track-level `cymatics_preset` in `meta.json[<Folder>/<filename>]`
3. Category-level `cymatics_preset` in `meta.json[<Folder>/_folder]`
4. Built-in default mapping by category name (table below)

#### Built-in category → pattern default mapping

| Category | Default pattern | Rationale |
|---|---|---|
| `Divine_Tunes`, `Akashic_Gateway` | mandala | Sacred / spiritual aesthetic |
| `Chakra_Activation`, `Holland_Resonance` | chladni | Geometric, energy-system feel |
| `Crystal_Frequencies`, `White_Noise` | liquid | Calm, immersive, water-like |
| `*_Activation`, beat-driven categories | particle | Dynamic, organic |
| (unmatched) | mandala | Most universally appealing |

### `localStorage.cymatics_prefs` schema

```json
{
  "enabled": true,
  "style": "auto",
  "last_used_fullscreen": false
}
```

Set on first toggle/style change. Read on player init.

## Color Palettes (per pattern, base + hue cycle)

All palettes cycle through full hue rotation every 24 s (`u_time` based, applied as final hue-shift in shader).

| Pattern | Anchor color stops |
|---|---|
| Chladni | `#7C5CFC` (violet) → `#3ECFCF` (cyan) → `#FF6B9D` (pink) |
| Mandala | `#FFB86C` (amber) → `#FF6B9D` (pink) → `#9B7FFF` (light violet) |
| Liquid | `#3ECFCF` (cyan) → `#5A3AD9` (deep violet) → `#7C5CFC` (violet) |
| Particle | `#FF6B9D` (pink) → `#FFB86C` (amber) → `#3ECFCF` (cyan) |

Background (under all): `#0A0A0F` to match app dark theme.

## Subscription Gating Specification

| Action | Gate |
|---|---|
| Toggle ON/OFF (small mode) | None — free for all |
| Style selector | None — free for all |
| Enter fullscreen | `SUB.canUseCymaticsFullscreen()` — Basic+ when `SUB.isLive()` |
| Exit fullscreen | None |

If user attempts fullscreen without entitlement: call `SUB.showUpgradePrompt('cymatics_fullscreen')`.

## Performance Budget

- Target: 60 fps on iPhone 12+, Galaxy S21+, mid-2020 desktop
- Floor: 30 fps on iPhone X, Pixel 4a, older laptops
- Auto-degrade: rolling FPS average over 60 frames; if < 45 fps for 2 seconds, switch to 30 fps via RAF frame skip
- DPR cap: `Math.min(window.devicePixelRatio, 2.0)`
- Pause render when: track paused, page hidden, canvas display:none, browser tab inactive
- Shader complexity: no raymarching, no SDF loops > 8 iterations, no readbacks, max 1 ping-pong texture for temporal smoothing

## Testing Strategy

### Manual smoke tests (per platform)

1. iPhone Safari (real device, latest iOS): play track with sidecar → verify visualizer animates; lock phone → verify audio continues
2. Android Chrome: same as above + verify real-time FFT fallback if sidecar deleted
3. Desktop Chrome: verify all 4 patterns via Style selector; verify fullscreen via API
4. iOS Safari fullscreen: verify CSS overlay fallback
5. Older iPhone (XR or older): verify auto-degrade to 30 fps

### Regression tests

- Side spectrum (`vizLeft`/`vizRight`) animates as before
- Background playback works on iOS (cymatics OFF and ON)
- AirPlay routing unchanged
- Free tier user can toggle cymatics in small mode but is gated on fullscreen
- Pre-launch: `SUB.isLive() === false` → fullscreen unrestricted

### Sidecar fallback tests

- Track with sidecar → primary path
- Track without sidecar on Android → `AnalyserNode` path
- Track without sidecar on iOS → procedural simulation
- WebGL context creation failure → toggle hidden, console warning, no errors

## Files Affected

### New

- `public/js/cymatics.js` (~700 LOC, includes inline GLSL)
- `public/js/cymatics-fft-loader.js` (~150 LOC)
- `scripts/bake-fft.js` (~150 LOC)
- `docs/superpowers/specs/2026-05-10-cymatics-visualizer-design.md` (this document)

### Modified

- `public/5do.html` (~50 LOC: canvas element, toggle UI, boot script, script tags)
- `public/js/subscription.js` (~10 LOC: `canUseCymaticsFullscreen`)
- `public/css/player.css` (~50 LOC)
- `package.json` (devDependencies, script entry)

### Optional Track 3 production additions (per track / per folder)

- `media/meta.json` — optional `cymatics_preset` field

## Out of Scope (Deferred)

- "Vivid Mode" toggle to switch off color cycling
- User-tunable shader parameters (intensity, speed)
- Custom user-uploaded patterns
- Cymatics on the generator (`gen` view) — current scope is library track player only
- Server-side automated baking (Supabase Edge Function); Track 3 manual workflow is sufficient initially
- 3D / depth-based cymatics (raymarched membrane displacement)
- Sync to YouTube videos in the akashic sub-app

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| WebGL context loss (mobile background, GPU pressure) | Listen for `webglcontextlost`; on `webglcontextrestored`, recompile shaders and resume. If unrecoverable, toggle hidden + console warning |
| iOS Safari Fullscreen API quirks | CSS overlay fallback; tested separately |
| Sidecar fetch failure (network) | Graceful fall through to platform-appropriate fallback (real-time analyser or procedural sim) |
| `meta.json` `cymatics_preset` typo | Validation: unknown preset name → log warning, fall through to category default |
| Backfill workload (existing library) | Run batch script once, distribute over off-peak hours; not blocking for ship |
| God-file growth | New code lives in `cymatics.js`; only ~50 LOC added to `5do.html` |
