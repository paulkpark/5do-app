// ─── Palette library ────────────────────────────────────────
// IQ cosine palette: c(t) = a + b·cos(2π(c·t + d))
// Plus a 3-stop smooth gradient for the existing u_colorA/B/C system.
//
// Selection: u_paletteMode (float)
//   0   = 3-stop (u_colorA/B/C)          ← default, legacy
//   1   = Cosine Rainbow (classic IQ)
//   2   = Spectral
//   3   = B&W (grayscale + slight tint)
//   4   = Cyberdelic (neon magenta/cyan)
//   5   = Electric Chroma
//   6   = Fire
//   7   = Ocean Sunset
//   8   = Ethereal Garden
//
// Usage in a shader:
//   vec3 col = palette(luminance);

uniform float u_paletteMode;
uniform vec3  u_colorA;
uniform vec3  u_colorB;
uniform vec3  u_colorC;

const float TAU = 6.28318530718;

vec3 _iqCos(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
  return a + b * cos(TAU * (c * t + d));
}

vec3 palette3Stop(float t) {
  t = clamp(t, 0.0, 1.0);
  return t < 0.5
    ? mix(u_colorA, u_colorB, t * 2.0)
    : mix(u_colorB, u_colorC, (t - 0.5) * 2.0);
}

vec3 palette(float t) {
  int mode = int(u_paletteMode + 0.5);
  if (mode == 1) return _iqCos(t, vec3(0.5), vec3(0.5), vec3(1.0), vec3(0.00, 0.33, 0.67));
  if (mode == 2) return _iqCos(t, vec3(0.5), vec3(0.5), vec3(1.0, 1.0, 0.5), vec3(0.80, 0.90, 0.30));
  if (mode == 3) return _iqCos(t, vec3(0.5), vec3(0.5), vec3(0.0), vec3(0.0));
  if (mode == 4) return _iqCos(t, vec3(0.5), vec3(0.5), vec3(2.0, 1.0, 0.0), vec3(0.50, 0.20, 0.25));
  if (mode == 5) return _iqCos(t, vec3(0.5, 0.5, 0.5), vec3(0.5, 0.5, 0.5), vec3(2.0, 1.0, 0.0), vec3(0.50, 0.25, 0.25));
  if (mode == 6) return _iqCos(t, vec3(0.5, 0.3, 0.0), vec3(0.5, 0.4, 0.3), vec3(1.0, 0.9, 0.8), vec3(0.00, 0.05, 0.20));
  if (mode == 7) return _iqCos(t, vec3(0.8, 0.5, 0.4), vec3(0.2, 0.4, 0.2), vec3(2.0, 1.0, 1.0), vec3(0.00, 0.25, 0.25));
  if (mode == 8) return _iqCos(t, vec3(0.5, 0.5, 0.5), vec3(0.5, 0.5, 0.5), vec3(1.0, 0.7, 0.4), vec3(0.00, 0.15, 0.20));
  return palette3Stop(t);
}
