precision highp float;

// Samples the preset-render target (offscreen FBO texture).
uniform sampler2D u_tex;
uniform vec2  u_resolution;
uniform float u_time;

// FX intensities — 0.0 = bypass, 1.0 = full
uniform float u_fxVignette;
uniform float u_fxChroma;
uniform float u_fxScanlines;
uniform float u_fxGrain;
uniform float u_fxPixelate;

float rand(vec2 co) {
  return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;

  // ── Pixelate (apply to sampling UV) ─────────────
  if (u_fxPixelate > 0.001) {
    float p = mix(1.0, 160.0, u_fxPixelate);
    vec2 cells = vec2(u_resolution.x / p, u_resolution.y / p);
    uv = floor(uv * cells) / cells + (0.5 / cells);
  }

  // ── Chromatic aberration ────────────────────────
  vec3 col;
  if (u_fxChroma > 0.001) {
    vec2 dir = (uv - 0.5) * u_fxChroma * 0.02;
    col.r = texture2D(u_tex, uv + dir).r;
    col.g = texture2D(u_tex, uv).g;
    col.b = texture2D(u_tex, uv - dir).b;
  } else {
    col = texture2D(u_tex, uv).rgb;
  }

  // ── Scanlines ───────────────────────────────────
  if (u_fxScanlines > 0.001) {
    float sl = 0.5 + 0.5 * sin(uv.y * u_resolution.y * 1.25);
    col *= mix(1.0, 0.45 + 0.55 * sl, u_fxScanlines);
  }

  // ── Vignette ────────────────────────────────────
  if (u_fxVignette > 0.001) {
    float d = length(uv - 0.5) * 1.42;
    col *= 1.0 - smoothstep(0.30, 1.05, d) * u_fxVignette;
  }

  // ── Film grain ──────────────────────────────────
  if (u_fxGrain > 0.001) {
    float n = rand(uv + fract(u_time * 0.17));
    col += (n - 0.5) * u_fxGrain * 0.22;
  }

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
