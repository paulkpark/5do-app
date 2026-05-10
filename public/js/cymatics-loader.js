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

const _isIOS = typeof navigator !== 'undefined' && (
  /iPad|iPhone|iPod/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
);

function _sidecarUrlFor(audioUrl) {
  return audioUrl.replace(/\.[^.\/]+$/, '.fft.json');
}

async function _tryFetchSidecar(audioUrl) {
  if (typeof fetch === 'undefined') return null;
  const url = _sidecarUrlFor(audioUrl);
  try {
    const head = await fetch(url, { method: 'HEAD' });
    if (!head.ok) return null;
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Build a frequency-data source for the given audio element + URL.
 * Returns: { kind, sample(): Float32Array(32) }
 *   - kind: 'sidecar' | 'analyser' | 'procedural'
 */
export async function buildSource({ audio, audioUrl, analyserFactory }) {
  const sidecar = await _tryFetchSidecar(audioUrl);
  if (sidecar) {
    return {
      kind: 'sidecar',
      sample: () => sampleAtTime(sidecar, audio.currentTime || 0)
    };
  }
  if (!_isIOS && analyserFactory) {
    try {
      const analyser = analyserFactory();
      if (analyser) {
        const bins = analyser.frequencyBinCount;
        const buf = new Uint8Array(bins);
        return {
          kind: 'analyser',
          sample: () => {
            analyser.getByteFrequencyData(buf);
            const out = new Float32Array(32);
            const stride = bins / 32;
            for (let i = 0; i < 32; i++) {
              let s = 0, n = 0;
              const lo = Math.floor(i * stride), hi = Math.floor((i + 1) * stride);
              for (let j = lo; j < hi; j++) { s += buf[j]; n++; }
              out[i] = (s / Math.max(1, n)) / 255;
            }
            return out;
          }
        };
      }
    } catch {
      // fall through
    }
  }
  return {
    kind: 'procedural',
    sample: () => proceduralFrame({
      timeSec: audio.currentTime || 0,
      duration: audio.duration || 600,
      bins: 32
    })
  };
}
