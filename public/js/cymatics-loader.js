// public/js/cymatics-loader.js

export function dequantizeFrame(frame) {
  const out = new Float32Array(frame.length);
  for (let i = 0; i < frame.length; i++) out[i] = frame[i] / 255;
  return out;
}

export function sampleAtTime(sidecar, timeSec) {
  const bins = sidecar.bins;
  const out = new Float32Array(bins);
  if (!sidecar.frames || sidecar.frames.length === 0) return out;
  const fps = sidecar.fps;
  const t = Math.max(0, timeSec);
  const idxF = t * fps;
  const i0 = Math.floor(idxF);
  const i1 = Math.min(i0 + 1, sidecar.frames.length - 1);
  const frac = Math.min(1, idxF - i0);
  if (i0 >= sidecar.frames.length) {
    const last = sidecar.frames[sidecar.frames.length - 1];
    for (let i = 0; i < bins; i++) out[i] = last[i] / 255;
    return out;
  }
  const f0 = sidecar.frames[i0];
  const f1 = sidecar.frames[i1];
  for (let i = 0; i < bins; i++) {
    out[i] = (f0[i] * (1 - frac) + f1[i] * frac) / 255;
  }
  return out;
}

export function proceduralFrame({ timeSec, duration, bins = 32 }) {
  const out = new Float32Array(bins);
  const norm = duration > 0 ? (timeSec % duration) / duration : 0;
  for (let i = 0; i < bins; i++) {
    const phase = i / bins;
    const a = 0.5 + 0.5 * Math.sin(2 * Math.PI * (phase * 3 + timeSec * 0.4));
    const b = 0.5 + 0.5 * Math.cos(2 * Math.PI * (phase * 5.7 - timeSec * 0.27));
    const c = 0.5 + 0.5 * Math.sin(2 * Math.PI * (phase * 1.3 + norm * 2));
    const tilt = 1 - phase * 0.6;
    out[i] = Math.min(1, ((a * b * 0.7 + c * 0.3) * tilt));
  }
  return out;
}
