import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 5do.html had grown THREE `</body></html>` pairs: new panels were appended
// after the end of the document instead of before it, and the parser quietly
// hoisted them back into <body>, so nothing ever looked broken.
//
// Nothing ever will look broken — that is the problem. It costs nothing in the
// browser and misleads everything else: anything that reasons about the file by
// text (this suite included — a slice to "the end of the body" landed 80 lines
// short of the element it was reading) gets the wrong answer, and the next
// person appends to whichever ending they happen to scroll to first.

const root = fileURLToPath(new URL('../', import.meta.url));

function htmlFiles(dir, out = []) {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) return out;
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    if (e.name === 'node_modules') continue;
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) htmlFiles(rel, out);
    else if (e.name.endsWith('.html')) out.push(rel);
  }
  return out;
}

const PAGES = [...htmlFiles('public'), ...htmlFiles('akashic-frequency')].sort();

test('there are pages to check', () => {
  assert.ok(PAGES.length > 5, `only found ${PAGES.length} HTML files — re-point this test`);
});

test('every page closes its body and html exactly once', () => {
  for (const f of PAGES) {
    const src = fs.readFileSync(path.join(root, f), 'utf8');
    // Closing tags only. "<body>" turns up in prose and in comments explaining
    // where a node gets reparented to; "</body>" never does.
    const body = (src.match(/<\/body\s*>/gi) || []).length;
    const html = (src.match(/<\/html\s*>/gi) || []).length;
    assert.equal(body, 1, `${f} has ${body} </body> tags`);
    assert.equal(html, 1, `${f} has ${html} </html> tags`);
  }
});

test('nothing is appended after the end of the document', () => {
  for (const f of PAGES) {
    const src = fs.readFileSync(path.join(root, f), 'utf8');
    assert.match(src, /<\/body\s*>\s*<\/html\s*>\s*$/i,
      `${f} has markup after </html> — it belongs before </body>`);
  }
});
