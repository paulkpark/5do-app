#pragma use_lib palette
#pragma use_lib audio
precision highp float;
uniform float u_time;
uniform vec2  u_resolution;

uniform float u_speed;         // 0-2
uniform float u_symmetry;      // 3-24   radial sectors
uniform float u_iterations;    // 1-6    IFS iterations (spins up detail)
uniform float u_complexity;    // 0-1    pattern frequency multiplier
uniform float u_bloom;         // 0-1.5  center bloom
uniform float u_beatPulse;     // 0/1    beat-driven zoom pump

mat2 rot(float a) { return mat2(cos(a), -sin(a), sin(a), cos(a)); }

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;

  // Beat pump (expanding ring on kicks)
  uv *= 1.0 - u_beatPulse * u_beatOnset * 0.18;

  // N-fold kaleidoscopic fold
  float N = max(3.0, floor(u_symmetry + 0.5));
  float sector = 6.28318530718 / N;
  float r = length(uv);
  float a = atan(uv.y, uv.x);
  a = mod(a + sector * 0.5, sector) - sector * 0.5;
  vec2 p = vec2(cos(a), sin(a)) * r;

  // 2D IFS iteration — each pass folds + scales, progressively detailing the rosette
  float t = u_time * u_speed * 0.40;
  int iter = int(clamp(u_iterations, 1.0, 6.0));
  float detail = 0.0;
  float weight = 1.0;
  vec2  q = p * (1.2 + u_complexity);
  for (int i = 0; i < 6; i++) {
    if (i >= iter) break;
    q = abs(q) - 0.35;
    q = rot(t * 0.25 + float(i) * 0.6) * q;
    q *= 1.45;
    detail += weight * (sin(q.x * 4.0) * cos(q.y * 4.0));
    weight *= 0.55;
  }

  // Pattern mixes IFS detail + concentric rings + radial bands
  float pattern  = 0.5 + 0.5 * detail;
  pattern += 0.35 * sin(r * (12.0 + u_complexity * 20.0) - t * 3.0 + u_trebleHit * 2.5);
  pattern += 0.25 * cos(a * N - t * 1.2 + u_bassPres * 3.0);
  pattern = clamp(pattern, 0.0, 1.2);

  // Palette sweep
  float pt = fract(pattern * 0.85 + t * 0.05 + u_beatPhase * 0.1);
  vec3 col = palette(pt);

  // Shade via squared pattern for deeper contrast
  col *= pow(clamp(pattern, 0.0, 1.0), 1.25);

  // Center bloom on beat
  float centerGlow = exp(-r * 3.2) * u_bloom;
  col += palette(fract(0.25 + t * 0.1)) * centerGlow * (0.45 + u_beatOnset * 1.6);

  // Vignette
  col *= smoothstep(1.7, 0.25, r);
  col = pow(col, vec3(0.88));

  gl_FragColor = vec4(col, 1.0);
}
