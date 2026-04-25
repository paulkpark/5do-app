#pragma use_lib palette
#pragma use_lib audio
precision highp float;
uniform float u_time;
uniform vec2  u_resolution;

// ── Preset parameters ──
uniform float u_speed;          // 0-1     pulse rate
uniform float u_organCount;     // 4-9     number of bioluminescent organs
uniform float u_smoothness;     // 0.05-0.4 smooth-min blend
uniform float u_breathRate;     // 0.3-1.5 breath cycles per ~10s
uniform float u_glow;           // 0-2
uniform float u_audioReact;     // 0-1
uniform float u_palette;        // 0-1
uniform float u_membraneEdge;   // 0-1     visible cell-membrane outline

// Smooth min (Quilez polynomial)
float sminPoly(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// Cell SDF — circle with audio-driven radius
float sdOrgan(vec2 p, vec2 c, float r) {
  return length(p - c) - r;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;

  float t = u_time * u_speed;

  // ── Breath cycle ──
  // Slow inhale/exhale that scales the whole composition
  float breath = 1.0 + 0.10 * sin(t * u_breathRate);

  // ── Compose multiple bioluminescent organs ──
  float fieldDist = 1e6;       // SDF accumulator (smooth-min unions)
  vec3  fieldCol  = vec3(0.0);
  float fieldWeight = 0.0;

  int N = int(clamp(u_organCount, 3.0, 9.0));
  for (int i = 0; i < 9; i++) {
    if (i >= N) break;
    float fi = float(i);
    // Each organ has a unique orbit + size + pulse phase
    float baseAng  = fi * (6.28318 / float(N)) + 0.3 * sin(fi * 2.1);
    float baseR    = 0.45 + 0.18 * hash21(vec2(fi, 1.0));
    float orbSpeed = 0.10 + 0.10 * hash21(vec2(fi, 2.0));
    float ang  = baseAng + t * orbSpeed * (hash21(vec2(fi, 3.0)) > 0.5 ? 1.0 : -1.0);
    vec2 c = vec2(cos(ang), sin(ang)) * baseR;
    // Slight breathing of orbital radius
    c *= breath;

    // Audio-driven pulse — different organs respond to different bands
    float energy;
    if      (i < 2) energy = u_bassPres + u_bassHit * 0.5;
    else if (i < 5) energy = u_midPres  + u_midHit  * 0.5;
    else            energy = u_treblePres + u_trebleHit * 0.5;
    float baseRadius = 0.13 + 0.04 * hash21(vec2(fi, 4.0));
    float r = baseRadius * (1.0 + u_audioReact * energy * 0.45)
            * (1.0 + 0.08 * sin(t * 1.5 + fi * 1.7));

    float d = sdOrgan(uv, c, r);
    fieldDist = sminPoly(fieldDist, d, u_smoothness);

    // Per-organ chakra hue — color the field where this organ dominates
    float hueT = fract(u_palette + fi * 0.135 + t * 0.02);
    vec3 hue = palette(hueT);
    // Bias toward bioluminescent green/teal/pink
    hue = mix(hue, vec3(0.4, 0.95, 0.7), 0.25);
    // Closer organ has more weight in the color blend (inverse distance)
    float weight = exp(-length(uv - c) * 2.0);
    fieldCol += hue * weight * (0.6 + 0.4 * energy);
    fieldWeight += weight;
  }
  if (fieldWeight > 0.01) fieldCol /= fieldWeight;

  // ── Render the organ field ──
  // Inside the field (negative SDF) → fill brightly, outside → halo glow
  float inside = smoothstep(0.005, -0.05, fieldDist);
  float core   = smoothstep(0.20, -0.05, fieldDist);
  float halo   = exp(-fieldDist * fieldDist * 12.0);

  vec3 col = vec3(0.0);
  col += fieldCol * core * 0.85;
  col += fieldCol * halo * (0.45 + u_glow * 0.4);

  // ── Cell-membrane outline (Karleido feeling-forms style edge) ──
  if (u_membraneEdge > 0.01) {
    float edgeDist = abs(fieldDist);
    float edge = smoothstep(0.012, 0.0, edgeDist);
    col += fieldCol * 1.4 * edge * u_membraneEdge;
  }

  // ── Internal flowing veins (subtle linear gradient inside organs) ──
  float veins = sin(uv.x * 30.0 + uv.y * 15.0 + t * 1.2) * 0.5 + 0.5;
  veins *= inside * 0.15;
  col += fieldCol * veins;

  // ── Beat shockwave through the cell field ──
  float shockR = u_beatPhase * 1.2;
  float shock = exp(-pow(length(uv) - shockR, 2.0) * 60.0) * u_beatOnset;
  col += fieldCol * shock * 0.5 * u_audioReact;

  // ── Background — bio-warm dark ──
  vec3 bg = vec3(0.025, 0.018, 0.045);
  col += bg;

  // Vignette + tonemap + gamma
  col *= smoothstep(1.95, 0.30, length(uv));
  col = col / (1.0 + col);
  col = pow(col, vec3(0.86));

  gl_FragColor = vec4(col, 1.0);
}
