import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// The host hides tabs with display:none, which does not change an iframe's
// document.visibilityState — so biofield's own visibilitychange guards only fire
// when the whole browser tab is switched. Leaving the tab inside the app left
// the camera and microphone running. These pin the channel that fixes it.

const read = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const bio = read('public/biofield.html');
const host = read('public/5do.html');

test('every engine that holds a device subscribes to the release channel', () => {
  // Four capture engines: rPPG, breath (mic), voice (mic), aura scan.
  const guards = (bio.match(/document\.addEventListener\('visibilitychange'/g) || []).length;
  const subs = (bio.match(/onRelease\(\(\) => \{/g) || []).length;
  assert.equal(guards, 4, 'expected four capture engines');
  assert.equal(subs, guards, 'each engine must also release on request, not only on tab switch');
});

test('the release channel actually stops what is registered', () => {
  const src = /const _releases = \[\];[\s\S]*?window\.addEventListener\('pagehide'[^\n]*\n/.exec(bio);
  assert.ok(src, 'release channel not found');
  const api = new Function('window', 'console',
    src[0] + '\nreturn { onRelease, releaseCapture };')(
    { addEventListener() {} }, { log() {} });

  let stopped = 0;
  api.onRelease(() => { stopped++; });
  api.onRelease(() => { throw new Error('one engine throwing'); });
  api.onRelease(() => { stopped++; });
  api.releaseCapture('test');
  // A throwing subscriber must not prevent the others from letting go of a device.
  assert.equal(stopped, 2);
});

test('the channel answers the host message and a page teardown', () => {
  assert.match(bio, /e\.data\.type === 'releaseCapture'/);
  assert.match(bio, /addEventListener\('pagehide', \(\) => releaseCapture/);
});

test('the host releases capture when leaving the Biofeedback tab', () => {
  const i = host.indexOf("if (which !== 'biofield')");
  assert.ok(i > 0, 'host does not signal the frame on tab change');
  const block = host.slice(i, i + 420);
  assert.match(block, /postMessage\(\{ type: 'releaseCapture' \}/);
  // Named origin, not '*' — this frame holds camera permission.
  assert.match(block, /postMessage\([^)]*, location\.origin\)/);
  // Not fired at an unloaded frame.
  assert.match(block, /about:blank/);
});

test('the host does not release while the user is on the Biofeedback tab', () => {
  const i = host.indexOf("if (which !== 'biofield')");
  const block = host.slice(i, i + 420);
  assert.ok(!/which === 'biofield'/.test(block),
    'the guard must be the inverse — releasing on entry would stop a scan as it starts');
});
