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
