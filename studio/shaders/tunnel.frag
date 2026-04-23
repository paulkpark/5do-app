precision highp float;
uniform float u_time;
uniform vec2  u_resolution;
uniform float u_bass;
uniform float u_mid;
uniform float u_treble;
uniform float u_beat;

uniform float u_rings;
uniform float u_speed;
uniform float u_twist;
uniform float u_hue;

uniform vec3  u_colorA;
uniform vec3  u_colorB;
uniform vec3  u_colorC;
uniform float u_paletteMix;

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float r = length(uv);
  float a = atan(uv.y, uv.x);
  float t = u_time * u_speed;

  float z = 1.0 / max(0.02, r) + t * (1.0 + u_bass * 1.2);
  float theta = a + u_twist * z * 0.25 + t * 0.15;

  float ring = sin(z * u_rings);
  float stripe = sin(theta * 10.0);
  float hue = fract(u_hue + z * 0.08 + u_treble * 0.2);
  float v = 0.35 + 0.65 * ring * stripe;
  v *= smoothstep(0.0, 0.7, r * 1.2); // fade center
  vec3 col = hsv2rgb(vec3(hue, 0.85, max(0.0, v)));

  // Depth fade + beat flash
  col *= smoothstep(1.6, 0.15, r);
  col += u_beat * 0.35 * vec3(1.0) * (1.0 - smoothstep(0.0, 0.6, r));
  // Palette tint (grayscale luminance → palette gradient)
  float _lum = clamp(dot(col, vec3(0.299, 0.587, 0.114)), 0.0, 1.0);
  vec3 _pal = _lum < 0.5
    ? mix(u_colorA, u_colorB, _lum * 2.0)
    : mix(u_colorB, u_colorC, (_lum - 0.5) * 2.0);
  col = mix(col, _pal * (0.55 + 0.9 * _lum), u_paletteMix);
  gl_FragColor = vec4(col, 1.0);
}
