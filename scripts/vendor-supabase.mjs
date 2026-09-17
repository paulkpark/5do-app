#!/usr/bin/env node
// Refresh public/js/vendor/supabase-js-<version>.js from npm, via two CDNs.
//
// Both must return byte-identical content before anything is written — they
// serve the same npm tarball, so a mismatch means one of them is serving
// something the registry did not publish.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('usage: npm run vendor:supabase -- <version>   (e.g. 2.116.0)');
  process.exit(1);
}

const file = `@supabase/supabase-js@${version}/dist/umd/supabase.js`;
const sources = [`https://cdn.jsdelivr.net/npm/${file}`, `https://unpkg.com/${file}`];

const bodies = [];
for (const url of sources) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) { console.error(`✗ ${url} → HTTP ${res.status}`); process.exit(1); }
  bodies.push(Buffer.from(await res.arrayBuffer()));
  console.log(`  fetched ${bodies.at(-1).length} bytes from ${new URL(url).host}`);
}
if (!bodies[0].equals(bodies[1])) {
  console.error('✗ the two CDNs disagree — refusing to vendor.');
  process.exit(1);
}

const root = path.resolve(import.meta.dirname, '..');
const dir = path.join(root, 'public/js/vendor');
for (const old of await fs.readdir(dir)) {
  if (/^supabase-js-.*\.js$/.test(old) && old !== `supabase-js-${version}.js`) {
    await fs.rm(path.join(dir, old));
    console.log(`  removed stale ${old}`);
  }
}
const out = path.join(dir, `supabase-js-${version}.js`);
await fs.writeFile(out, bodies[0]);

const sha = crypto.createHash('sha256').update(bodies[0]).digest('hex');
console.log(`\n✓ wrote public/js/vendor/supabase-js-${version}.js`);
console.log(`  sha256 ${sha}\n`);
console.log('Now update all three, or tests/vendor-supabase.test.mjs will fail:');
console.log(`  1. public/5do.html   <script src="/js/vendor/supabase-js-${version}.js">`);
console.log(`  2. public/sw.js      CORE_ASSETS: '/js/vendor/supabase-js-${version}.js'`);
console.log('  3. public/js/vendor/README.md   version + sha256');
console.log('  4. public/sw.js      bump BUILD_ID');
