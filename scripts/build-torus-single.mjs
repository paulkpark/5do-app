#!/usr/bin/env node
//
// Bundles the standalone visualizer into ONE self-contained .html file.
//
// Why this exists alongside build-torus-standalone.mjs: that build produces a
// folder for static hosting, which needs a server. This one produces a file you
// can double-click. ES modules cannot be imported across file:// URLs, so the
// four modules are concatenated into a single inline <script> — an inline
// module has nothing to fetch, so the same-origin restriction never applies.
//
// Sources are still read from public/js at build time, so this cannot drift
// from what the app ships.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'dist-single', '5DO-Quantum-Torus.html');

// Dependency order: each file may only reference names defined above it.
const MODULES = [
  join(root, 'public', 'js', 'torus-hopf.js'),
  join(root, 'public', 'js', 'torus-shaders.js'),
  join(root, 'public', 'js', 'torus-render.js'),
  join(root, 'standalone', 'torus', 'main.js')
];

/** Drop import statements and the `export` keyword; the pieces become one scope. */
function flatten(src) {
  return src
    .replace(/^import\b[^;]*;/gm, '')
    .replace(/^export\s+(?=(const|function|class|let|var)\b)/gm, '')
    .trim();
}

/**
 * Concatenation only works if no two modules declare the same top-level name.
 * Checking that here turns a silent "Identifier has already been declared"
 * runtime failure into a build error naming the collision.
 */
function topLevelNames(src) {
  const names = new Set();
  const re = /^(?:export\s+)?(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/gm;
  let m;
  while ((m = re.exec(src))) names.add(m[1]);
  return names;
}

async function main() {
  const parts = [];
  const seen = new Map();

  for (const path of MODULES) {
    const raw = await readFile(path, 'utf8');
    for (const name of topLevelNames(raw)) {
      if (seen.has(name)) {
        throw new Error(
          `name collision: "${name}" is declared in both ${seen.get(name)} and ${path}`
        );
      }
      seen.set(name, path);
    }
    parts.push(`/* ── ${path.split('/').slice(-2).join('/')} ── */\n${flatten(raw)}`);
  }

  const bundle = parts.join('\n\n');

  let html = await readFile(join(root, 'standalone', 'torus', 'index.html'), 'utf8');
  const tag = '<script type="module" src="./main.js"></script>';
  if (!html.includes(tag)) throw new Error('index.html no longer has the expected script tag');

  html = html.replace(tag, `<script type="module">\n${bundle}\n</script>`);

  // Offline by construction, so say so where the harness mentions hosting.
  html = html.replace(
    '<title>Quantum Torus — 5DO</title>',
    '<title>Quantum Torus — 5DO</title>\n<meta name="robots" content="noindex">'
  );

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, html);

  const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
  console.log(`built ${OUT}  (${kb} KB, single file, no dependencies)`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
