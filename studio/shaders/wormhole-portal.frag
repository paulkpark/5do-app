#pragma use_lib palette
#pragma use_lib audio
precision highp float;
uniform float u_time;
uniform vec2  u_resolution;

// ── Preset parameters ──
uniform float u_speed;          // 0-3     tunnel travel
uniform float u_twist;          // 0-1     rotational shear with depth
uniform float u_chromatic;      // 0-1     RGB channel split
uniform float u_glow;           // 0-2
uniform float u_audioReact;     // 0-1
uniform float u_palette;        // 0-1
uniform float u_centerPortal;   // 0-1     bright dimensional glimpse at center
uniform float u_rings;          // 4-20    ring frequency

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

mat2 rot(float a) { return mat2(cos(a), -sin(a), sin(a), cos(a)); }

// Tunnel rendering — given UV and a chromatic offset, produces a per-channel
// brightness so we can compose RGB-aberration manually.
float tunnel(vec2 uv, float chromOff, float t) {
  float r = length(uv);
  float a = atan(uv.y, uv.x);

  // Tunnel projection — z = 1/r (pulls inward depth)
  float z = 1.0 / max(r, 0.04);
  float depth = z + t + chromOff * 0.05;

  // Twist with depth
  a += depth * u_twist * 0.6;

  // Ring pattern
  float ringCount = max(4.0, u_rings);
  float ringCoord = fract(depth * ringCount * 0.10);
  float ring = smoothstep(0.4, 0.5, ringCoord) * smoothstep(0.6, 0.5, ringCoord);
  ring = pow(ring * 2.0, 1.4);

  // Per-ring intensity hash (some rings brighter than others)
  float ringId = floor(depth * ringCount * 0.10);
  float rH = hash21(vec2(ringId, 0.0));

  float brightness = ring * (0.4 + rH * 0.8);

  // Radial spokes (subtle striping) — adds tunnel depth feel
  float spokeCount = 12.0;
  float spoke = smoothstep(0.92, 1.0, cos(a * spokeCount + depth * 0.5));
  brightness += spoke * 0.15;

  // Atmospheric falloff with radius (close-edge atmosphere fades to dark center)
  float atm = smoothstep(0.0, 0.5, r);
  brightness *= 0.4 + 0.6 * atm;

  return brightness;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float r = length(uv);

  float t = u_time * u_speed * 0.50 + u_bassPres * 1.5;

  // Slight rotation for movement
  uv = rot(t * 0.05) * uv;

  // ── Chromatic aberration ──
  // Sample tunnel at 3 different offsets, one per RGB channel
  float chrom = u_chromatic * 0.06;
  float bR = tunnel(uv, -chrom, t);
  float bG = tunnel(uv,  0.0,    t);
  float bB = tunnel(uv,  chrom,  t);

  // Build RGB image with channel-shifted tunnels — gives prismatic color edge
  vec3 col = vec3(bR, bG, bB);

  // ── Apply palette tint to the tunnel ──
  vec3 paletteCol = palette(fract(u_palette + r * 0.3 + t * 0.04));
  col *= paletteCol * 1.4;

  // ── Center portal — bright dimensional glimpse ──
  if (u_centerPortal > 0.01) {
    // The "portal" is a bright glow at the very center, surrounded by rings
    vec3 portalHue = palette(fract(0.5 + u_time * 0.05));
    float portal = exp(-r * 8.0) * u_centerPortal * 1.6;
    portal *= 1.0 + u_audioReact * (u_bassHit * 0.8 + u_bassPres * 0.4);
    col += portalHue * portal;

    // Concentric rings emanating from portal (energy waves)
    float ringPulse = sin(r * 30.0 - u_time * 4.0) * 0.5 + 0.5;
    float ringMask  = smoothstep(0.3, 0.0, r) * exp(-r * 3.0);
    col += portalHue * ringPulse * ringMask * 0.3;
  }

  // ── Glow boost ──
  col *= 0.6 + u_glow * 0.7;

  // ── Beat radial shockwave ──
  float shockR = u_beatPhase * 1.5;
  float shock = exp(-pow(r - shockR, 2.0) * 50.0) * u_beatOnset;
  vec3 shockCol = palette(fract(u_palette + 0.4));
  col += shockCol * shock * 0.45 * u_audioReact;

  // ── Treble sparkle on rings ──
  float spark = step(0.985, hash21(uv * 50.0 + floor(t * 6.0))) * u_trebleHit;
  col += vec3(0.95, 0.97, 1.0) * spark * 1.4;

  // ── Background — deep cosmic vignette ──
  vec3 bg = vec3(0.018, 0.012, 0.045);
  col += bg * (1.0 - col) * 0.8;

  // Vignette + tonemap + gamma
  col *= smoothstep(2.0, 0.30, r);
  col = col / (1.0 + col);
  col = pow(col, vec3(0.86));

  gl_FragColor = vec4(col, 1.0);
}
