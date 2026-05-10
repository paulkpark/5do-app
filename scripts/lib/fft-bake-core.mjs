import FFT from 'fft.js';

export function hannWindow(n) {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
  }
  return w;
}

export function logBinEdges({ bins, fMin, fMax }) {
  const edges = new Float32Array(bins + 1);
  const logMin = Math.log(fMin);
  const logMax = Math.log(fMax);
  const step = (logMax - logMin) / bins;
  for (let i = 0; i <= bins; i++) {
    edges[i] = Math.exp(logMin + step * i);
  }
  edges[0] = fMin;
  edges[bins] = fMax;
  return edges;
}

export function binMagnitudes(magnitudes, edges, sampleRate, fftSize) {
  const bins = edges.length - 1;
  const out = new Float32Array(bins);
  const counts = new Uint16Array(bins);
  const numFftBins = magnitudes.length;
  for (let i = 0; i < numFftBins; i++) {
    const freq = (i / fftSize) * sampleRate;
    if (freq < edges[0] || freq >= edges[bins]) continue;
    let lo = 0, hi = bins;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (edges[mid + 1] <= freq) lo = mid + 1;
      else hi = mid;
    }
    out[lo] += magnitudes[i];
    counts[lo] += 1;
  }
  for (let i = 0; i < bins; i++) {
    if (counts[i] > 0) out[i] /= counts[i];
  }
  return out;
}

export function normalizePeak(frames) {
  let peak = 0;
  for (const f of frames) for (const v of f) if (v > peak) peak = v;
  if (peak === 0) return 0;
  for (const f of frames) for (let i = 0; i < f.length; i++) f[i] /= peak;
  return peak;
}

export function quantizeFrame(frame) {
  const out = new Uint8Array(frame.length);
  for (let i = 0; i < frame.length; i++) {
    let v = frame[i];
    if (v < 0) v = 0;
    if (v > 1) v = 1;
    out[i] = Math.round(v * 255);
  }
  return out;
}

export function buildFrames({ pcm, sampleRate, fps = 30, fftSize = 2048, bins = 32, fMin = 20, fMax = null }) {
  const fmax = fMax ?? sampleRate / 2;
  const hop = Math.round(sampleRate / fps);
  const numFrames = Math.ceil(pcm.length / hop);
  const window = hannWindow(fftSize);
  const fft = new FFT(fftSize);
  const fftBuffer = fft.createComplexArray();
  const inputBuffer = new Float32Array(fftSize);
  const magnitudes = new Float32Array(fftSize / 2);
  const edges = logBinEdges({ bins, fMin, fMax: fmax });
  const rawFrames = [];

  for (let f = 0; f < numFrames; f++) {
    const start = f * hop;
    const winStart = start - Math.floor(fftSize / 2);
    for (let i = 0; i < fftSize; i++) {
      const src = winStart + i;
      inputBuffer[i] = (src >= 0 && src < pcm.length) ? pcm[src] * window[i] : 0;
    }
    fft.realTransform(fftBuffer, inputBuffer);
    fft.completeSpectrum(fftBuffer);
    for (let i = 0; i < magnitudes.length; i++) {
      const re = fftBuffer[2 * i];
      const im = fftBuffer[2 * i + 1];
      magnitudes[i] = Math.sqrt(re * re + im * im);
    }
    rawFrames.push(binMagnitudes(magnitudes, edges, sampleRate, fftSize));
  }

  const peak = normalizePeak(rawFrames);
  const frames = rawFrames.map(quantizeFrame);
  return { frames, peak, fps, bins };
}
