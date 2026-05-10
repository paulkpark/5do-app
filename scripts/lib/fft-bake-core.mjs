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
