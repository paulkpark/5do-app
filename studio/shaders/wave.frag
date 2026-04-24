#pragma use_lib palette
#pragma use_lib audio
precision highp float;
uniform float u_time;
uniform vec2  u_resolution;

// Karleido module target: texture_warp (but without an input texture —
// we use a synthetic stripe pattern as the source and warp it heavily).
uniform float u_speed;      // 0-2
uniform float u_warpAmt;    // 0-1     warp intensity
uniform float u_stripeFreq; // 2-20    stripe density of the synthetic source
uniform float u_spiral;     // 0-1     rotational twist with radius
uniform float u_mirror;     // 0/1     mirror fold the pattern
uniform float u_glow;       // 0-1.5

mat2 rot2(float a) { return mat2(cos(a), -sin(a), sin(a), cos(a)); }

// Cheap 2D value noise
float hash21(vec2 p) {
  p = fract(p * vec2(234.17, 453.12));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}
float n2(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i), hash21(i + vec2(1,0)), f.x),
    mix(hash21(i + vec2(0,1)), hash21(i + vec2(1,1)), f.x),
    f.y
  );
}

// Synthetic source pattern — diagonal stripe with interference
vec3 sourcePattern(vec2 uv, float t) {
  float f = u_stripeFreq;
  float stripe = 0.5 + 0.5 * sin(uv.x * f + uv.y * f * 0.6 + t * 1.1);
  stripe *= 0.5 + 0.5 * sin(uv.y * f * 0.8 - uv.x * f * 0.4 - t * 0.9);
  return palette(fract(stripe * 0.7 + t * 0.08));
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;

  float t = u_time * u_speed * 0.50;

  // Optional mirror fold
  if (u_mirror > 0.5) uv = abs(uv);

  // Spiral rotation per radius
  float r = length(uv);
  uv = rot2(r * u_spiral * 3.2 + t * 0.4) * uv;

  // Domain warp using noise — gives melting / liquid feel
  vec2 w1 = vec2(
    n2(uv * 1.5 + vec2(t * 0.3, 0.0)),
    n2(uv * 1.5 + vec2(0.0, t * 0.35))
  ) - 0.5;
  vec2 w2 = vec2(
    n2(uv * 3.2 + w1 * 2.0 - vec2(t * 0.5, 0.0)),
    n2(uv * 3.2 + w1 * 2.0 + vec2(0.0, t * 0.6))
  ) - 0.5;

  vec2 warped = uv + w2 * u_warpAmt * 1.4;

  // Beat shockwave — radial ripple on each kick
  float shock = u_beatOnset * 0.25;
  warped += normalize(uv + 1e-6) * shock * sin(r * 14.0 - t * 10.0) * 0.08;

  vec3 col = sourcePattern(warped, t);

  // Additional audio-driven emission
  col += palette(fract(0.4 + t * 0.15)) * u_trebleHit * 0.35;

  // Center glow
  col += palette(fract(0.5 + t * 0.1)) * exp(-r * 2.3) * u_glow * (0.3 + u_beatOnset * 1.1);

  // Vignette
  col *= smoothstep(1.9, 0.3, r);
  col = pow(max(col, 0.0), vec3(0.88));
  gl_FragColor = vec4(col, 1.0);
}
