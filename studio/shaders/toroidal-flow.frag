#pragma use_lib palette
#pragma use_lib audio
precision highp float;
uniform float u_time;
uniform vec2  u_resolution;

// ── Preset parameters ──
uniform float u_speed;          // 0-2     overall flow rate
uniform float u_majorR;         // 0.6-1.4 torus major radius
uniform float u_minorR;         // 0.15-0.45 torus minor radius
uniform float u_glow;           // 0-2
uniform float u_audioReact;     // 0-1
uniform float u_chakraTint;     // 0-1
uniform float u_fieldLines;     // 0-1     visible energy field lines
uniform float u_zoom;           // 0.5-2

mat2 rot(float a) { return mat2(cos(a), -sin(a), sin(a), cos(a)); }

// SDF: torus with major radius R and minor radius r in xy plane
float sdTorus(vec3 p, float R, float r) {
  vec2 q = vec2(length(p.xz) - R, p.y);
  return length(q) - r;
}

// Compute "torus flow coordinate" — angle around major + angle around minor.
// Returns vec2(majorAngle, minorAngle) for use in texturing the surface.
vec2 torusUV(vec3 p, float R) {
  float majorA = atan(p.z, p.x);
  vec2 q = vec2(length(p.xz) - R, p.y);
  float minorA = atan(q.y, q.x);
  return vec2(majorA, minorA);
}

vec3 calcNormal(vec3 p, float R, float r) {
  vec2 e = vec2(1.0, -1.0) * 0.5773 * 0.001;
  return normalize(
    e.xyy * sdTorus(p + e.xyy, R, r) +
    e.yyx * sdTorus(p + e.yyx, R, r) +
    e.yxy * sdTorus(p + e.yxy, R, r) +
    e.xxx * sdTorus(p + e.xxx, R, r)
  );
}

// 7-stop chakra rainbow
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

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float r2d = length(uv);

  float t = u_time * u_speed;

  // Camera — looking at torus from slight angle
  float ct = t * 0.10;
  float dist = 3.0 / max(u_zoom, 0.4);
  vec3 ro = vec3(dist * cos(ct), 1.0 + 0.4 * sin(ct * 0.4), dist * sin(ct));
  vec3 fw = normalize(-ro);
  vec3 rt = normalize(cross(vec3(0.0, 1.0, 0.0), fw));
  vec3 up = cross(fw, rt);
  vec3 rd = normalize(uv.x * rt + uv.y * up + 1.55 * fw);

  float R = u_majorR;
  float r = u_minorR;

  // Beat-driven torus pulse (minor radius swells)
  r *= 1.0 + u_audioReact * u_beatOnset * 0.10;

  // Ray march torus
  float trayDist = 0.0;
  bool hit = false;
  for (int i = 0; i < 80; i++) {
    vec3 p = ro + rd * trayDist;
    float d = sdTorus(p, R, r);
    if (d < 0.001) { hit = true; break; }
    if (trayDist > 8.0) break;
    trayDist += d * 0.85;
  }

  vec3 col;
  if (hit) {
    vec3 p = ro + rd * trayDist;
    vec3 n = calcNormal(p, R, r);

    // Surface coordinates (flow texture)
    vec2 tuv = torusUV(p, R);
    // Animate the texture coords — flow around major axis
    float flowMajor = tuv.x * 4.0 + t * 1.5 + u_bassPres * 1.0;
    float flowMinor = tuv.y * 8.0 + t * 0.5;

    // Field-line pattern: bright lines flowing around the major loop
    float fieldStripe = 0.5 + 0.5 * sin(flowMajor + sin(flowMinor) * 0.3);
    fieldStripe = pow(fieldStripe, 3.0);

    // Chakra tint based on minor angle (each "side" of torus a different chakra)
    float tintT = fract(tuv.y / 6.28318 + t * 0.04);
    vec3 tint = chakraTint(tintT);
    tint = mix(vec3(0.7), tint, u_chakraTint);

    // Lighting
    vec3 L1 = normalize(vec3(0.5, 0.8, 0.3));
    float dif = max(0.0, dot(n, L1));
    float fres = pow(1.0 - max(0.0, -dot(n, rd)), 2.5);

    // Compose
    col = tint * (0.3 + 0.6 * dif);
    col += tint * fres * 1.4;
    col += tint * fieldStripe * u_fieldLines * 1.2;
    col += tint * u_beatOnset * u_audioReact * 0.5;
  } else {
    col = vec3(0.018, 0.012, 0.04);
  }

  // ── Energy field lines through torus center (axial flow) ──
  // The torus has a "donut hole" — energy flows through it.
  if (u_fieldLines > 0.01) {
    // Sample the column through the center: x ≈ 0, z ≈ 0 (in world)
    // Simple screen-space approximation: bright vertical column at center
    float colDist = abs(uv.x);
    float colMask = exp(-colDist * colDist * 200.0) * exp(-pow(uv.y, 2.0) * 0.5);
    vec3 colHue = chakraTint(fract(t * 0.08));
    col += colHue * colMask * u_fieldLines * 0.5 * (0.6 + u_bassPres);
  }

  // ── Outer aura halo ──
  vec3 hueBg = chakraTint(fract(t * 0.04));
  col += hueBg * exp(-r2d * 1.4) * u_glow * 0.25 * (0.5 + u_bassHit);

  // ── Star field background ──
  vec2 starG = floor(gl_FragCoord.xy * 0.6);
  float sH = hash21(starG);
  float star = step(0.998, sH) * (0.5 + 0.5 * sin(u_time * 1.8 + sH * 14.0));
  col += vec3(0.95, 0.97, 1.0) * star * 0.6;

  // Vignette + tonemap + gamma
  col *= smoothstep(2.0, 0.30, r2d);
  col = col / (1.0 + col);
  col = pow(col, vec3(0.86));

  gl_FragColor = vec4(col, 1.0);
}
