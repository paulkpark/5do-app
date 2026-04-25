#pragma use_lib palette
#pragma use_lib audio
precision highp float;
uniform float u_time;
uniform vec2  u_resolution;

// ── Preset parameters ──
uniform float u_speed;          // 0-3     travel speed
uniform float u_gridDensity;    // 4-20    grid line frequency
uniform float u_perspective;    // 0.3-0.8 vanishing-point compression
uniform float u_glow;           // 0-2
uniform float u_audioReact;     // 0-1
uniform float u_neon;           // 0-1     neon palette saturation
uniform float u_scanlines;      // 0-1     CRT scanline overlay
uniform float u_palette;        // 0-1

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

mat2 rot(float a) { return mat2(cos(a), -sin(a), sin(a), cos(a)); }

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time * u_speed * 0.55;

  // ── Tunnel projection ──
  // Square tunnel — 4 walls (top/bot/left/right) seen from inside
  // Use signed dist to nearest "wall" axis (max(|x|, |y|)).
  float wallDist = max(abs(uv.x), abs(uv.y));

  // Map to depth (1/r style) — far perspective
  float depth = 1.0 / max(wallDist, 0.04) * mix(1.0, 0.5, u_perspective);

  // Travel along depth axis
  float z = depth + t * 4.0;

  // ── Grid lines ──
  // Horizontal lines (along travel) and vertical lines (along height/wall direction)
  // For each pixel, find which wall is closest, then UV on that wall.
  float wallU, wallV;
  if (abs(uv.x) > abs(uv.y)) {
    // Left/right wall
    wallU = z;                           // depth coordinate
    wallV = uv.y / max(abs(uv.x), 0.04);  // tangential
  } else {
    // Top/bottom wall
    wallU = z;
    wallV = uv.x / max(abs(uv.y), 0.04);
  }

  // Grid line distance — shortest distance to nearest line in u or v direction
  float density = max(4.0, u_gridDensity);
  float gridU = abs(fract(wallU * density * 0.2) - 0.5);
  float gridV = abs(fract(wallV * 4.0) - 0.5);
  float gridLine = min(gridU, gridV);

  // Brighter near horizon (low gridLine = near a line)
  float lineMask = smoothstep(0.05, 0.0, gridLine);

  // ── Atmospheric falloff with depth ──
  float atm = exp(-z * 0.05);  // closer = brighter
  // Sustained visibility — so distant lines still fade in
  atm = mix(0.3, 1.0, atm);

  // ── Neon color: cyan + magenta classic synthwave ──
  // Top/bottom walls = cyan, left/right walls = magenta (or vice versa)
  bool sideWall = abs(uv.x) > abs(uv.y);
  vec3 neonCyan    = vec3(0.20, 1.00, 1.00);
  vec3 neonMagenta = vec3(1.00, 0.20, 0.85);
  vec3 wallCol = sideWall ? neonMagenta : neonCyan;
  // Audio palette tint mix
  vec3 paletteCol = palette(fract(u_palette + z * 0.04));
  wallCol = mix(wallCol, paletteCol, 1.0 - u_neon);

  // ── Compose ──
  vec3 col = wallCol * lineMask * atm * (1.0 + u_glow * 0.8);

  // ── Vanishing-point glow at center ──
  float vp = exp(-length(uv) * 4.0);
  vec3 vpCol = palette(fract(u_palette + 0.5 + t * 0.05));
  col += vpCol * vp * 0.7 * (0.6 + u_bassPres);

  // ── Beat-driven flash on grid (lines pulse on bass) ──
  col += wallCol * lineMask * u_audioReact * u_bassHit * 0.8;

  // ── Treble: random grid intersections sparkle ──
  if (u_trebleHit > 0.01) {
    float interMask = step(0.95, max(1.0 - gridU * 8.0, 1.0 - gridV * 8.0));
    col += vec3(0.95, 0.97, 1.0) * interMask * u_trebleHit * 1.4;
  }

  // ── CRT scanline overlay ──
  if (u_scanlines > 0.01) {
    float scan = 0.95 + 0.05 * sin(gl_FragCoord.y * 2.0);
    col *= mix(1.0, scan, u_scanlines);
  }

  // ── Background — pure black ──
  col += vec3(0.012, 0.008, 0.025);

  // Vignette + tonemap + gamma
  col *= smoothstep(1.85, 0.30, length(uv));
  col = col / (1.0 + col);
  col = pow(col, vec3(0.86));

  gl_FragColor = vec4(col, 1.0);
}
