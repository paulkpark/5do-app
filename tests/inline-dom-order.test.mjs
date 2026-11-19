import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// 5do.html's inline scripts run while the page is still being parsed, so an
// element further down the file does not exist yet when they reach it.
//
// The play-timer modal was moved to the end of the document. The block that
// wires it runs ~2,500 lines earlier, `$('#timerApply')` came back null, and
// `.addEventListener` on null threw — taking every statement after it in that
// block down too. The library rendered as a blank black screen. The unit tests
// stayed green throughout, because their stub `$` invents any element asked for.
//
// So this reads the real file: every top-level, unguarded dereference must name
// an element declared ABOVE it. Top-level means column 0 — that is code that
// runs at parse time, not inside a handler that runs after load.

const html = fs.readFileSync(new URL('../public/5do.html', import.meta.url), 'utf8');

const PATTERNS = [
  /^\$\('#([A-Za-z0-9_-]+)'\)\s*\./gm,
  /^document\.getElementById\('([A-Za-z0-9_-]+)'\)\s*\./gm,
];

function derefs() {
  const out = [];
  for (const re of PATTERNS) {
    for (const m of html.matchAll(re)) out.push({ id: m[1], at: m.index });
  }
  return out;
}

test('the check has something to check', () => {
  assert.ok(derefs().length > 10, 'no top-level lookups found — re-point this test');
});

test('every element a parse-time script touches is already in the document', () => {
  const late = [];
  for (const { id, at } of derefs()) {
    const decl = html.indexOf(`id="${id}"`);
    if (decl === -1) late.push(`#${id} (not in the markup at all)`);
    else if (decl > at) {
      const line = html.slice(0, at).split('\n').length;
      const declLine = html.slice(0, decl).split('\n').length;
      late.push(`#${id} used on line ${line}, declared on line ${declLine}`);
    }
  }
  assert.deepEqual(late, [],
    'these would be null when the script runs, and the throw kills the rest of the block:\n  '
    + late.join('\n  '));
});

test('the timer modal sits at the top of <body>', () => {
  // Both halves matter: a child of <body> so position:fixed is viewport-
  // relative, and above the scripts so they can find it.
  const body = html.indexOf('<body>');
  const modal = html.indexOf('<div id="timerModal"');
  const firstScript = html.indexOf('<script', body);
  assert.ok(modal > body && modal < firstScript,
    'the timer modal must come before the first script in <body>');
});
