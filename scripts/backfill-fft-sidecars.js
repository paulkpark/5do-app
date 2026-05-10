// scripts/backfill-fft-sidecars.js
//
// Bake FFT sidecars for every audio track in the live Supabase media bucket.
// Reads track list from media/meta.json, skips tracks that already have a
// .fft.json sidecar uploaded, downloads each remaining .mp3 to a tmp dir,
// runs buildFrames, uploads <basename>.fft.json via Supabase storage REST.
//
// Usage:
//   SUPABASE_SERVICE_ROLE_KEY=... node scripts/backfill-fft-sidecars.js
//   node scripts/backfill-fft-sidecars.js --dry-run            # list only
//   node scripts/backfill-fft-sidecars.js --limit 5            # first 5 missing
//   node scripts/backfill-fft-sidecars.js --force              # re-bake even if sidecar exists
//   node scripts/backfill-fft-sidecars.js --concurrency 3      # parallel HEAD probes (default 5)

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';
import { buildFrames } from './lib/fft-bake-core.mjs';

const SUPABASE_URL = 'https://xdjgumqdwedgzwqturcx.supabase.co';
const BUCKET = 'media';
const PUBLIC_BASE = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}`;
const STORAGE_BASE = `${SUPABASE_URL}/storage/v1/object/${BUCKET}`;

// Match scripts/bake-fft.js
const FPS = 30;
const FFT_SIZE = 2048;
const BINS = 32;
const TARGET_RATE = 22050;

function encodeKey(key) {
  return key.split('/').map(encodeURIComponent).join('/');
}

async function fetchMetaJson() {
  const res = await fetch(`${PUBLIC_BASE}/meta.json`);
  if (!res.ok) throw new Error(`meta.json fetch failed: ${res.status}`);
  return res.json();
}

function listAudioTracks(meta) {
  return Object.keys(meta)
    .filter((k) => k.endsWith('.mp3') && !k.includes('_qtx'))
    .sort();
}

async function sidecarExists(trackKey) {
  const sidecarKey = trackKey.replace(/\.mp3$/, '.fft.json');
  const url = `${PUBLIC_BASE}/${encodeKey(sidecarKey)}`;
  try {
    const res = await fetch(url, { method: 'HEAD' });
    return res.ok;
  } catch {
    return false;
  }
}

async function probeMissing(tracks, concurrency = 5) {
  const missing = [];
  let i = 0;
  async function worker() {
    while (i < tracks.length) {
      const idx = i++;
      const key = tracks[idx];
      const exists = await sidecarExists(key);
      if (!exists) missing.push(key);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return missing.sort();
}

async function downloadMp3(trackKey, tmpDir) {
  const url = `${PUBLIC_BASE}/${encodeKey(trackKey)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${trackKey} failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const localPath = path.join(tmpDir, path.basename(trackKey));
  await fs.writeFile(localPath, buf);
  return localPath;
}

function decodeToPCM(inputPath) {
  return new Promise((resolve, reject) => {
    const args = [
      '-i', inputPath,
      '-f', 'f32le',
      '-acodec', 'pcm_f32le',
      '-ac', '1',
      '-ar', String(TARGET_RATE),
      '-loglevel', 'error',
      'pipe:1'
    ];
    const proc = spawn(ffmpegPath, args);
    const chunks = [];
    proc.stdout.on('data', (c) => chunks.push(c));
    let stderr = '';
    proc.stderr.on('data', (c) => (stderr += c.toString()));
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error(`ffmpeg exit ${code}: ${stderr}`));
      const buf = Buffer.concat(chunks);
      const pcm = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
      resolve(pcm);
    });
  });
}

async function bakeSidecarJson(localMp3) {
  const pcm = await decodeToPCM(localMp3);
  const duration = pcm.length / TARGET_RATE;
  const { frames } = buildFrames({
    pcm,
    sampleRate: TARGET_RATE,
    fps: FPS,
    fftSize: FFT_SIZE,
    bins: BINS
  });
  return {
    version: 1,
    fps: FPS,
    bins: BINS,
    duration: Number(duration.toFixed(3)),
    frames: frames.map((f) => Array.from(f))
  };
}

async function uploadSidecar(trackKey, json, serviceRoleKey) {
  const sidecarKey = trackKey.replace(/\.mp3$/, '.fft.json');
  const url = `${STORAGE_BASE}/${encodeKey(sidecarKey)}`;
  const body = JSON.stringify(json);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${serviceRoleKey}`,
      'apikey': serviceRoleKey,
      'Content-Type': 'application/json',
      'x-upsert': 'true'
    },
    body
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`upload ${sidecarKey} failed: ${res.status} ${text}`);
  }
  return body.length;
}

function fmtBytes(n) {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / 1024 / 1024).toFixed(2)}MB`;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const force = args.includes('--force');
  const limitFlag = args.indexOf('--limit');
  const limit = limitFlag >= 0 ? parseInt(args[limitFlag + 1], 10) : Infinity;
  const concurrencyFlag = args.indexOf('--concurrency');
  const concurrency = concurrencyFlag >= 0 ? parseInt(args[concurrencyFlag + 1], 10) : 5;

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!dryRun && !serviceRoleKey) {
    console.error('ERROR: set SUPABASE_SERVICE_ROLE_KEY env var (or use --dry-run)');
    console.error('   tip: export SUPABASE_SERVICE_ROLE_KEY=... ; then run script ; then unset SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  console.log(`Mode: ${dryRun ? 'DRY-RUN (no downloads, no uploads)' : 'LIVE'}`);
  console.log(`Concurrency for HEAD probes: ${concurrency}`);
  if (force) console.log('FORCE: re-baking even existing sidecars');
  if (limit !== Infinity) console.log(`LIMIT: at most ${limit} tracks`);
  console.log();

  console.log('Fetching meta.json...');
  const meta = await fetchMetaJson();
  const tracks = listAudioTracks(meta);
  console.log(`Found ${tracks.length} audio tracks in meta.json`);

  let toProcess;
  if (force) {
    toProcess = tracks;
    console.log('Skipping HEAD probes (force mode)');
  } else {
    console.log('Probing existing sidecars (HEAD)...');
    toProcess = await probeMissing(tracks, concurrency);
    console.log(`${toProcess.length} tracks missing a sidecar (${tracks.length - toProcess.length} already have one)`);
  }

  if (toProcess.length === 0) {
    console.log('Nothing to do — all tracks already have sidecars.');
    return;
  }

  toProcess = toProcess.slice(0, limit);

  if (dryRun) {
    console.log('\nWould bake the following tracks:');
    for (const k of toProcess) console.log(`  ${k}`);
    console.log(`\nTotal: ${toProcess.length}`);
    return;
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cym-backfill-'));
  console.log(`\nTemp dir: ${tmpDir}`);

  let ok = 0;
  let failed = 0;
  let totalBytes = 0;
  const startTime = Date.now();

  for (let i = 0; i < toProcess.length; i++) {
    const key = toProcess[i];
    const tag = `[${i + 1}/${toProcess.length}]`;
    process.stdout.write(`${tag} ${key} ... `);
    const t0 = Date.now();
    try {
      const localMp3 = await downloadMp3(key, tmpDir);
      const json = await bakeSidecarJson(localMp3);
      const bytes = await uploadSidecar(key, json, serviceRoleKey);
      await fs.unlink(localMp3).catch(() => {});
      totalBytes += bytes;
      ok++;
      console.log(`✓ ${json.duration.toFixed(1)}s · ${fmtBytes(bytes)} · ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    } catch (e) {
      failed++;
      console.log(`✗ ${e.message}`);
    }
  }

  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});

  const elapsed = (Date.now() - startTime) / 1000;
  console.log('\n=== Summary ===');
  console.log(`Successful uploads: ${ok}`);
  console.log(`Failed:             ${failed}`);
  console.log(`Total sidecar size: ${fmtBytes(totalBytes)}`);
  console.log(`Elapsed:            ${elapsed.toFixed(1)}s (${(elapsed / 60).toFixed(1)} min)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
