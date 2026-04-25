#pragma use_lib palette
#pragma use_lib audio
precision highp float;
uniform float u_time;
uniform vec2  u_resolution;

// ── Preset parameters ──
uniform float u_speed;          // 0-1     overall flow (very slow by design)
uniform float u_voidSize;       // 0.15-0.5 central void radius
uniform float u_breathRate;     // 0.2-1   breath cycles per ~10s
uniform float u_particleCount;  // 0-1     drifting particles density
uniform float u_glow;           // 0-1.5
uniform float u_audioReact;     // 0-0.5   intentionally subtle for ambient
uniform float u_palette;        // 0-1
uniform float u_dustHaze;       // 0-1     subtle background haze

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1,0)), f.x),
             mix(hash21(i + vec2(0,1)), hash21(i + vec2(1,1)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0; float a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * vnoise(p); p *= 2.07; a *= 0.5; }
  return v;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float r = length(uv);

  float t = u_time * u_speed * 0.5;

  // ── Slow breath cycle ──
  float breath = 0.5 + 0.5 * sin(t * u_breathRate);

  // ── Central void ──
  // The "void" is a soft dark sphere — a meditative absence at center.
  // It breathes (radius wobbles) and has a faint inner glow.
  float voidR = u_voidSize * (0.92 + breath * 0.16);
  float voidEdge = abs(r - voidR);
  float voidMask = smoothstep(voidR + 0.08, voidR - 0.06, r);

  // Inner glow at the void's edge — soft halo
  float voidHalo = exp(-voidEdge * voidEdge * 50.0);

  // ── Background haze ──
  // Very faint cosmic dust fill
  vec3 col = vec3(0.018, 0.014, 0.04);
  if (u_dustHaze > 0.01) {
    float haze = fbm(uv * 1.4 + t * 0.1) - 0.4;
    haze = max(0.0, haze) * u_dustHaze;
    vec3 hazeCol = palette(fract(u_palette + 0.5 + t * 0.02));
    col += hazeCol * haze * 0.10;
  }

  // ── Void halo glow ──
  vec3 glowCol = palette(fract(u_palette + t * 0.02));
  col += glowCol * voidHalo * (0.4 + u_glow * 0.6) * (0.7 + 0.3 * breath);
  // Audio-very-subtle bass response
  col += glowCol * voidHalo * u_bassPres * u_audioReact * 0.4;

  // ── Drifting particles ──
  // Slow-moving sparse points around the void
  if (u_particleCount > 0.01) {
    int pN = int(8.0 + u_particleCount * 16.0);
    for (int p = 0; p < 24; p++) {
      if (p >= pN) break;
      float fp = float(p);
      // Each particle has a slow random drift
      vec2 ppos;
      ppos.x = (hash21(vec2(fp, 0.0)) - 0.5) * 3.0;
      ppos.y = (hash21(vec2(fp, 1.0)) - 0.5) * 2.0;
      // Drift over time
      float driftAng = t * 0.04 * (hash21(vec2(fp, 2.0)) > 0.5 ? 1.0 : -1.0);
      mat2 rt = mat2(cos(driftAng), -sin(driftAng), sin(driftAng), cos(driftAng));
      ppos = rt * ppos;
      // Skip particles inside the void
      if (length(ppos) < voidR * 0.9) continue;
      float dot_ = exp(-dot(uv - ppos, uv - ppos) * 1500.0);
      // Particle hue varies subtly
      vec3 pcol = palette(fract(u_palette + fp * 0.13 + t * 0.05));
      float alpha = 0.4 + 0.6 * sin(t + fp * 0.7);
      col += pcol * dot_ * alpha * (0.7 + u_trebleHit * 0.5);
    }
  }

  // ── The void itself stays dark (slight tint of palette) ──
  vec3 voidTint = palette(fract(u_palette + 0.7)) * 0.08;
  col = mix(col, voidTint * (0.3 + 0.7 * breath), voidMask);

  // ── Treble whisper sparkle (very rare) ──
  float starG = floor(hash21(gl_FragCoord.xy * 0.5) * 1000.0);
  float spark = step(0.999, hash21(vec2(starG, floor(t)))) * u_trebleHit;
  col += vec3(0.95) * spark * 0.4;

  // Vignette + soft tonemap + gamma
  col *= smoothstep(2.2, 0.30, r);
  col = col / (1.0 + col);
  col = pow(col, vec3(0.88));

  gl_FragColor = vec4(col, 1.0);
}
