# Vendored third-party bundles

These are byte-for-byte copies of published npm artifacts, committed so the
service worker can cache them. A cross-origin `<script>` is invisible to
`sw.js` (`url.origin !== self.location.origin` returns early), so while the
Supabase bundle sat on a CDN it was re-fetched on every cold start and the app
could not boot offline at all — `5do.html` line 12 creates `SB` synchronously,
so a missing `window.supabase` killed the whole boot.

## supabase-js-2.116.0.js

- Source: `@supabase/supabase-js@2.116.0`, `dist/umd/supabase.js`
- sha256: `84ee9bf45695c1dd3ba1595b6bcfb0f09672434631351ffc8ebe9140545d5ff6`
- Verified byte-identical from both cdn.jsdelivr.net and unpkg.com.

### Upgrading

```bash
npm run vendor:supabase -- <version>
```

The script downloads from both CDNs, refuses to write unless they agree, then
prints the three places to update: the `<script>` tag in `public/5do.html`,
`CORE_ASSETS` in `public/sw.js`, and this file. `tests/vendor-supabase.test.mjs`
fails if those drift apart, so a half-finished bump cannot ship.
