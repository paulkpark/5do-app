#pragma use_lib palette
#pragma use_lib audio
precision highp float;
uniform float u_time;
uniform vec2  u_resolution;

uniform float u_speed;      // 0-2
uniform float u_scale;      // 0.3-3.0  base noise frequency
uniform float u_warp;       // 0-1      domain-warp intensity
uniform float u_twist;      // 0-1      rotational shear with depth
uniform float u_tunnel;     // 0/1      1 = 1/r tunnel mode
uniform float u_glow;       // 0-1.5

// Cheap 3D hash-noise — smooth enough for organic flow
float hash31(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}
float noise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash31(i);
  float n100 = hash31(i + vec3(1,0,0));
  float n010 = hash31(i + vec3(0,1,0));
  float n110 = hash31(i + vec3(1,1,0));
  float n001 = hash31(i + vec3(0,0,1));
  float n101 = hash31(i + vec3(1,0,1));
  float n011 = hash31(i + vec3(0,1,1));
  float n111 = hash31(i + vec3(1,1,1));
  return mix(
    mix(mix(n000,n100,f.x), mix(n010,n110,f.x), f.y),
    mix(mix(n001,n101,f.x), mix(n011,n111,f.x), f.y),
    f.z
  );
}
float fbm(vec3 p) {
  float sum = 0.0, amp = 0.5;
  for (int i = 0; i < 4; i++) { sum += amp * noise(p); p *= 2.07; amp *= 0.5; }
  return sum;
}

mat2 rot2(float a) { return mat2(cos(a), -sin(a), sin(a), cos(a)); }

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;

  float t = u_time * u_speed * 0.35;

  // Optional tunnel projection — zoom toward center
  if (u_tunnel > 0.5) {
    float r0 = length(uv);
    uv = uv / max(r0, 0.08);
    uv *= 0.6 + 0.4 / max(r0, 0.1);
  }

  // Twist: rotate based on radial distance + time
  uv = rot2(length(uv) * u_twist * 2.5 + t * 0.3) * uv;

  // Domain-warp fBm — noise coords are themselves driven by fBm
  vec3 p = vec3(uv * u_scale, t * 0.6);
  vec3 warp = vec3(
    fbm(p + vec3(0.0, 0.0, t * 0.5)),
    fbm(p + vec3(5.2, 1.3, t * 0.7)),
    fbm(p + vec3(3.1, 7.9, t * 0.3))
  ) * u_warp * 2.2;
  float v = fbm(p + warp);
  v += 0.4 * fbm(p * 2.5 - warp) * (0.5 + u_midPres);

  // Beat-hit surface ripple
  v += u_bassHit * 0.22 * sin(length(uv) * 18.0 - t * 8.0);

  // Stretch fBm to use full 0-1 range — default fBm hugs 0.4-0.6, looks washed out
  v = smoothstep(0.25, 0.85, v);

  // Palette
  float pt = fract(v * 1.4 + t * 0.06 + u_bassPres * 0.25);
  vec3 col = palette(pt);

  // Brightness from noise value — highlights organic plumes. Keep at least 15% floor
  // so dark regions still show hue, not muddy black.
  col *= 0.15 + 0.85 * pow(v, 0.85);

  // Bloom ignited by beats
  float r = length(uv);
  col += palette(fract(0.5 + t * 0.2)) * exp(-r * 2.0) * u_glow * (0.3 + u_beatOnset * 1.2);

  col *= smoothstep(2.0, 0.3, r);
  col = pow(col, vec3(0.88));
  gl_FragColor = vec4(col, 1.0);
}
