#pragma use_lib palette
#pragma use_lib audio
precision highp float;
uniform float u_time;
uniform vec2  u_resolution;

// ── Preset parameters ──
uniform float u_speed;          // 0-1.5    flow speed
uniform float u_density;        // 0.8-3    cell density
uniform float u_facetSharp;     // 0-1      sharper / softer edges
uniform float u_glow;           // 0-2      cell glow intensity
uniform float u_fresnel;        // 0-2      rim-light strength
uniform float u_audioReact;     // 0-1      audio modulation
uniform float u_chakraTint;     // 0-1      chakra-rainbow saturation
uniform float u_zoom;           // 0.5-2

// ── Hashes ──
float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
vec2 hash22(vec2 p) {
  return fract(sin(vec2(dot(p, vec2(127.1, 311.7)),
                        dot(p, vec2(269.5, 183.3)))) * 43758.5453);
}

// ── 2D Voronoi (returns F1, F2, cell hash) ──
// F1 = distance to nearest seed, F2 = distance to second nearest.
// (F2 - F1) is the "crystal edge" distance — small near cell boundaries.
vec3 voronoi(vec2 uv) {
  vec2 cell = floor(uv);
  vec2 frac = fract(uv);
  float F1 = 1e6, F2 = 1e6;
  vec2 nearestCell = cell;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 c = cell + vec2(x, y);
      // Animated seed jitter — cells gently pulse over time + with bass
      vec2 jitter = 0.5 + 0.45 * sin(u_time * 0.6 + 6.28318 * hash22(c) + u_bassPres * 1.4);
      vec2 seed = c + jitter;
      float d = length(seed - uv);
      if (d < F1) {
        F2 = F1; F1 = d; nearestCell = c;
      } else if (d < F2) {
        F2 = d;
      }
    }
  }
  return vec3(F1, F2, hash21(nearestCell));
}

// Chakra rainbow palette — same 7-stop ladder used in resonance-field
vec3 chakraTint(float t) {
  t = fract(t);
  vec3 c0, c1; float seg;
  if      (t < 0.1428) { c0 = vec3(0.96, 0.13, 0.22); c1 = vec3(1.00, 0.50, 0.13); seg = (t - 0.0000) * 7.0; }
  else if (t < 0.2857) { c0 = vec3(1.00, 0.50, 0.13); c1 = vec3(1.00, 0.88, 0.22); seg = (t - 0.1428) * 7.0; }
  else if (t < 0.4285) { c0 = vec3(1.00, 0.88, 0.22); c1 = vec3(0.22, 0.88, 0.42); seg = (t - 0.2857) * 7.0; }
  else if (t < 0.5714) { c0 = vec3(0.22, 0.88, 0.42); c1 = vec3(0.22, 0.58, 0.96); seg = (t - 0.4285) * 7.0; }
  else if (t < 0.7142) { c0 = vec3(0.22, 0.58, 0.96); c1 = vec3(0.45, 0.20, 0.92); seg = (t - 0.5714) * 7.0; }
  else if (t < 0.8571) { c0 = vec3(0.45, 0.20, 0.92); c1 = vec3(0.92, 0.45, 1.00); seg = (t - 0.7142) * 7.0; }
  else                 { c0 = vec3(0.92, 0.45, 1.00); c1 = vec3(0.96, 0.13, 0.22); seg = (t - 0.8571) * 7.0; }
  seg = 0.5 - 0.5 * cos(seg * 3.14159265);
  return mix(c0, c1, seg);
}

mat2 rot(float a) { return mat2(cos(a), -sin(a), sin(a), cos(a)); }

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float r2d = length(uv);

  // Slow camera-like rotation + zoom
  uv = rot(u_time * u_speed * 0.07) * uv;
  uv *= max(u_zoom, 0.3);

  // ── Voronoi sample at multiple scales (crystal sub-structure) ──
  vec2 cellUv = uv * u_density * 4.0;
  cellUv += u_time * u_speed * 0.25;       // slow drift
  vec3 v = voronoi(cellUv);
  float F1 = v.x, F2 = v.y, h = v.z;

  // ── Cell edge distance (sharper = thinner ridge) ──
  float edgeDist = F2 - F1;
  // Two-band edge: bright thin ridge + soft halo
  float edgeRidge = smoothstep(0.06 - u_facetSharp * 0.05, 0.0, edgeDist);
  float edgeHalo  = smoothstep(0.40 - u_facetSharp * 0.20, 0.0, edgeDist) * 0.45;

  // ── Per-cell color: chakra rainbow tinted by cell hash ──
  vec3 cellTint = chakraTint(h + u_time * 0.04);
  cellTint = mix(vec3(0.7), cellTint, u_chakraTint);

  // Boost saturation
  float sat = 1.0 + u_chakraTint * 0.4;
  vec3 lum = vec3(dot(cellTint, vec3(0.299, 0.587, 0.114)));
  cellTint = mix(lum, cellTint, sat);

  // ── Per-cell pulse — random subset lights up on bass hits ──
  float beatLuck = step(0.55, fract(h * 13.37 + u_beatPhase * 2.5));
  float cellEnergy = u_bassHit * beatLuck * u_audioReact * 1.4;

  // ── Cell fill (interior) — gradient from center darker to edge brighter ──
  // (Inverted so cells look like crystals lit from edges)
  float depthFill = pow(1.0 - F1 / 1.2, 1.5);
  float fillIntensity = depthFill * 0.65 + cellEnergy * 0.85;
  vec3 fillColor = cellTint * fillIntensity;

  // ── Faceted edges — sharp bright ridge + soft halo bloom ──
  vec3 edgeColor = cellTint * 2.4 + vec3(1.0, 0.98, 1.0) * 0.35;
  vec3 edgeGlow  = edgeColor * edgeRidge * (1.0 + u_glow * 0.9);
  edgeGlow      += cellTint  * edgeHalo  * (0.45 + u_glow * 0.35);

  // ── Cheap pseudo-fresnel: brighter at radial periphery (edge-of-screen rim) ──
  float fresnel = pow(r2d, 2.5) * u_fresnel;
  vec3 fresnelTint = chakraTint(fract(r2d * 0.3 + u_time * 0.04)) * fresnel * 0.4;

  // ── Compose ──
  vec3 col = fillColor + edgeGlow + fresnelTint;

  // ── Treble shimmer on edges ──
  float spark = step(0.985, hash21(cellUv * 5.0 + floor(u_time * 6.0))) * u_trebleHit;
  col += vec3(0.95, 0.97, 1.0) * spark * edgeRidge * 1.4;

  // ── Beat-driven center halo ──
  vec3 halo = chakraTint(fract(u_time * 0.05)) * exp(-r2d * 1.6) * 0.35;
  halo *= 0.6 + u_bassHit * 1.5;
  col += halo;

  // ── Background — subtle deep-space gradient ──
  vec3 bg = vec3(0.025, 0.018, 0.05) + chakraTint(fract(u_time * 0.03)) * 0.025;
  col += bg * (1.0 - edgeRidge * 0.7);

  // Vignette + tonemap + gamma
  col *= smoothstep(1.85, 0.25, r2d);
  col = col / (1.0 + col);
  col = pow(col, vec3(0.86));

  gl_FragColor = vec4(col, 1.0);
}
