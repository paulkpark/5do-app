import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';
import { buildFrames } from './lib/fft-bake-core.mjs';

const FPS = 30;
const FFT_SIZE = 2048;
const BINS = 32;
const TARGET_RATE = 22050;

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
    proc.stderr.on('data', (c) => stderr += c.toString());
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error(`ffmpeg exit ${code}: ${stderr}`));
      const buf = Buffer.concat(chunks);
      const pcm = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
      resolve(pcm);
    });
  });
}

async function bakeOne(inputPath, outputPath) {
  const pcm = await decodeToPCM(inputPath);
  const duration = pcm.length / TARGET_RATE;
  const { frames } = buildFrames({
    pcm,
    sampleRate: TARGET_RATE,
    fps: FPS,
    fftSize: FFT_SIZE,
    bins: BINS
  });
  const json = {
    version: 1,
    fps: FPS,
    bins: BINS,
    duration: Number(duration.toFixed(3)),
    frames: frames.map((f) => Array.from(f))
  };
  fs.writeFileSync(outputPath, JSON.stringify(json));
  return { duration, numFrames: frames.length, outputPath };
}

function defaultOutPath(inputPath) {
  const ext = path.extname(inputPath);
  return inputPath.slice(0, -ext.length) + '.fft.json';
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === '--help') {
    console.log('Usage: bake-fft.js <input.mp3|wav> [output.fft.json]');
    console.log('       bake-fft.js --batch <directory>');
    process.exit(args.length === 0 ? 1 : 0);
  }
  if (args[0] === '--batch') {
    const dir = args[1];
    if (!dir) { console.error('--batch requires a directory'); process.exit(1); }
    const entries = fs.readdirSync(dir, { recursive: true });
    const audio = entries.filter((p) => /\.(mp3|wav|flac)$/i.test(p) && !p.includes('_qtx'));
    let n = 0;
    for (const rel of audio) {
      const inPath = path.join(dir, rel);
      const outPath = defaultOutPath(inPath);
      try {
        const res = await bakeOne(inPath, outPath);
        console.log(`✓ ${rel} → ${path.basename(outPath)} (${res.duration.toFixed(1)}s, ${res.numFrames} frames)`);
        n++;
      } catch (e) {
        console.error(`✗ ${rel}: ${e.message}`);
      }
    }
    console.log(`\nbaked ${n}/${audio.length} files`);
    return;
  }
  const inPath = args[0];
  const outPath = args[1] || defaultOutPath(inPath);
  const res = await bakeOne(inPath, outPath);
  console.log(`✓ ${inPath} → ${outPath} (${res.duration.toFixed(1)}s, ${res.numFrames} frames)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
