#pragma use_lib palette
#pragma use_lib audio
precision highp float;
uniform float u_time;
uniform vec2  u_resolution;

// ── Preset parameters ──
uniform float u_speed;          // 0-2     rotation rate
uniform float u_size;           // 0.5-1.5 merkaba size
uniform float u_glow;           // 0-2
uniform float u_audioReact;     // 0-1
uniform float u_breath;         // 0-1     breath cycle
uniform float u_chakraTint;     // 0-1     palette saturation
uniform float u_starfield;      // 0-1
uniform float u_tetraSpin;      // 0-1     counter-rotation between two tetrahedra

mat2 rot(float a) { return mat2(cos(a), -sin(a), sin(a), cos(a)); }

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// SDF: regular tetrahedron centered at origin, vertex pointing +y
float sdTetrahedron(vec3 p, float r) {
  // 4 vertices of a tetrahedron
  vec3 q = abs(p);
  return (max(q.x + p.y, max(q.x - p.y, max(q.z + p.y, q.z - p.y))) - r) / sqrt(3.0);
}

// SDF: edges of a tetrahedron — render as wireframe
float sdTetraEdges(vec3 p, float r, float thickness) {
  // Approximate edges via abs(SDF) trick
  float d = sdTetrahedron(p, r);
  return abs(d) - thickness;
}

// SDF: interpenetrating tetrahedra (merkaba = star tetrahedron)
float mapMerkaba(vec3 p) {
  float r = u_size * 0.85;
  float thick = 0.04;
  // Tetrahedron #1 (point up)
  float d1 = sdTetraEdges(p, r, thick);
  // Tetrahedron #2 (point down — flipped) with optional counter-rotation
  vec3 p2 = vec3(p.x, -p.y, p.z);
  if (u_tetraSpin > 0.01) {
    p2.xz *= rot(-u_time * u_speed * 0.4);
  }
  float d2 = sdTetraEdges(p2, r, thick);
  return min(d1, d2);
}

vec3 calcNormal(vec3 p) {
  vec2 e = vec2(1.0, -1.0) * 0.5773 * 0.0008;
  return normalize(
    e.xyy * mapMerkaba(p + e.xyy) +
    e.yyx * mapMerkaba(p + e.yyx) +
    e.yxy * mapMerkaba(p + e.yxy) +
    e.xxx * mapMerkaba(p + e.xxx)
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

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float r2d = length(uv);

  // Breath
  float breath = 1.0 + u_breath * 0.10 * sin(u_time * 0.5);

  // Camera setup — orbit around the merkaba
  float ct = u_time * u_speed * 0.20;
  vec3 ro = vec3(2.5 * cos(ct), 1.0 + 0.3 * sin(ct * 0.5), 2.5 * sin(ct));
  vec3 fw = normalize(-ro);
  vec3 rt = normalize(cross(vec3(0.0, 1.0, 0.0), fw));
  vec3 up = cross(fw, rt);
  vec3 rd = normalize(uv.x * rt + uv.y * up + 1.6 * fw);

  // Ray march
  float t = 0.0;
  bool hit = false;
  for (int i = 0; i < 80; i++) {
    vec3 p = ro + rd * t;
    p /= breath;
    float d = mapMerkaba(p);
    if (d < 0.001) { hit = true; break; }
    if (t > 8.0) break;
    t += d * 0.85;
  }

  vec3 col;
  if (hit) {
    vec3 p = (ro + rd * t) / breath;
    vec3 n = calcNormal(p);

    // Chakra tint on edges
    float tintT = fract(p.y * 0.4 + length(p.xz) * 0.3 + u_time * 0.04);
    vec3 tint = chakraTint(tintT);
    tint = mix(vec3(0.85), tint, u_chakraTint);

    // Lighting
    vec3 L1 = normalize(vec3(0.5, 0.8, 0.3));
    float dif = max(0.0, dot(n, L1));
    float fres = pow(1.0 - max(0.0, -dot(n, rd)), 2.5);

    col = tint * (0.3 + 0.7 * dif);
    col += tint * fres * 1.5;
    col += tint * u_beatOnset * u_audioReact * 0.6;
  } else {
    col = vec3(0.018, 0.012, 0.04);
  }

  // ── Outer aura: soft halo behind merkaba ──
  vec3 hueBg = chakraTint(fract(u_time * 0.04));
  col += hueBg * exp(-r2d * 1.4) * u_glow * 0.30 * (0.6 + u_bassPres);

  // ── Inner core glow (bright at center of merkaba — its "heart") ──
  col += hueBg * exp(-r2d * 5.0) * 0.55 * (0.7 + u_bassHit * 1.2);

  // ── Star field background ──
  if (u_starfield > 0.01) {
    vec2 starG = floor(gl_FragCoord.xy * 0.7);
    float sH = hash21(starG);
    float star = step(0.998 - 0.002 * u_starfield, sH);
    star *= 0.5 + 0.5 * sin(u_time * 1.5 + sH * 14.0);
    col += vec3(0.95, 0.97, 1.0) * star * (0.6 + u_trebleHit);
  }

  // Vignette + tonemap + gamma
  col *= smoothstep(2.0, 0.30, r2d);
  col = col / (1.0 + col);
  col = pow(col, vec3(0.86));

  gl_FragColor = vec4(col, 1.0);
}
