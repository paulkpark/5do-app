#pragma use_lib palette
#pragma use_lib audio
precision highp float;
uniform float u_time;
uniform vec2  u_resolution;

// ── Preset parameters ──
uniform float u_speed;          // 0-2     rotation/flow speed
uniform float u_arms;           // 2-6     number of spiral arms
uniform float u_tightness;      // 0.4-2   spiral tightness
uniform float u_armWidth;       // 0.3-1.5 arm thickness
uniform float u_coreSize;       // 0.4-2   central bulge size
uniform float u_dustDarken;     // 0-1     dust lane darkness
uniform float u_starDensity;    // 0-1     background star density
uniform float u_audioReact;     // 0-1
uniform float u_glow;           // 0-2

// Hash for stars
float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// Smooth noise (value noise)
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1, 0));
  float c = hash21(i + vec2(0, 1));
  float d = hash21(i + vec2(1, 1));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 5; i++) {
    v += amp * vnoise(p);
    p *= 2.07; amp *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float r = length(uv);
  float a = atan(uv.y, uv.x);

  float t = u_time * u_speed * 0.10;

  // ── Spiral coordinate ──
  // log(r) creates logarithmic spiral arms; armCount controls multiplicity.
  float armCount = clamp(u_arms, 2.0, 8.0);
  float spiralPhase = a * armCount + log(max(r, 0.01)) * u_tightness * 6.0 - t * 6.0;
  // Each arm centered at multiples of 2π
  float armCoord = mod(spiralPhase, 6.28318530);
  float armDist  = min(armCoord, 6.28318530 - armCoord);  // distance to nearest arm

  // ── Arm intensity ──
  // Gaussian falloff from arm center, fading out near galactic core + edge.
  float armSig  = u_armWidth * 0.7;
  float arm     = exp(-armDist * armDist / (armSig * armSig));
  // Radial fade: zero in core (covered by bulge), zero at edge
  float radialFade = smoothstep(0.10, 0.35, r) * smoothstep(2.0, 0.45, r);
  arm *= radialFade;

  // ── Arm texture: lumpy bright knots from fBm ──
  vec2 polar = vec2(r * 4.0, spiralPhase * 0.5);
  float knots = fbm(polar + t * 0.5);
  arm *= 0.4 + 1.6 * knots;     // arm brightness varies along its length

  // ── Dust lanes — slightly inside the bright arm path, darker ──
  float dustDist  = abs(armCoord - 6.28318530 * 0.5 - 0.15);  // offset
  float dustMask  = exp(-dustDist * dustDist * 14.0) * radialFade * u_dustDarken;

  // ── Galactic core (bulge) ──
  // Inner: blinding bright, outer: warm tint with bass-driven flare
  float bulge = exp(-r * r * 40.0 / max(u_coreSize, 0.2)) * 2.5;
  bulge += exp(-r * 6.0 / max(u_coreSize, 0.2)) * 0.55;
  // Bass flare — galactic nucleus pulses on bass hits
  bulge *= 1.0 + u_audioReact * (u_bassHit * 0.9 + u_bassPres * 0.4);

  // ── Color palette ──
  // Core: warm yellow → orange.
  // Arms: cool blue/violet (typical young-stars in spiral arms).
  vec3 coreCol = mix(vec3(1.00, 0.85, 0.55), vec3(1.00, 0.55, 0.30), smoothstep(0.0, 0.2, r));
  vec3 armColCool = palette(fract(r * 0.25 + a * 0.04 + t * 0.5 + u_midPres * 0.2));
  armColCool = mix(armColCool, vec3(0.45, 0.65, 1.10), 0.5);  // blue bias

  // ── Compose ──
  vec3 col = vec3(0.0);
  col += coreCol * bulge;
  col += armColCool * arm * (0.7 + u_glow * 0.7);

  // Subtract dust (darken the bright arms slightly along the dust lane)
  col *= 1.0 - dustMask * 0.55;

  // ── Background stars (multi-layer star field) ──
  vec2 starGrid1 = floor(gl_FragCoord.xy * 0.7);
  float s1 = hash21(starGrid1);
  float star1 = step(0.997 - 0.002 * u_starDensity, s1);
  star1 *= 0.5 + 0.5 * sin(u_time * 1.5 + s1 * 12.0);
  // Far stars, subtler
  vec2 starGrid2 = floor(gl_FragCoord.xy * 1.4);
  float s2 = hash21(starGrid2);
  float star2 = step(0.998, s2) * 0.6;
  vec3 starColor = vec3(0.95, 0.96, 1.00);
  col += (star1 + star2) * starColor * (0.7 + u_trebleHit * 1.2);

  // ── Faint nebula gas wash (very subtle pink/purple cloud) ──
  vec2 nebUv = uv * 0.6 + t * 0.05;
  float nebMask = smoothstep(0.5, 0.9, fbm(nebUv * 1.5));
  col += vec3(0.65, 0.35, 0.85) * nebMask * 0.05 * radialFade;

  // ── Beat-driven core jet (occasional flash perpendicular to disk) ──
  float jetMask = smoothstep(0.05, 0.0, abs(uv.x)) * exp(-r * 1.5);
  col += vec3(1.0, 0.9, 0.7) * jetMask * u_beatOnset * u_audioReact * 0.6;

  // ── Tonemap + vignette ──
  col *= smoothstep(2.0, 0.30, r);
  col = col / (1.0 + col);
  col = pow(col, vec3(0.86));

  gl_FragColor = vec4(col, 1.0);
}
