import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Permanent free preview: the first track of EVERY category plays for anyone,
// forever. Before this, a Pro category was a dead end — the row was dimmed and
// tapping it raised the paywall, so nobody outside Pro ever heard a second of
// it. The 72h trial opens everything; this is what survives the trial.
//
// The rule is one line (`index === 0`). What needs guarding is that every way
// into the player honours it, because there are five of them: the track row,
// prev/next (incl. the swipe), search, favourites and playlists. A single
// ungated path hands out the whole category.

const root = new URL('../', import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, root), 'utf8');

// subscription.js is a browser script with no exports: `const SUB = {...}`.
// Everything that touches window/document sits inside a function or behind a
// typeof guard, so it evaluates in node as-is and we can test real behaviour
// rather than grep for the source of it.
function loadSUB(win) {
  // The window has to exist BEFORE the script evaluates: its last line is a
  // `typeof window !== 'undefined'` guard around addEventListener, so a bare
  // object left over from a previous test passes the guard and then throws.
  globalThis.window = Object.assign({ addEventListener() {} }, win || {});
  const src = read('public/js/subscription.js');
  return new Function(`${src}\n;return SUB;`)();
}

function freeMemberIn() {
  const SUB = loadSUB({ APP_USER: { id: 'u1' } });  // logged in, no Pro, no trial
  SUB.tier = 'free';
  SUB.status = null;
  SUB.trialStart = null;
  SUB._forceLive = true;                            // past the launch date
  return SUB;
}

test('a free member gets the first track of a Pro category and nothing else', () => {
  const SUB = freeMemberIn();
  assert.equal(SUB.canAccess('Singing_Bowl'), false, 'a new category is Pro by omission');
  assert.equal(SUB.canAccessTrack('Singing_Bowl', 0), true, 'the preview track is locked');
  for (const i of [1, 2, 7, 13]) {
    assert.equal(SUB.canAccessTrack('Singing_Bowl', i), false, `track ${i} is being given away`);
  }
});

test('an unknown index is locked, never treated as track 0', () => {
  // indexOf() returns -1 when the listing is not loaded. A truthy-ish check
  // (`!index`) or a `<= 0` would unlock the whole category on a cold cache.
  const SUB = freeMemberIn();
  assert.equal(SUB.canAccessTrack('Singing_Bowl', -1), false);
});

test('the preview does not shadow a category the user already owns', () => {
  const SUB = freeMemberIn();
  for (const i of [0, 1, 9]) {
    assert.equal(SUB.canAccessTrack('Crystal_Frequencies', i), true,
      'a free category must stay fully open');
  }
});

test('a non-member gets the preview too — it is the hook, not a member perk', () => {
  const SUB = loadSUB();                // not logged in
  SUB._forceLive = true;
  assert.equal(SUB.canAccess('Singing_Bowl'), false);
  assert.equal(SUB.canAccessTrack('Singing_Bowl', 0), true);
  assert.equal(SUB.canAccessTrack('Singing_Bowl', 3), false);
});

test('the 72h trial still opens every track, not just the first', () => {
  const SUB = loadSUB({ APP_USER: { id: 'u1' } });
  SUB.tier = 'free';
  SUB._forceLive = true;
  SUB.setTrialStart(new Date(Date.now() - 3600_000).toISOString());   // 1h in
  assert.equal(SUB.isInTrial(), true);
  assert.equal(SUB.canAccessTrack('Singing_Bowl', 11), true);
});

test('an expired trial falls back to the preview, not to full access', () => {
  const SUB = loadSUB({ APP_USER: { id: 'u1' } });
  SUB.tier = 'free';
  SUB._forceLive = true;
  SUB.setTrialStart(new Date(Date.now() - 80 * 3600_000).toISOString()); // 80h > 72h
  assert.equal(SUB.trialExpired(), true);
  assert.equal(SUB.canAccessTrack('Singing_Bowl', 0), true);
  assert.equal(SUB.canAccessTrack('Singing_Bowl', 1), false);
});

// ── every door into the player ────────────────────────────────────────────

test('a Pro category can now be opened', () => {
  // The whole feature is pointless if the row still bounces you.
  const html = read('public/5do.html');
  const click = html.slice(html.indexOf("row.addEventListener('click', ()=>{\n        STATE.path = name;"));
  assert.ok(click.startsWith("row.addEventListener('click', ()=>{\n        STATE.path = name;"),
    'the category row still refuses to open');
  assert.doesNotMatch(html, /if \(locked\) \{ SUB\.showUpgradePrompt\('category'\); return; \}/,
    'the category click is blocked again');
});

test('a locked category row is NOT dimmed', () => {
  // A row at 0.5 opacity reads as disabled and does not get tapped.
  const html = read('public/5do.html');
  const gate = html.slice(html.indexOf('const locked = (typeof SUB'), html.indexOf("row.append(th, meta);"));
  assert.doesNotMatch(gate, /row\.style\.opacity = '0\.5'/, 'the Pro category is dimmed again');
  assert.match(gate, /lockBadge\.textContent = '🔒'/, 'nothing marks it as Pro any more');
});

test('playSelectedTrack is the gate, and it stays synchronous', () => {
  // iOS only honours play() inside the gesture task; an await here would
  // silently break playback on every iPhone.
  const html = read('public/5do.html');
  assert.match(html, /function playSelectedTrack\(folder, file\)\{\n(?:.*\n)*?\s*if \(!trackPlayAllowed\(folder, file\)\) return;/);
  assert.doesNotMatch(html, /async function playSelectedTrack/, 'the play path became async');
  assert.doesNotMatch(html, /function trackPlayAllowed[\s\S]{0,400}await /, 'the gate awaits inside a gesture');
});

test('prev/next cannot step off the preview track', () => {
  // navigateTrack() must keep going through playSelectedTrack, or the swipe
  // becomes a free pass through the whole category.
  const html = read('public/5do.html');
  const at = html.indexOf('function navigateTrack(dir)');
  const fn = html.slice(at, html.indexOf('// ===== Track selection', at));
  assert.match(fn, /playSelectedTrack\(ct\.folder, tracks\[newIdx\]\)/);
});

test('search, favourites and playlists all pass through a gate', () => {
  const html = read('public/5do.html');
  const favs = read('public/js/favorites.js');
  const pl = read('public/js/playlist.js');
  // search builds its own url
  assert.match(html, /if \(!trackPlayAllowed\(folder, f\)\) return;[\s\S]{0,200}MEDIA_BASE/);
  // favourites resolve the lock during the async render, then check it on click
  assert.match(favs, /favLocked = !SUB\.canAccessTrack\(folder, \(tracks \|\| \[\]\)\.indexOf\(file\)\)/);
  assert.match(favs, /if \(favLocked\) \{ SUB\.showUpgradePrompt\('category'\); return; \}/);
  // playlists reuse the canonical entry point, which is already gated
  assert.match(pl, /window\.playSelectedTrack\(track\.folder, track\.file\)/);
});

test('the track index comes from the full listing, not the rendered position', () => {
  // The favourites filter skips rows. Numbering the rendered rows instead
  // would make some other track free whenever that filter is on.
  const html = read('public/5do.html');
  assert.match(html, /for\(const \[_i, f\] of files\.entries\(\)\)/);
  const loop = html.slice(html.indexOf('for(const [_i, f] of files.entries())'));
  assert.match(loop.slice(0, 900), /canAccessTrack\(STATE\.path, _i\)/);
});

test('a preview-only category says so once, at the top', () => {
  const html = read('public/5do.html');
  assert.match(html, /SUB\.isPreviewOnly\(STATE\.path\)/);
  assert.match(html, /무료 미리듣기 — 첫 곡은 누구나/);
  assert.match(html, /Free preview — the first track is open to everyone/);
});

test('the service worker was rebuilt', () => {
  const sw = read('public/sw.js');
  const id = sw.match(/const BUILD_ID = '([^']+)'/)[1];
  assert.ok(id >= '2026-11-07-v129', `BUILD_ID ${id} predates the preview gate`);
});
