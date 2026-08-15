#!/usr/bin/env node
//
// Builds the standalone Quantum Torus visualizer into dist/ for static hosting.
//
// The three renderer modules are copied straight out of public/js at build time
// rather than duplicated in standalone/. That is the whole point of the build
// step: whatever you tune in the standalone harness is running the exact code
// the app ships, so a look tuned there transfers without a porting pass.

import { cp, mkdir, rm, writeFile, readFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

const SHARED_MODULES = ['torus-hopf.js', 'torus-shaders.js', 'torus-render.js'];

async function main() {
  await rm(dist, { recursive: true, force: true });
  await mkdir(join(dist, 'js'), { recursive: true });

  await cp(join(root, 'standalone', 'torus', 'index.html'), join(dist, 'index.html'));
  await cp(join(root, 'standalone', 'torus', 'main.js'), join(dist, 'main.js'));

  for (const name of SHARED_MODULES) {
    const src = join(root, 'public', 'js', name);
    await stat(src);   // fail loudly if a module was renamed or moved
    await cp(src, join(dist, 'js', name));
  }

  // The harness imports './js/torus-render.js', which in turn imports its two
  // siblings by relative path — so the flat copy above resolves as-is. Verify
  // that rather than trusting it, since a missed import is a blank page.
  const renderSrc = await readFile(join(dist, 'js', 'torus-render.js'), 'utf8');
  for (const dep of ['./torus-hopf.js', './torus-shaders.js']) {
    if (!renderSrc.includes(dep)) {
      throw new Error(`torus-render.js no longer imports ${dep}; update SHARED_MODULES`);
    }
  }

  await writeFile(join(dist, '_headers'), [
    '/*',
    '  X-Content-Type-Options: nosniff',
    '  Referrer-Policy: strict-origin-when-cross-origin',
    // The harness can request the microphone; everything else stays denied.
    '  Permissions-Policy: microphone=(self), camera=(), geolocation=()',
    ''
  ].join('\n'));

  console.log(`built ${dist}`);
  console.log(`  index.html, main.js, js/{${SHARED_MODULES.join(', ')}}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
