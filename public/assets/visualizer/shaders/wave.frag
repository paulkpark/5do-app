precision highp float;
uniform float u_time;
uniform vec2  u_resolution;
uniform float u_bass;
uniform float u_mid;
uniform float u_treble;
uniform float u_beat;

uniform float u_bars;
uniform float u_thickness;
uniform float u_mirror;
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

float barHeight(float bar, float t) {
  // Approximate FFT envelope from 3 bands — richer FFT texture wiring in Step 3.
  float h;
  if (bar < 0.33) {
    h = u_bass * 0.9 + 0.15 * sin(bar * 48.0 + t * 2.2);
  } else if (bar < 0.66) {
    h = u_mid * 0.85 + 0.12 * sin(bar * 36.0 + t * 1.9);
  } else {
    h = u_treble * 0.75 + 0.10 * sin(bar * 30.0 + t * 1.6);
  }
  return max(0.02, h);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float nBars = max(8.0, u_bars);
  float bar = floor(uv.x * nBars) / nBars;
  float h = barHeight(bar, u_time);

  float y = uv.y;
  float mirrored = mix(y, abs(y - 0.5) * 2.0, u_mirror);
  float inside = step(mirrored, h * u_thickness);

  // Soft top (smoothstep edge)
  float soft = smoothstep(h * u_thickness + 0.01, h * u_thickness - 0.01, mirrored);

  float hue = fract(u_hue + bar * 0.45);
  vec3 col = hsv2rgb(vec3(hue, 0.88, 1.0)) * soft;

  // Bar boundary
  float gap = abs(fract(uv.x * nBars) - 0.5) * 2.0;
  col *= smoothstep(0.96, 0.92, gap);

  col += u_beat * 0.15;
  // Palette tint (grayscale luminance → palette gradient)
  float _lum = clamp(dot(col, vec3(0.299, 0.587, 0.114)), 0.0, 1.0);
  vec3 _pal = _lum < 0.5
    ? mix(u_colorA, u_colorB, _lum * 2.0)
    : mix(u_colorB, u_colorC, (_lum - 0.5) * 2.0);
  col = mix(col, _pal * (0.55 + 0.9 * _lum), u_paletteMix);
  gl_FragColor = vec4(col, 1.0);
}
