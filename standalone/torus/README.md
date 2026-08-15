# Quantum Torus — standalone visualizer

A self-contained build of the Hopf-fibration visualizer that ships inside the
app as the `torus` cymatics style. It exists so the renderer can be evaluated
and tuned on real hardware without running the whole 5DO server.

The three renderer modules are **not** duplicated here. `npm run build:torus`
copies them out of `public/js/` at build time, so the standalone always runs the
same code the app ships and a look tuned here transfers with no porting pass.

## Build

```bash
npm run build:torus     # → dist/
```

Output is fully static — no server, no API, no environment variables:

```
dist/
  index.html
  main.js
  js/torus-hopf.js      ← copied from public/js/
  js/torus-shaders.js   ← copied from public/js/
  js/torus-render.js    ← copied from public/js/
  _headers
```

## Deploy to Netlify

**Option A — connect the repo (recommended).** `netlify.toml` at the repo root
already sets the build command and publish directory. In Netlify: *Add new site
→ Import an existing project*, pick `paulkpark/5do-app`, choose the branch, and
deploy. Every push to that branch redeploys.

This does not affect the main app. Render.com builds from `server.js` and
ignores `netlify.toml`; the Netlify build only writes `dist/`.

**Option B — drag and drop.** Run `npm run build:torus` locally and drop the
`dist/` folder onto <https://app.netlify.com/drop>. No repo connection, no
account setup, good for a one-off look.

## Local preview

Any static server works, since there is no backend:

```bash
npm run build:torus
npx serve dist          # or: cd dist && python3 -m http.server 8080
```

Opening `dist/index.html` directly as a `file://` URL will **not** work — ES
modules require an HTTP origin, and the microphone requires a secure one.

## Using it

- **Audio** — *Demo* is a synthetic sweep. *Mic* drives it from live sound and
  needs HTTPS (Netlify provides it; `localhost` also counts as secure). *File*
  plays a local audio file. *Silent* shows the resting state the app displays
  between tracks.
- **Controls** — the `c` key toggles the panel, `Esc` closes it. Structure
  sliders rebuild geometry and are debounced; the rest apply live.
- **Permalink** — *Copy link* encodes every changed setting in the URL hash.
  Only non-defaults are written, so links stay short and survive later
  retuning of the defaults. Send a tuned link back and the values can be
  promoted into the app's defaults in `public/js/torus-render.js`.
- **FPS** — the readout shows the smoothed frame rate and the actual drawing
  buffer size. Watch it while dragging *Node budget* and *Recursion levels* to
  find the ceiling on a given device.

## What this harness does differently from the app

It creates its own `AudioContext` and `AnalyserNode`. The app deliberately does
not do that for the main player: connecting that `<audio>` element to an
AudioContext breaks background playback on iOS, so the app reads precomputed
FFT sidecars or falls back to a procedural spectrum there. Both paths produce
the same 32-bin `Float32Array`, so reactivity tuned here behaves the same in
the app — but do not copy this harness's audio plumbing back into it.
