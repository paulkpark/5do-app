precision highp float;
uniform float u_time;
uniform vec2  u_resolution;
uniform float u_bass;
uniform float u_mid;
uniform float u_treble;
uniform float u_beat;

uniform float u_scale;
uniform float u_speed;
uniform float u_hue;
uniform float u_intensity;

uniform vec3  u_colorA;
uniform vec3  u_colorB;
uniform vec3  u_colorC;
uniform float u_paletteMix;

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x),
             mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p *= 2.03; a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  vec2 p = uv * u_scale * (1.0 + u_bass * 0.25);
  float t = u_time * u_speed;

  vec2 q = vec2(fbm(p + t * 0.11),
                fbm(p + vec2(1.7, 9.2) + t * 0.13));
  vec2 r = vec2(fbm(p + 2.0 * q + t * 0.2 + 4.1),
                fbm(p + 2.0 * q + t * 0.15 + vec2(8.3, 2.8)));
  float f = fbm(p + 2.0 * r);

  float hue = fract(u_hue + f * 0.35 + u_treble * 0.2);
  float sat = 0.55 + 0.4 * sin(f * 3.14159 + t);
  float val = pow(f, 1.5) * u_intensity + u_beat * 0.25;

  vec3 col = hsv2rgb(vec3(hue, sat, val));
  col *= smoothstep(1.6, 0.2, length(uv));
  // Palette tint (grayscale luminance → palette gradient)
  float _lum = clamp(dot(col, vec3(0.299, 0.587, 0.114)), 0.0, 1.0);
  vec3 _pal = _lum < 0.5
    ? mix(u_colorA, u_colorB, _lum * 2.0)
    : mix(u_colorB, u_colorC, (_lum - 0.5) * 2.0);
  col = mix(col, _pal * (0.55 + 0.9 * _lum), u_paletteMix);
  gl_FragColor = vec4(col, 1.0);
}
