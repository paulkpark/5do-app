import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// The bulk sender could only address tier segments (all/free/pro), so a notice
// aimed at two specific people — a billing failure, say — had nowhere to go.
// The explicit list is matched exactly after lowercasing, which is how Supabase
// auth stores addresses, and anything unmatched is REPORTED: a typo that
// quietly narrows a send to nobody is the exact shape of failure this codebase
// has already paid for once.
//
// Addresses here are fictional on purpose. This repo is public; real subscriber
// addresses must never reach a committed file.

const server = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const admin = fs.readFileSync(new URL('../public/admin.html', import.meta.url), 'utf8');
const handler = server.slice(
  server.indexOf("app.post('/api/admin/send-email'"),
  server.indexOf("app.post('/api/email/welcome'"));

test('the endpoint takes an explicit recipient list', () => {
  assert.match(handler, /const \{ target, recipients, subject, body_html \} = req\.body;/);
  assert.match(handler, /query\.in\('email', wanted\)/);
});

test('an explicit list overrides the tier segment rather than intersecting it', () => {
  // `.in(email)` then `.eq(tier,'free')` would silently drop a Pro recipient.
  const i = handler.indexOf("query.in('email', wanted)");
  const j = handler.indexOf("target === 'free'");
  assert.ok(i > -1 && j > i, 'the recipients branch must come first and be exclusive');
  assert.match(handler, /if \(wanted\) query = query\.in/);
  assert.match(handler, /else if \(target === 'free'\)/);
});

test('addresses that match no account are reported, never silently dropped', () => {
  assert.match(handler, /notFound/);
  assert.match(handler, /None of those addresses have an account/);
  assert.match(handler, /res\.json\(\{ ok: true, sent, failed, total: emails\.length, notFound \}\)/);
});

test('the list is normalised and bounded', () => {
  assert.match(handler, /\.toLowerCase\(\)/);
  assert.match(handler, /new Set\(wanted\)/, 'duplicates would send twice');
  assert.match(handler, /max 200/);
  assert.match(handler, /recipients was given but empty/);
});

test('still auth-gated like every other admin route', () => {
  assert.match(handler, /checkAdmin\(req, res\)/);
});

test('the admin page can reach the new mode', () => {
  assert.match(admin, /<option value="recipients">/);
  assert.match(admin, /id="emailRecipients"/);
  assert.match(admin, /emailRecipientsRow/);
  assert.match(admin, /JSON\.stringify\(\{ target, recipients, subject, body_html/);
  assert.match(admin, /data\.notFound/, 'the UI must surface unmatched addresses');
});

test('a small explicit send names the addresses in the confirm', () => {
  // "send to 2 people" is not a useful confirmation when the risk is sending a
  // billing notice to the wrong person.
  assert.match(admin, /recipients\.length <= 5/);
  assert.match(admin, /recipients\.join\('\\n'\)/);
});

test('the address box parses commas, semicolons and newlines alike', () => {
  // Mirror of the split used on both sides; pasting a column of addresses out
  // of a spreadsheet has to work.
  const split = (s) => [...new Set(s.split(/[\s,;]+/).map(e => e.trim().toLowerCase()).filter(Boolean))];
  const want = ['first@example.com', 'second.name@example.com'];
  assert.deepEqual(split('first@example.com, second.name@example.com'), want);
  assert.deepEqual(split('first@example.com\nsecond.name@example.com\n'), want);
  assert.deepEqual(split(' First@Example.com ; SECOND.NAME@example.com '), want);
  assert.deepEqual(split('first@example.com, first@example.com'), ['first@example.com']);
  assert.deepEqual(split('   '), []);
});
