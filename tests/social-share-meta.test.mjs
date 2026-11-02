import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Months of Facebook/X promotion produced two Stripe customers, total. The
// reason was upstream of the app: https://5do.app/ serves a meta-refresh shim
// (public/index.html), social crawlers do not follow meta-refresh, and that
// shim was titled "Redirecting…" with no og:* at all. public/5do.html, the
// redirect target, had none either. The landing pages did have cards, but both
// languages shared ONE image carrying Korean text and a "5do.co.kr" stamp.
//
// Every assertion here is a thing whose loss is silent: a share card does not
// error, it just renders badly to people who then never arrive.

const read = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const shim = read('public/index.html');
const app = read('public/5do.html');
const koLanding = read('public/landing/index.html');
const enLanding = read('public/landing/en/index.html');
const server = read('server.js');

const ogTag = (html, prop) => {
  const m = html.match(new RegExp(`<meta property="og:${prop}" content="([^"]*)"`));
  return m && m[1];
};
const twTag = (html, name) => {
  const m = html.match(new RegExp(`<meta name="twitter:${name}" content="([^"]*)"`));
  return m && m[1];
};

const SHARE_PAGES = [
  ['public/index.html (the 5do.app redirect shim)', shim],
  ['public/5do.html (the app)', app],
  ['public/landing/index.html (ko)', koLanding],
  ['public/landing/en/index.html (en)', enLanding],
];

for (const [name, html] of SHARE_PAGES) {
  test(`${name} has a complete share card`, () => {
    for (const prop of ['title', 'description', 'image', 'url', 'type']) {
      assert.ok(ogTag(html, prop), `missing og:${prop}`);
    }
    assert.equal(twTag(html, 'card'), 'summary_large_image');
    assert.ok(twTag(html, 'title'), 'missing twitter:title');
    assert.ok(twTag(html, 'image'), 'missing twitter:image');
    assert.match(html, /<meta name="description" content="[^"]{40,}"/,
      'a search result with no description is a blank snippet');
  });

  test(`${name} declares image dimensions`, () => {
    // Without these the first scrape renders a small card while the crawler
    // fetches the image out of band; the large card only appears on a re-scrape.
    assert.equal(ogTag(html, 'image:width'), '1200');
    assert.equal(ogTag(html, 'image:height'), '630');
  });
}

test('the redirect shim is never titled "Redirecting"', () => {
  // This is the document scraped for the bare 5do.app domain — the URL people
  // actually paste into a post.
  const title = shim.match(/<title>([^<]*)<\/title>/)[1];
  assert.doesNotMatch(title, /redirect/i, 'the share card would be titled "Redirecting…"');
  assert.match(title, /5DO/);
});

test('each page has exactly one title element', () => {
  for (const [name, html] of SHARE_PAGES) {
    const n = (html.match(/<title>/g) || []).length;
    assert.equal(n, 1, `${name} has ${n} <title> tags (a stray one in a comment counts)`);
  }
});

test('the shim and the app it redirects to agree on the card', () => {
  // They are two documents for one destination. A reader sharing 5do.app and a
  // reader sharing 5do.app/5do.html must get the same preview.
  for (const prop of ['title', 'description', 'image', 'site_name']) {
    assert.equal(ogTag(shim, prop), ogTag(app, prop), `og:${prop} drifted between the two`);
  }
});

test('the two languages do not share one image', () => {
  // The whole defect: the English card was the Korean card.
  const ko = ogTag(koLanding, 'image');
  const en = ogTag(enLanding, 'image');
  assert.notEqual(ko, en, 'ko and en point at the same OG image again');
  assert.match(ko, /og-1200x630\.png/);
  assert.match(en, /og-en-1200x630\.png/);
  assert.equal(ogTag(app, 'image'), ogTag(shim, 'image'));
  assert.match(ogTag(app, 'image'), /og-en-1200x630\.png/,
    '5do.app is the URL that travels abroad; its card is the English one');
});

test('both OG images exist and are real PNGs of the right size', () => {
  for (const f of ['public/landing/og-1200x630.png', 'public/landing/og-en-1200x630.png']) {
    const buf = fs.readFileSync(new URL('../' + f, import.meta.url));
    assert.ok(buf.length > 10000, `${f} is suspiciously small`);
    assert.equal(buf.subarray(1, 4).toString(), 'PNG', `${f} is not a PNG`);
    // IHDR width/height are big-endian uint32 at bytes 16 and 20.
    assert.equal(buf.readUInt32BE(16), 1200, `${f} width`);
    assert.equal(buf.readUInt32BE(20), 630, `${f} height`);
  }
});

test('the English card does not advertise the Korean domain', () => {
  // The image itself stamps a domain in its corner; the generator is the only
  // place that decides which.
  const gen = read('scripts/generate-og-image.py');
  const en = gen.slice(gen.indexOf('"en": dict('));
  assert.match(en, /url="5do\.app"/);
  const ko = gen.slice(gen.indexOf('"ko": dict('), gen.indexOf('"en": dict('));
  assert.match(ko, /url="5do\.co\.kr"/);
  assert.match(gen, /og-en-1200x630\.png/);
});

test('the cache-buster matches the version the pages claim', () => {
  // Scrapers cache a card for weeks. Changing the image without bumping ?v=
  // ships nothing.
  for (const [name, html] of SHARE_PAGES) {
    const img = ogTag(html, 'image');
    assert.match(img, /\?v=4\.6$/, `${name}: stale or missing ?v= on og:image`);
    assert.equal(twTag(html, 'image'), img, `${name}: twitter:image drifted from og:image`);
  }
});

test('ko and en landings are linked to each other with hreflang', () => {
  // Two unlinked documents for the same product compete with each other in
  // search instead of being served to the right audience.
  for (const [name, html] of [['ko', koLanding], ['en', enLanding]]) {
    assert.match(html, /<link rel="canonical" href="https:\/\/[^"]+"\/>/, `${name}: no canonical`);
    assert.match(html, /hreflang="ko" href="https:\/\/5do\.co\.kr\/"/, `${name}: no ko alternate`);
    assert.match(html, /hreflang="en" href="https:\/\/5do\.co\.kr\/landing\/en\/"/, `${name}: no en alternate`);
    assert.match(html, /hreflang="x-default"/, `${name}: no x-default`);
  }
});

// ── robots.txt / sitemap.xml ──────────────────────────────────────────────
// One server answers for 5do.app, 5do.co.kr and the natal domains. A sitemap
// may only list URLs on the host that served it, so these cannot be static
// files.

test('robots.txt and sitemap.xml are served and branch on host', () => {
  assert.match(server, /app\.get\('\/robots\.txt'/);
  assert.match(server, /app\.get\('\/sitemap\.xml'/);
  assert.match(server, /function siteHost\(req\)/);
  const block = server.slice(server.indexOf('function siteHost(req)'),
                             server.indexOf('// 기존 public 정적 서빙'));
  assert.match(block, /https:\/\/5do\.app/);
  assert.match(block, /https:\/\/5do\.co\.kr/);
  // The natal domains are a separate product on this same server; they must
  // resolve to their own origin, never be handed the 5DO sitemap.
  assert.match(block, /isNatalHost\(req\)/);
  assert.match(block, /kind === 'natal'/);
  for (const route of ["app.get('/robots.txt'", "app.get('/sitemap.xml'"]) {
    const r = server.slice(server.indexOf(route), server.indexOf(route) + 300);
    assert.match(r, /siteHost\(req\)/, `${route} does not branch on host`);
  }
});

test('robots.txt keeps the admin console and the API out of the index', () => {
  const block = server.slice(server.indexOf("app.get('/robots.txt'"),
                             server.indexOf("app.get('/sitemap.xml'"));
  assert.match(block, /Disallow: \/admin\.html/);
  assert.match(block, /Disallow: \/api\//);
  assert.match(block, /Sitemap: \$\{origin\}\/sitemap\.xml/);
});

test('the sitemap routes are registered before the static catch-all', () => {
  // express.static would answer first for any real file of the same name, and
  // app.get('*') below would swallow them otherwise.
  const sitemap = server.indexOf("app.get('/sitemap.xml'");
  const statics = server.indexOf("app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }))");
  const splat = server.indexOf("app.get('*'");
  assert.ok(sitemap > -1 && statics > sitemap, 'static mount precedes the sitemap route');
  assert.ok(splat > sitemap, 'the catch-all precedes the sitemap route');
});

test('the service worker was rebuilt after 5do.html changed', () => {
  // 5do.html is precached in CORE_ASSETS, so returning visitors keep the old
  // head — including the old (absent) share card — until BUILD_ID changes.
  const sw = read('public/sw.js');
  assert.match(sw, /CORE_ASSETS[\s\S]{0,400}'\/5do\.html'/);
  const id = sw.match(/const BUILD_ID = '([^']+)'/)[1];
  assert.ok(id >= '2026-11-02-v122', `BUILD_ID ${id} predates the share-card change`);
});
