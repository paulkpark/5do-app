precision highp float;
uniform float u_time;
uniform vec2  u_resolution;
uniform float u_bass;
uniform float u_mid;
uniform float u_treble;
uniform float u_beat;

uniform float u_rings;
uniform float u_breath;
uniform float u_glow;
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
  float breath = 1.0 + 0.12 * sin(u_time * u_breath) + u_bass * 0.28;
  float r2 = r * breath;

  float rings = 0.5 + 0.5 * sin(r2 * u_rings * 3.14159 - u_time * 0.6);
  float core  = exp(-r2 * r2 * 2.8) * 1.4;
  float halo  = exp(-pow(r2 - 0.55, 2.0) * 9.0) * 0.9;

  float v = (core + halo * rings) * u_glow;
  v = pow(v, 1.25);

  float hue = fract(u_hue + r2 * 0.12 + u_treble * 0.18);
  float sat = 0.75 - 0.35 * core;
  vec3 col = hsv2rgb(vec3(hue, sat, v));

  // Outer causal shimmer
  float outerBloom = exp(-pow(r2 - 0.95, 2.0) * 22.0) * 0.3 * (0.8 + u_mid);
  col += outerBloom * hsv2rgb(vec3(fract(hue + 0.12), 0.8, 1.0));

  col += u_beat * 0.3 * exp(-r2 * 2.0);
  col *= smoothstep(1.4, 0.25, r);
  // Palette tint (grayscale luminance → palette gradient)
  float _lum = clamp(dot(col, vec3(0.299, 0.587, 0.114)), 0.0, 1.0);
  vec3 _pal = _lum < 0.5
    ? mix(u_colorA, u_colorB, _lum * 2.0)
    : mix(u_colorB, u_colorC, (_lum - 0.5) * 2.0);
  col = mix(col, _pal * (0.55 + 0.9 * _lum), u_paletteMix);
  gl_FragColor = vec4(col, 1.0);
}
