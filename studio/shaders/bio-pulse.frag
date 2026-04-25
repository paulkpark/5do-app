#pragma use_lib palette
#pragma use_lib audio
precision highp float;
uniform float u_time;
uniform vec2  u_resolution;

// ── Preset parameters ──
uniform float u_speed;          // 0-1     overall flow
uniform float u_cellCount;      // 3-9     visible cells
uniform float u_pulseRate;      // 0.5-2   heartbeat speed
uniform float u_organelleSize;  // 0.05-0.3 organelle radius
uniform float u_membraneGlow;   // 0-2     cell wall glow
uniform float u_audioReact;     // 0-1
uniform float u_palette;        // 0-1
uniform float u_zoom;           // 0.5-2

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1, 0));
  float c = hash21(i + vec2(0, 1));
  float d = hash21(i + vec2(1, 1));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  uv *= max(u_zoom, 0.3);

  float t = u_time * u_speed;

  // ── Heartbeat pulse ──
  // Two-beat heart pattern: lub-dub
  float beatT = fract(t * u_pulseRate);
  float lub = exp(-pow(beatT - 0.0, 2.0) * 60.0);
  float dub = exp(-pow(beatT - 0.30, 2.0) * 80.0);
  float pulse = max(lub, dub * 0.7);
  // Audio-driven secondary pulse
  pulse = max(pulse, u_bassHit * u_audioReact);

  vec3 col = vec3(0.0);
  float fieldDist = 1e6;
  vec3  fieldCol  = vec3(0.0);
  float fieldWeight = 0.0;

  // ── Multiple cells, each at orbiting position ──
  int N = int(clamp(u_cellCount, 3.0, 9.0));
  for (int i = 0; i < 9; i++) {
    if (i >= N) break;
    float fi = float(i);
    float baseAng  = fi * (6.28318 / float(N)) + 0.4 * sin(fi * 2.4);
    float baseR    = 0.55 + 0.20 * hash21(vec2(fi, 1.0));
    float orbSpd   = 0.06 + 0.06 * hash21(vec2(fi, 2.0));
    float dir = (hash21(vec2(fi, 3.0)) > 0.5 ? 1.0 : -1.0);
    float ang = baseAng + t * orbSpd * dir;
    vec2 c = vec2(cos(ang), sin(ang)) * baseR;
    // Cell pulse
    float cellPulse = 1.0 + 0.06 * pulse;
    float cellR = (0.18 + 0.05 * hash21(vec2(fi, 4.0))) * cellPulse;
    float cellD = length(uv - c) - cellR;
    fieldDist = min(fieldDist, cellD);

    // Per-cell tint
    float hueT = fract(u_palette + fi * 0.13 + t * 0.02);
    vec3 hue = palette(hueT);
    hue = mix(hue, vec3(0.5, 0.95, 0.7), 0.3);  // bio-luminous bias
    float weight = exp(-length(uv - c) * 1.5);
    fieldCol += hue * weight;
    fieldWeight += weight;
  }
  if (fieldWeight > 0.01) fieldCol /= fieldWeight;

  // ── Render cells ──
  float inside = smoothstep(0.005, -0.05, fieldDist);
  // Membrane outline (sharp ring around each cell)
  float membrane = smoothstep(0.012, 0.0, abs(fieldDist));
  // Soft cytoplasm fill
  float fill = smoothstep(0.20, -0.05, fieldDist);

  col += fieldCol * fill * 0.55;
  col += fieldCol * membrane * (1.0 + u_membraneGlow);

  // ── Organelles inside cells (mitochondria, nuclei) ──
  // Sample noise inside cells — bright spots = organelles
  float noiseSamp = vnoise(uv * 18.0 - t * 0.4);
  float organelle = smoothstep(0.6, 0.85, noiseSamp) * inside;
  vec3 orgCol = mix(vec3(0.95, 0.7, 0.95), vec3(0.95, 0.95, 0.5), noiseSamp);
  col += orgCol * organelle * (0.85 + u_audioReact * u_midHit);

  // ── Heartbeat ripple — concentric wave from center on each pulse ──
  float ripR = beatT * 1.2;
  float ripple = exp(-pow(length(uv) - ripR, 2.0) * 30.0) * pulse;
  col += fieldCol * ripple * 0.5;

  // ── Background — warm dark cytoplasm ──
  vec3 bg = vec3(0.025, 0.020, 0.035);
  col += bg;

  // Glow boost
  col += col * u_membraneGlow * 0.20;

  // Treble micro-shimmer (cellular fluid sparkle)
  float spark = step(0.985, hash21(uv * 60.0 + floor(t * 6.0))) * u_trebleHit;
  col += vec3(0.95, 0.97, 1.0) * spark * 0.8 * inside;

  // Vignette + tonemap + gamma
  col *= smoothstep(2.0, 0.30, length(uv));
  col = col / (1.0 + col);
  col = pow(col, vec3(0.86));

  gl_FragColor = vec4(col, 1.0);
}
