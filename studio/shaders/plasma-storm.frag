#pragma use_lib palette
#pragma use_lib audio
precision highp float;
uniform float u_time;
uniform vec2  u_resolution;

// ── Preset parameters ──
uniform float u_speed;          // 0-2     overall flow
uniform float u_intensity;      // 0.5-2   plasma field strength
uniform float u_branches;       // 2-8     lightning branch density
uniform float u_volatility;     // 0-1     how chaotic / turbulent
uniform float u_glow;           // 0-2
uniform float u_palette;        // 0-1     hue offset
uniform float u_audioReact;     // 0-1
uniform float u_stormFront;     // 0-1     bass-driven storm wave

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float hash11(float p) {
  return fract(sin(p * 78.233) * 43758.5453);
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
float fbm(vec2 p) {
  float v = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 5; i++) {
    v += amp * vnoise(p);
    p *= 2.07; amp *= 0.5;
  }
  return v;
}

mat2 rot(float a) { return mat2(cos(a), -sin(a), sin(a), cos(a)); }

// SDF: capsule (lightning bolt segment) from origin to a point
float sdCapsule(vec2 p, vec2 b, float r) {
  vec2 pa = p, ba = b;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - r;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float r = length(uv);

  float t = u_time * u_speed;

  // ── Plasma field — multi-band sin waves on warped UV ──
  vec2 puv = uv * u_intensity;
  // Domain warp gives the field organic flow
  vec2 warp = vec2(fbm(puv * 1.5 + t * 0.4),
                   fbm(puv * 1.5 + vec2(5.0, 3.0) - t * 0.5)) * u_volatility;
  puv += warp * 0.6;

  float plasma = sin(puv.x * 4.0 + t * 1.5)
               + sin(puv.y * 4.0 + t * 1.7)
               + sin((puv.x + puv.y) * 3.0 + t * 1.3)
               + sin(length(puv) * 5.0 - t * 2.0);
  plasma = plasma * 0.25 + 0.5;     // normalize to 0..1

  // Bass-driven storm front (a moving wave that intensifies plasma in a band)
  float frontPos = fract(t * 0.2 + u_bassPres * 0.5) * 4.0 - 2.0;  // -2..2
  float front = exp(-pow(uv.x - frontPos, 2.0) * 4.0) * u_stormFront;
  plasma += front * (0.5 + u_bassHit * 0.8);

  // ── Lightning branches — N capsules from random origins to random ends ──
  // Slower lifetime (3 Hz instead of 6 Hz) gives bolts more "screen time".
  float lightning = 0.0;
  float lightningHalo = 0.0;
  int B = int(clamp(u_branches, 1.0, 8.0));
  float lifetime = floor(t * 3.0);
  float life = fract(t * 3.0);                // 0-1 within lifetime
  for (int i = 0; i < 8; i++) {
    if (i >= B) break;
    float fi = float(i);
    vec2 src = vec2(
      hash21(vec2(fi, lifetime)) * 1.6 - 0.8,
      hash21(vec2(fi + 31.0, lifetime)) * 1.6 - 0.8
    );
    vec2 dst = vec2(
      hash21(vec2(fi + 13.0, lifetime + 1.0)) * 1.6 - 0.8,
      hash21(vec2(fi + 71.0, lifetime + 1.0)) * 1.6 - 0.8
    );
    // Multiple jagged segments — jagged path, not a capsule
    vec2 prev = src;
    int SEG = 5;
    for (int k = 0; k < 5; k++) {
      if (k >= SEG) break;
      float kt = (float(k) + 1.0) / float(SEG);
      vec2 base = mix(src, dst, kt);
      // Lateral jitter perpendicular to bolt direction
      vec2 dir = normalize(dst - src + 0.0001);
      vec2 perp = vec2(-dir.y, dir.x);
      float jit = (hash21(vec2(fi * 13.0 + float(k), lifetime + 5.0)) - 0.5);
      base += perp * jit * 0.18;
      vec2 next = base;
      // Capsule from prev → next
      float bw = 0.012 + 0.012 * hash21(vec2(fi + float(k), lifetime + 2.0));
      float d = sdCapsule(uv - prev, next - prev, bw);
      // Sharp white core + wide soft halo (electric corona)
      float core = exp(-d * d * 600.0);
      float halo = exp(-d * d * 24.0) * 0.45;
      lightning     += core;
      lightningHalo += halo;
      prev = next;
    }
  }
  // Bolt fade across lifetime: bright at start (< 0.3), then quick falloff
  float fade = smoothstep(1.0, 0.0, life * 1.4);
  lightning *= fade;
  lightningHalo *= fade;
  lightning *= 1.5 + u_audioReact * u_beatOnset * 2.5;
  lightningHalo *= 1.2 + u_audioReact * u_beatOnset * 1.5;

  // ── Color palette ──
  float plasmaHue = fract(u_palette + plasma * 0.4 + t * 0.03);
  vec3 plasmaCol = palette(plasmaHue);
  // Bias toward electric blue/violet
  plasmaCol = mix(plasmaCol, vec3(0.5, 0.6, 1.4), 0.4);

  // Bright lightning is white-hot
  vec3 boltCol = vec3(1.4, 1.2, 1.6);

  // ── Compose ──
  vec3 col = plasmaCol * pow(plasma, 1.4) * (0.8 + u_glow * 0.6);
  col += boltCol * lightning * 1.6;
  col += plasmaCol * lightningHalo * 1.4;     // colored corona around bolts

  // Beat-driven sky flash (whole field briefly pulses)
  col += plasmaCol * u_beatOnset * u_audioReact * 0.35;

  // ── Subtle dark stormy backdrop ──
  vec3 bg = vec3(0.025, 0.018, 0.045);
  col += bg;

  // ── Treble: high-freq spark noise ──
  float spark = step(0.995, hash21(gl_FragCoord.xy + floor(t * 12.0))) * u_trebleHit;
  col += vec3(0.9, 0.95, 1.0) * spark * 1.5;

  // Vignette + tonemap + gamma
  col *= smoothstep(2.0, 0.30, r);
  col = col / (1.0 + col);
  col = pow(col, vec3(0.86));

  gl_FragColor = vec4(col, 1.0);
}
