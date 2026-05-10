// tests/generate-fixture.mjs
// Run once to produce tests/fixtures/sine_440_2s.wav (committed afterward).
import fs from 'node:fs';

const sampleRate = 22050;
const duration = 2;
const numSamples = sampleRate * duration;
const samples = new Int16Array(numSamples);
for (let i = 0; i < numSamples; i++) {
  samples[i] = Math.round(Math.sin(2 * Math.PI * 440 * (i / sampleRate)) * 32767 * 0.8);
}

function writeWav(samples, sampleRate) {
  const dataSize = samples.length * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples.length; i++) buf.writeInt16LE(samples[i], 44 + i * 2);
  return buf;
}

fs.mkdirSync('tests/fixtures', { recursive: true });
fs.writeFileSync('tests/fixtures/sine_440_2s.wav', writeWav(samples, sampleRate));
console.log('wrote tests/fixtures/sine_440_2s.wav');
