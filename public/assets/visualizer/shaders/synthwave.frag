precision highp float;
uniform float u_time;
uniform vec2  u_resolution;
uniform float u_bass;
uniform float u_mid;
uniform float u_treble;
uniform float u_beat;

uniform float u_gridSpeed;
uniform float u_sunSize;
uniform float u_palette;
uniform float u_horizon;

uniform vec3  u_colorA;
uniform vec3  u_colorB;
uniform vec3  u_colorC;
uniform float u_paletteMix;

vec3 paletteA(float p, float i) {
  // Pick one of 4 palettes (a→b→c gradient)
  vec3 a, b, c;
  if (p < 0.5) {
    a = vec3(1.0, 0.30, 0.60);  b = vec3(0.40, 0.10, 0.80);  c = vec3(0.00, 0.80, 1.00);
  } else if (p < 1.5) {
    a = vec3(1.0, 0.20, 0.50);  b = vec3(1.00, 0.70, 0.20);  c = vec3(0.90, 0.40, 1.00);
  } else if (p < 2.5) {
    a = vec3(0.2, 0.90, 0.90);  b = vec3(0.90, 0.10, 0.40);  c = vec3(0.10, 0.10, 0.30);
  } else {
    a = vec3(0.9, 0.50, 1.00);  b = vec3(0.40, 0.80, 1.00);  c = vec3(1.00, 1.00, 0.90);
  }
  float t = clamp(i, 0.0, 1.0);
  return mix(mix(a, b, t), c, pow(max(0.0, t - 0.5) * 2.0, 2.0));
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  vec3 col = vec3(0.0);
  float horizon = u_horizon;

  if (uv.y < horizon) {
    // Ground perspective grid
    float depth = horizon - uv.y;
    float z = 1.0 / max(0.001, depth);
    float u = (uv.x - 0.5) * z;
    float t = u_time * u_gridSpeed;
    float gx = abs(fract(u * 2.0) - 0.5);
    float gy = abs(fract(z * 0.2 - t) - 0.5);
    float lineW = 0.03 / z * (1.0 + u_bass * 0.4);
    float grid = smoothstep(lineW, 0.0, min(gx, gy) / z * 10.0);
    col = paletteA(u_palette, uv.y / horizon) * 0.25;
    col += grid * paletteA(u_palette, 0.9) * (0.8 + u_bass);
  } else {
    // Sky + sun + scanlines
    vec2 s = (uv - vec2(0.5, horizon + 0.08)) * vec2(u_resolution.x / u_resolution.y, 1.0);
    float sd = length(s);
    float sunR = u_sunSize * (1.0 + u_mid * 0.22);
    float sun = smoothstep(sunR, sunR * 0.94, sd);
    float scan = step(0.5, fract(uv.y * 28.0 + u_time * 0.3));
    float scanCut = smoothstep(horizon, horizon + 0.35, uv.y);
    sun *= mix(scan, 1.0, scanCut);
    float skyI = 1.0 - (uv.y - horizon) / max(0.001, 1.0 - horizon);
    col = paletteA(u_palette, skyI) * 0.55;
    col += sun * paletteA(u_palette, 0.8) * 1.8;
    // Stars
    vec2 grid = floor(uv * vec2(u_resolution.x, u_resolution.y) / 2.0);
    float star = step(0.996, fract(sin(dot(grid, vec2(12.9898, 78.233))) * 43758.5453));
    col += star * vec3(1.0) * smoothstep(horizon + 0.05, 1.0, uv.y);
  }

  col += u_beat * 0.12 * paletteA(u_palette, 0.7);
  // Palette tint (grayscale luminance → palette gradient)
  float _lum = clamp(dot(col, vec3(0.299, 0.587, 0.114)), 0.0, 1.0);
  vec3 _pal = _lum < 0.5
    ? mix(u_colorA, u_colorB, _lum * 2.0)
    : mix(u_colorB, u_colorC, (_lum - 0.5) * 2.0);
  col = mix(col, _pal * (0.55 + 0.9 * _lum), u_paletteMix);
  gl_FragColor = vec4(col, 1.0);
}
