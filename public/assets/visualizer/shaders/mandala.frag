precision highp float;
uniform float u_time;
uniform vec2  u_resolution;
uniform float u_bass;
uniform float u_mid;
uniform float u_treble;
uniform float u_beat;

uniform float u_symmetry;
uniform float u_zoom;
uniform float u_speed;
uniform float u_hueShift;
uniform float u_saturation;

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
  uv *= u_zoom * (1.0 + u_bass * 0.35);

  float r = length(uv);
  float a = atan(uv.y, uv.x);
  float N = max(3.0, u_symmetry);
  float sector = 6.28318530718 / N;
  a = mod(a + sector * 0.5, sector) - sector * 0.5;
  vec2 p = vec2(cos(a), sin(a)) * r;

  float t = u_time * u_speed;
  float pattern = sin(p.x * 10.0 + t * 1.3) * cos(p.y * 10.0 - t * 0.9);
  pattern += sin(r * 20.0 - t * 2.0 + u_treble * 5.0) * 0.8;
  pattern += cos(length(p * 6.0) - t) * 0.4;
  pattern = 0.5 + 0.5 * pattern;

  float hue = fract(u_hueShift + pattern * 0.35 + t * 0.05);
  vec3 col = hsv2rgb(vec3(hue, u_saturation, pow(pattern, 1.2)));

  col += u_beat * 0.35 * vec3(1.0, 0.85, 0.65) * smoothstep(1.0, 0.0, r);
  col *= smoothstep(1.6, 0.2, r);
  // Palette tint (grayscale luminance → palette gradient)
  float _lum = clamp(dot(col, vec3(0.299, 0.587, 0.114)), 0.0, 1.0);
  vec3 _pal = _lum < 0.5
    ? mix(u_colorA, u_colorB, _lum * 2.0)
    : mix(u_colorB, u_colorC, (_lum - 0.5) * 2.0);
  col = mix(col, _pal * (0.55 + 0.9 * _lum), u_paletteMix);
  gl_FragColor = vec4(col, 1.0);
}
