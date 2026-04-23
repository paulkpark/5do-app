precision highp float;
uniform float u_time;
uniform vec2  u_resolution;
uniform float u_bass;
uniform float u_mid;
uniform float u_treble;
uniform float u_beat;

uniform float u_density;
uniform float u_size;
uniform float u_speed;
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
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  vec2 p = uv * u_density;
  vec2 cell = floor(p);
  vec2 f = fract(p) - 0.5;

  float h1 = hash(cell);
  float h2 = hash(cell + vec2(17.3, 31.7));
  vec2 offs = (vec2(h1, h2) - 0.5) * 0.8;
  offs += 0.3 * vec2(
    sin(u_time * u_speed + h1 * 6.28318),
    cos(u_time * u_speed * 0.83 + h2 * 6.28318)
  );

  float d = length(f - offs);
  float sz = u_size * (1.0 + u_bass * 1.2 + u_beat * 0.6);
  float dot = smoothstep(sz, sz * 0.4, d);

  float hue = fract(u_hue + h1 * 0.3 + u_treble * 0.15);
  vec3 col = hsv2rgb(vec3(hue, 0.8, 1.0)) * dot;

  // Connecting halo for strong bass
  float halo = smoothstep(sz * 3.0, sz, d) * u_bass * 0.3;
  col += halo * hsv2rgb(vec3(hue, 0.6, 1.0));

  col *= smoothstep(1.4, 0.3, length(uv));
  // Palette tint (grayscale luminance → palette gradient)
  float _lum = clamp(dot(col, vec3(0.299, 0.587, 0.114)), 0.0, 1.0);
  vec3 _pal = _lum < 0.5
    ? mix(u_colorA, u_colorB, _lum * 2.0)
    : mix(u_colorB, u_colorC, (_lum - 0.5) * 2.0);
  col = mix(col, _pal * (0.55 + 0.9 * _lum), u_paletteMix);
  gl_FragColor = vec4(col, 1.0);
}
