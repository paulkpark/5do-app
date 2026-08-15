# Quantum Torus — standalone visualizer

A self-contained build of the Hopf-fibration visualizer that ships inside the
app as the `torus` cymatics style. It exists so the renderer can be evaluated
and tuned on real hardware without running the whole 5DO server.

The three renderer modules are **not** duplicated here. Both builds read them
out of `public/js/` at build time, so the standalone always runs the same code
the app ships and a look tuned here transfers with no porting pass.

## Build

Two builds, same renderer:

```bash
npm run build:torus-single   # → dist-single/index.html   (what gets deployed)
npm run build:torus          # → dist/                    (folder form, local preview)
```

`dist-single/index.html` inlines everything into one file. It is what
5dtorus.netlify.app serves, and it is also the file you can open directly from
disk — ES modules cannot be imported across `file://` URLs, but an inline
module has nothing to fetch. Both output directories are wiped on each build,
so nothing stale ever ships.

## Deploy to Netlify

**Option A — connect the repo (recommended).** `netlify.toml` at the repo root
already sets the build command (`npm run build:torus-single`) and publish
directory (`dist-single`). In the existing 5dtorus site: *Site configuration →
Build & deploy → Link repository*, pick `paulkpark/5do-app` and the working
branch. After that every push redeploys the site automatically — no manual
step, and no drag-and-drop.

This does not affect the main app. Render.com builds from `server.js` and
ignores `netlify.toml`; the Netlify build only writes `dist-single/`.

**Option B — drag and drop.** Run `npm run build:torus-single`, then drop the
`dist-single/` folder onto the site's *Deploys* tab (or
<https://app.netlify.com/drop> for a new site). That folder holds `index.html`
and `_headers` — byte for byte what the connected build would have produced.

## Local preview

Any static server works, since there is no backend:

```bash
npm run build:torus
npx serve dist          # or: cd dist && python3 -m http.server 8080
```

Opening the **folder** build's `dist/index.html` as a `file://` URL will not
work, because its ES module imports need an HTTP origin. The single-file build
has no such limitation — `dist-single/index.html` opens straight from disk.

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
