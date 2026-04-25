#pragma use_lib palette
#pragma use_lib audio
precision highp float;
uniform float u_time;
uniform vec2  u_resolution;

// ── Preset parameters ──
uniform float u_speed;          // 0-2     particle/wave flow speed
uniform float u_bandWidth;      // 0.5-1   band fill ratio (gap between bands)
uniform float u_bandHeight;     // 0.4-1.5 max band height
uniform float u_glow;           // 0-2     band halo intensity
uniform float u_audioReact;     // 0-1
uniform float u_particleFlow;   // 0-1     ascending particle effect
uniform float u_haloOuter;      // 0-1     outer aura
uniform float u_labels;         // 0/1     show frequency-band labels

// ── 7 chakra colors (Solfeggio frequency mapping) ──
//   Band 0: 396 Hz — root        (red)
//   Band 1: 417 Hz — sacral      (orange)
//   Band 2: 528 Hz — solar plexus (yellow)
//   Band 3: 639 Hz — heart       (green)
//   Band 4: 741 Hz — throat      (blue)
//   Band 5: 852 Hz — third eye   (indigo)
//   Band 6: 963 Hz — crown       (violet)
vec3 chakraCol(int i) {
  if (i == 0) return vec3(0.96, 0.13, 0.22);
  if (i == 1) return vec3(1.00, 0.50, 0.13);
  if (i == 2) return vec3(1.00, 0.88, 0.22);
  if (i == 3) return vec3(0.22, 0.88, 0.42);
  if (i == 4) return vec3(0.22, 0.58, 0.96);
  if (i == 5) return vec3(0.45, 0.20, 0.92);
  return         vec3(0.92, 0.45, 1.00);
}

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  vec2 uv = (gl_FragCoord.xy / u_resolution);   // 0-1 normalized
  vec2 cuv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;

  // 7 vertical bands — each band's x range
  float bandSlot = uv.x * 7.0;            // 0-7
  int bandIdx = int(floor(bandSlot));
  if (bandIdx < 0) bandIdx = 0;
  if (bandIdx > 6) bandIdx = 6;
  float bandLocal = fract(bandSlot);      // 0-1 within band

  // ── Per-band audio energy mapping ──
  // Bass = root + sacral; Mid = solar/heart/throat; Treble = third-eye + crown
  float bandEnergy[7];
  bandEnergy[0] = u_bassPres   * 1.4 + u_bassHit  * 0.6;
  bandEnergy[1] = u_bassPres   * 1.0 + u_midHit   * 0.3;
  bandEnergy[2] = mix(u_bassPres, u_midPres, 0.5) + u_midHit * 0.5;
  bandEnergy[3] = u_midPres    * 1.4 + u_midHit   * 0.6;
  bandEnergy[4] = mix(u_midPres, u_treblePres, 0.5) + u_midHit * 0.4;
  bandEnergy[5] = u_treblePres * 1.0 + u_trebleHit * 0.5;
  bandEnergy[6] = u_treblePres * 1.4 + u_trebleHit * 0.7;

  float energy = 0.0;
  for (int i = 0; i < 7; i++) {
    if (i == bandIdx) energy = bandEnergy[i];
  }

  // Band height = base + audio modulation
  float baseH = 0.20;
  float bandH = baseH + u_audioReact * energy * u_bandHeight * 0.85;
  bandH = clamp(bandH, 0.0, 1.0);

  // ── Band fill (vertical bar) ──
  // Bar fills from bottom (uv.y=0) to height bandH.
  // Use a soft top edge for nicer falloff.
  float bandTop = bandH;
  float fillMask = smoothstep(bandTop, bandTop - 0.05, uv.y);
  // Don't fill below 0
  fillMask *= step(0.001, uv.y);

  // ── Band-side gap (visual separation) ──
  float gapStart = (1.0 - u_bandWidth) * 0.5;
  float sideMask = smoothstep(gapStart, gapStart + 0.02, bandLocal)
                 * smoothstep(1.0 - gapStart, 1.0 - gapStart - 0.02, bandLocal);

  // Band color
  vec3 bandColor;
  for (int i = 0; i < 7; i++) {
    if (i == bandIdx) bandColor = chakraCol(i);
  }

  // ── Vertical gradient inside band: brighter at top ──
  float vgrad = pow(uv.y / max(bandTop, 0.01), 0.6);
  vec3 fillCol = bandColor * (0.4 + 0.6 * vgrad);

  // ── Composite band ──
  vec3 col = fillCol * fillMask * sideMask;

  // ── Background sacred-geometry mandala (faint, behind bars) ──
  float bgR = length(cuv);
  float bgA = atan(cuv.y, cuv.x);
  float bgRing1 = smoothstep(0.012, 0.0, abs(bgR - 0.45));
  float bgRing2 = smoothstep(0.012, 0.0, abs(bgR - 0.72));
  float bgRays = smoothstep(0.93, 0.96, abs(cos(bgA * 7.0)));
  vec3 bgGeom = chakraCol(int(mod(u_time * 0.7, 7.0)))
              * (bgRing1 * 0.30 + bgRing2 * 0.18 + bgRays * 0.10 * exp(-bgR * 1.5));
  col += bgGeom * (1.0 - sideMask * fillMask * 0.7);

  // ── Top cap: bright glowing line at the current band height ──
  float capDist = abs(uv.y - bandTop);
  float capGlow = exp(-capDist * 70.0) * sideMask;
  col += bandColor * capGlow * (1.4 + u_glow * 0.8);
  // White-hot core of cap
  col += vec3(1.0, 0.96, 0.92) * exp(-capDist * 220.0) * sideMask * 0.65;

  // ── Band halo (soft glow extending outward and upward) ──
  float haloStrength = exp(-capDist * 14.0) * sideMask * u_glow * 0.55;
  col += bandColor * haloStrength * fillMask;
  // Side bleed (light bleeds horizontally from band tops)
  float topGlowSide = exp(-capDist * 25.0) * (1.0 - sideMask) * u_glow * 0.20;
  col += bandColor * topGlowSide * energy;

  // ── Ascending particles within active bands ──
  if (u_particleFlow > 0.01 && energy > 0.05) {
    for (int p = 0; p < 6; p++) {
      float fp = float(p);
      // Particle x: random within band
      float bandCenterX = (float(bandIdx) + 0.5) / 7.0;
      float jitter = (hash21(vec2(fp, float(bandIdx))) - 0.5) * (1.0/7.0) * 0.5;
      float px = bandCenterX + jitter;
      // Particle y: rises over time
      float life = fract(u_time * u_speed * 0.5 + fp * 0.16 + float(bandIdx) * 0.1);
      float py = life * bandTop;
      // Particle position relative to current pixel
      float dx = (uv.x - px) * 7.0;       // amplify x distance for thin particle
      float dy = uv.y - py;
      float dot_ = exp(-(dx*dx + dy*dy) * 600.0);
      float alpha = sin(life * 3.14159);
      col += bandColor * dot_ * alpha * u_particleFlow * energy * 1.3;
    }
  }

  // ── Bottom-edge floor reflection (subtle) ──
  float reflectionAlpha = (1.0 - smoothstep(0.0, 0.08, uv.y)) * 0.4;
  // Sample band at mirror position
  float mirrorY = -uv.y;
  if (mirrorY < bandTop) {
    col += bandColor * reflectionAlpha * fillMask * 0.3;
  }

  // ── Outer cosmic background ──
  vec3 bg = vec3(0.02, 0.015, 0.05);
  // Hue gradient across x — subtle chakra tint in background
  float bgT = uv.x;
  vec3 bgTint;
  for (int i = 0; i < 7; i++) {
    if (i == int(floor(bgT * 7.0))) bgTint = chakraCol(i);
  }
  bg += bgTint * 0.04;
  col += bg * (1.0 - fillMask * sideMask);

  // ── Outer halo overlay ──
  if (u_haloOuter > 0.01) {
    float r2d = length(cuv);
    vec3 hueT = chakraCol(int(mod(u_time * 0.6, 7.0)));
    col += hueT * exp(-r2d * 1.2) * u_haloOuter * 0.15 * (0.5 + u_bassPres);
  }

  // ── Beat-flash strobe across bottom ──
  float floorFlash = exp(-uv.y * 30.0) * u_beatOnset * 0.4;
  col += bandColor * floorFlash * sideMask;

  // ── Treble sparkle near band tops ──
  float topZone = smoothstep(0.0, 0.05, capDist) * smoothstep(0.10, 0.05, capDist);
  float spark = step(0.985, hash21(gl_FragCoord.xy + floor(u_time * 8.0))) * u_trebleHit;
  col += vec3(0.95, 0.95, 1.0) * spark * topZone * 1.5;

  // ── Tonemap + gamma + slight vignette ──
  col *= smoothstep(1.6, 0.5, length(cuv) * 0.7);
  col = col / (1.0 + col);
  col = pow(col, vec3(0.86));

  gl_FragColor = vec4(col, 1.0);
}
