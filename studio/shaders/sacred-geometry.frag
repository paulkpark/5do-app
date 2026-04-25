#pragma use_lib palette
#pragma use_lib audio
precision highp float;
uniform float u_time;
uniform vec2  u_resolution;

// ── Preset parameters ──
uniform float u_speed;          // 0-2     base flow speed
uniform float u_rings;          // 1-3     ring tier count (1=inner, 2=+middle, 3=+outer)
uniform float u_thickness;      // 0.005-0.04 line thickness
uniform float u_glow;           // 0-2     halo intensity
uniform float u_rotate;         // 0-1     auto-rotation speed
uniform float u_audioReact;     // 0-1     audio modulation strength
uniform float u_chromatic;      // 0/1     multi-hue per ring vs. single tint
uniform float u_starBurst;      // 0-1     beat-driven concentric ripple
uniform float u_chakraSpread;   // 0-1     hue spread across ring radii

// 2D SDF: distance to a circle ring of radius r centered at c, line half-width w.
float ring(vec2 p, vec2 c, float r, float w) {
  return abs(length(p - c) - r) - w;
}

mat2 rot2(float a) { return mat2(cos(a), -sin(a), sin(a), cos(a)); }

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float r2d = length(uv);

  // ── Slow rotation: clock-style + bass pump ──
  float rotAngle = u_time * u_rotate * 0.18 + u_bassPres * 0.55;
  uv = rot2(rotAngle) * uv;

  // ── Beat scale pump ──
  float scale = 1.0 + u_audioReact * u_beatOnset * 0.08;
  uv *= scale;

  // ── Line thickness — base + audio-driven swell ──
  float w = u_thickness + u_audioReact * u_bassHit * 0.020;

  float r0 = 0.5;  // unit-circle radius — Flower of Life uses 1·r0 spacing

  // ── Build the SDF as min of all 19/37/61 circles ──
  // Tier 1 (inner): 1 center + 6 first-ring = 7 circles
  float d = ring(uv, vec2(0.0), r0, w);
  for (int i = 0; i < 6; i++) {
    float a = float(i) * 1.04719755;  // 60°
    vec2 c = vec2(cos(a), sin(a)) * r0;
    d = min(d, ring(uv, c, r0, w));
  }

  // Tier 2: outer hex (rotated 30°) + axis-aligned 2r ring = 12 circles
  if (u_rings >= 1.5) {
    for (int i = 0; i < 6; i++) {
      float a = float(i) * 1.04719755 + 0.5235987755;  // 30° offset
      vec2 c = vec2(cos(a), sin(a)) * r0 * 1.7320508;  // sqrt(3)
      d = min(d, ring(uv, c, r0, w));
    }
    for (int i = 0; i < 6; i++) {
      float a = float(i) * 1.04719755;
      vec2 c = vec2(cos(a), sin(a)) * r0 * 2.0;
      d = min(d, ring(uv, c, r0, w));
    }
  }

  // Tier 3: dodecagonal outer ring = 12 circles at radius 1.5 * sqrt(3)
  if (u_rings >= 2.5) {
    for (int i = 0; i < 12; i++) {
      float a = float(i) * 0.5235987755;  // 30°
      vec2 c = vec2(cos(a), sin(a)) * r0 * 2.5980762;  // 1.5*sqrt(3)
      d = min(d, ring(uv, c, r0, w));
    }
  }

  // ── Line render with halo ──
  float core = smoothstep(w * 1.4, 0.0, d);
  float halo = smoothstep(0.07, 0.0, d) * u_glow * 0.55;
  float lineMask = max(core, halo);

  // ── Color: per-ring or unified ──
  vec3 col;
  // Hue parameter: blend of radial distance + time + chakra spread
  float hueT = fract(r2d * (0.3 + u_chakraSpread * 0.7) + u_time * 0.04);
  if (u_chromatic > 0.5) {
    col = palette(hueT);
  } else {
    // Warm gold dominant + slight palette tint
    col = mix(vec3(1.0, 0.82, 0.42), palette(fract(u_time * 0.04)), 0.55);
  }

  // ── Compose ──
  vec3 finalCol = col * lineMask;

  // Subtle background glow centered (akashic atmosphere)
  vec3 bg = vec3(0.025, 0.015, 0.06);
  bg += col * exp(-r2d * 1.6) * 0.10 * (1.0 + u_bassPres);
  finalCol += bg;

  // Beat-driven concentric starburst (sacred ripple)
  if (u_starBurst > 0.01) {
    float ripple = sin(r2d * 22.0 - u_beatPhase * 12.566) * 0.5 + 0.5;
    ripple *= u_beatOnset * u_starBurst * exp(-r2d * 1.3);
    finalCol += palette(fract(0.5 + u_time * 0.03)) * ripple * 0.6;
  }

  // Beat flash boost on lines
  finalCol += col * lineMask * u_beatOnset * 0.6;

  // Treble shimmer at intersections (high-freq sparkle)
  // Cheap noise hash by uv
  float spark = fract(sin(dot(uv * 50.0, vec2(127.1, 311.7))) * 43758.5453);
  spark = step(0.985, spark) * u_trebleHit;
  finalCol += vec3(0.95, 0.9, 1.0) * spark * 0.8 * lineMask;

  // Vignette + Reinhard tonemap + gamma
  finalCol *= smoothstep(1.85, 0.30, r2d);
  finalCol = finalCol / (1.0 + finalCol);
  finalCol = pow(finalCol, vec3(0.86));

  gl_FragColor = vec4(finalCol, 1.0);
}
