#pragma use_lib palette
#pragma use_lib audio
precision highp float;
uniform float u_time;
uniform vec2  u_resolution;

uniform float u_speed;     // 0-2
uniform float u_count;     // 3-12  number of metaballs
uniform float u_radius;    // 0.05-0.25
uniform float u_flow;      // 0-1   orbit eccentricity
uniform float u_smoothk;   // 0.05-0.5  union smoothness
uniform float u_glow;      // 0-1.5

// Polynomial smooth-min (Quilez)
float sminPoly(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

vec2 ballPos(float i, float total, float t) {
  // Orbit: each ball on a tilted ellipse with distinct period
  float phase = i / max(total, 1.0) * 6.28318530718;
  float period = 0.75 + 0.5 * sin(i * 1.7);
  float r      = 0.45 + 0.25 * u_flow * sin(t * 0.6 + phase * 2.0);
  float ecc    = 1.0 + 0.5 * sin(i * 3.1);
  return vec2(
    r * ecc * cos(phase + t * period),
    r       * sin(phase + t * period)
  );
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;

  float t = u_time * u_speed * 0.60;
  float total = clamp(u_count, 3.0, 12.0);
  int   N     = int(total);

  // Beat-driven radius swell + audio per-ball jitter
  float rBase  = u_radius * (1.0 + 0.35 * u_bassPres + 0.5 * u_bassHit);

  // Field = smooth union of SDF circles (metaballs)
  float d = 1e9;
  for (int i = 0; i < 12; i++) {
    if (i >= N) break;
    float fi = float(i);
    vec2 bp = ballPos(fi, total, t);
    float rr = rBase * (1.0 + 0.25 * sin(t * 1.7 + fi * 1.3));
    float di = length(uv - bp) - rr;
    d = sminPoly(d, di, u_smoothk);
  }

  // Fill & core glow from distance
  float inside = smoothstep(0.02, -0.01, d);
  float core   = smoothstep(0.16, 0.0, abs(d));

  // Palette driven by angle + time — creates flowing color across surface
  float ang = atan(uv.y, uv.x);
  float pt  = fract(ang / 6.283 + t * 0.08 + u_bassPres * 0.25);
  vec3 col = palette(pt);

  // Compose: bright core + soft halo
  vec3 halo = palette(fract(pt + 0.2)) * core * (0.7 + u_glow);
  col = col * inside + halo * (1.0 - inside) * (0.45 + u_beatOnset * 1.4);

  // Distant field glow
  float r = length(uv);
  col += exp(-r * 2.4) * palette(fract(0.3 + t * 0.1)) * u_glow * 0.15;

  col *= smoothstep(1.9, 0.3, r);
  col = pow(col, vec3(0.88));
  gl_FragColor = vec4(col, 1.0);
}
