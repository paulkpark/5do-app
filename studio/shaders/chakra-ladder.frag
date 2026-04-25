#pragma use_lib palette
#pragma use_lib audio
precision highp float;
uniform float u_time;
uniform vec2  u_resolution;

// ── Preset parameters ──
uniform float u_speed;          // 0-2     overall flow speed
uniform float u_columnWidth;    // 0.15-0.6 width of central energy column
uniform float u_chakraSize;     // 0.05-0.18 chakra disc radius
uniform float u_glow;           // 0-2     halo intensity
uniform float u_energyFlow;     // 0-1     ascending light particles
uniform float u_audioReact;     // 0-1     audio modulation strength
uniform float u_breathPulse;    // 0-1     overall breath cycle
uniform float u_haloOuter;      // 0-1     outer aura blanket

// 7 chakra positions (y from -0.85 root → +0.85 crown) + their canonical colors.
// (Solfeggio frequency association noted in comments for reference.)
vec3 chakraCol(int i) {
  if (i == 0) return vec3(0.96, 0.13, 0.22);  // root        — Muladhara — 396 Hz
  if (i == 1) return vec3(1.00, 0.50, 0.13);  // sacral      — Svadhisthana — 417 Hz
  if (i == 2) return vec3(1.00, 0.88, 0.22);  // solar plexus — Manipura — 528 Hz
  if (i == 3) return vec3(0.22, 0.88, 0.42);  // heart       — Anahata — 639 Hz
  if (i == 4) return vec3(0.22, 0.58, 0.96);  // throat      — Vishuddha — 741 Hz
  if (i == 5) return vec3(0.45, 0.20, 0.92);  // third eye   — Ajna — 852 Hz
  return         vec3(0.92, 0.45, 1.00);     // crown       — Sahasrara — 963 Hz
}

float chakraY(int i) {
  // Even spacing between -0.85 (root) and +0.85 (crown)
  return -0.85 + float(i) * (1.7 / 6.0);
}

// SDF: a stretched ellipse (lotus flower-style chakra disc shape)
float sdEllipse(vec2 p, vec2 r) {
  vec2 q = p / r;
  return (length(q) - 1.0) * min(r.x, r.y);
}

// SDF: lotus petal — N-fold radial petal pattern
float sdLotus(vec2 p, int N, float radius, float petalLen) {
  float a = atan(p.x, p.y);
  float r = 6.28318530 / float(N);
  a = mod(a + r * 0.5, r) - r * 0.5;
  vec2 q = vec2(sin(a), cos(a)) * length(p);
  return length(vec2(q.x, q.y - radius)) - petalLen;
}

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;

  // Time scaled by speed
  float t = u_time * u_speed;

  // Audio-driven energy boost — mapped per-chakra
  // Bass tracks root (i=0); mid tracks heart (i=3); treble tracks crown (i=6)
  // Other chakras get smooth interpolations between these.
  float bandEnergy[7];
  bandEnergy[0] = u_bassPres * 1.2 + u_bassHit * 0.5;
  bandEnergy[1] = mix(u_bassPres, u_midPres, 0.33);
  bandEnergy[2] = mix(u_bassPres, u_midPres, 0.66);
  bandEnergy[3] = u_midPres * 1.2 + u_midHit * 0.5;
  bandEnergy[4] = mix(u_midPres, u_treblePres, 0.33);
  bandEnergy[5] = mix(u_midPres, u_treblePres, 0.66);
  bandEnergy[6] = u_treblePres * 1.2 + u_trebleHit * 0.5;

  vec3 col = vec3(0.0);

  // ── Central energy column ──
  // A vertical bar of soft glow that breathes with the audio.
  float colWidth = u_columnWidth * (0.85 + u_breathPulse * 0.18 * sin(t * 0.7));
  float colDist  = abs(uv.x);
  float colMask  = exp(-pow(colWidth > 0.0 ? (colDist / colWidth) : 0.0, 2.0) * 5.0);
  // Color gradient running root→crown along y
  float yt = clamp((uv.y + 0.85) / 1.7, 0.0, 1.0);
  vec3 colColor;
  // 7-segment chakra gradient
  float segIdx = yt * 6.0;
  int   sLow = int(floor(segIdx));
  int   sHi  = sLow + 1;
  if (sHi > 6) sHi = 6;
  if (sLow < 0) sLow = 0;
  float sFrac = fract(segIdx);
  // GLSL ES 1.00 forbids dynamic indexing of inline-fn returns; use loop
  vec3 c0, c1;
  for (int k = 0; k < 7; k++) {
    if (k == sLow) c0 = chakraCol(k);
    if (k == sHi)  c1 = chakraCol(k);
  }
  colColor = mix(c0, c1, smoothstep(0.0, 1.0, sFrac));
  col += colColor * colMask * (0.40 + 0.30 * u_bassPres);

  // ── 7 chakra discs along the column ──
  for (int i = 0; i < 7; i++) {
    vec3 cc = chakraCol(i);
    float cy = chakraY(i);
    vec2 cp  = vec2(uv.x, uv.y - cy);

    // Per-chakra audio energy
    float e = clamp(bandEnergy[i], 0.0, 2.0);

    // Pulse scale on hits
    float beatPulse = 0.0;
    if (i == 0)      beatPulse = u_bassHit;
    else if (i == 3) beatPulse = u_midHit;
    else if (i == 6) beatPulse = u_trebleHit;
    else             beatPulse = u_beatOnset * 0.4;
    float scale = 1.0 + u_audioReact * (0.20 * e + 0.30 * beatPulse);

    float r = u_chakraSize * scale;

    // Inner glowing disc
    float disc = length(cp) - r;
    float discFill = smoothstep(0.005, 0.0, disc);
    float discHalo = smoothstep(r * 1.6, 0.0, length(cp)) * (0.4 + 0.6 * e);

    // Lotus petal silhouette (N petals at chakra-specific count)
    int petalCount = i == 0 ? 4 :
                     i == 1 ? 6 :
                     i == 2 ? 10 :
                     i == 3 ? 12 :
                     i == 4 ? 16 :
                     i == 5 ? 2 : 1000;  // crown = "thousand-petal" → just full halo
    float lotusD = sdLotus(cp, petalCount, r * 1.3, r * 0.7);
    float lotusEdge = smoothstep(0.012, 0.0, abs(lotusD)) * 0.8;

    // Compose chakra
    vec3 chakraTint = cc;
    col += chakraTint * (discFill * 0.85 + discHalo * 0.55 + lotusEdge * 0.5)
                     * (1.0 + e * 0.7);

    // Beat flash — chakra flashes with full color on its hit
    col += chakraTint * smoothstep(r * 1.3, 0.0, length(cp)) * beatPulse * 0.7;
  }

  // ── Energy particles flowing up the column ──
  // Each frame, particles spawn at root and ascend to crown, color-shifting
  // through the chakra spectrum.
  if (u_energyFlow > 0.01) {
    for (int i = 0; i < 12; i++) {
      float fi = float(i);
      // Each particle has a lifetime offset along time
      float life = fract(t * 0.4 + fi * 0.083);
      float py = mix(-0.85, 0.85, life);
      float px = (hash21(vec2(fi, 0.0)) - 0.5) * u_columnWidth * 0.7;
      // Slight horizontal wave
      px += 0.08 * sin(life * 6.28318 + fi * 1.5);
      vec2 pp = vec2(uv.x - px, uv.y - py);
      float dot_ = exp(-dot(pp, pp) * 800.0);
      // Particle color matches local chakra
      float pTy = clamp((py + 0.85) / 1.7, 0.0, 1.0);
      float pSegIdx = pTy * 6.0;
      int pLow = int(floor(pSegIdx));
      if (pLow > 6) pLow = 6;
      int pHi = pLow + 1;
      if (pHi > 6) pHi = 6;
      vec3 pc0, pc1;
      for (int k = 0; k < 7; k++) {
        if (k == pLow) pc0 = chakraCol(k);
        if (k == pHi)  pc1 = chakraCol(k);
      }
      vec3 pc = mix(pc0, pc1, fract(pSegIdx));
      // Fade in/out at endpoints
      float alpha = sin(life * 3.14159);
      col += pc * dot_ * alpha * u_energyFlow * 1.5;
    }
  }

  // ── Outer aura blanket — soft cosmic halo around the whole composition ──
  if (u_haloOuter > 0.01) {
    float r2d = length(uv);
    vec3 auraHue = mix(chakraCol(0), chakraCol(6),
                       0.5 + 0.5 * sin(t * 0.3));
    col += auraHue * exp(-r2d * 1.4) * u_haloOuter * 0.18 * (0.6 + u_bassPres * 0.7);
  }

  // ── Background gradient ──
  vec3 bg = vec3(0.025, 0.018, 0.06);
  col += bg;

  // Glow self-multiply
  col += col * u_glow * 0.35;

  // Vignette + tonemap + gamma
  col *= smoothstep(1.95, 0.20, length(uv));
  col = col / (1.0 + col);
  col = pow(col, vec3(0.86));

  gl_FragColor = vec4(col, 1.0);
}
