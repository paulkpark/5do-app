#pragma use_lib palette
#pragma use_lib audio
precision highp float;
uniform float u_time;
uniform vec2  u_resolution;

// Karleido module target: magic_cubes — 3D voxel grid raycast.
uniform float u_speed;       // 0-2    camera travel + rotation rate
uniform float u_density;     // 0.6-2   cube spacing (smaller = more cubes)
uniform float u_fillRatio;   // 0.2-0.9 how much of each cell is filled
uniform float u_glow;        // 0-1.5  edge glow strength
uniform float u_beatPulse;   // 0/1    beat-driven cube expansion
uniform float u_zoom;        // 0.5-2  camera distance

// Cheap 3D hash for per-cell palette variation
float hash3(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

// SDF for an infinite grid of boxes via space-repetition
float sdBox(vec3 p, vec3 b) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

float mapCubes(vec3 p, out vec3 cellId) {
  // Space-repeat with spacing = 1/u_density
  float spacing = 1.0 / max(u_density, 0.3);
  vec3 cell = floor(p / spacing + 0.5);
  cellId = cell;
  vec3 local = p - cell * spacing;

  // Sparse grid — only fill ~45% of cells so the camera can fly through corridors
  float h = hash3(cell);
  if (h < 0.55) return 1.0;   // empty cell → large positive distance, ray skips

  // Per-cell size variation + beat swell
  float pulse = u_beatPulse * u_beatOnset * 0.18 * (0.3 + h);
  float halfSize = (u_fillRatio * 0.5 * (0.5 + h * 0.5) + pulse) * spacing;
  return sdBox(local, vec3(halfSize));
}

// Normal estimation via gradient
vec3 calcNormal(vec3 p) {
  vec2 e = vec2(1.0, -1.0) * 0.5773 * 0.0015;
  vec3 dummy;
  return normalize(
    e.xyy * mapCubes(p + e.xyy, dummy) +
    e.yyx * mapCubes(p + e.yyx, dummy) +
    e.yxy * mapCubes(p + e.yxy, dummy) +
    e.xxx * mapCubes(p + e.xxx, dummy)
  );
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;

  // Camera — orbit + slow travel
  float t = u_time * u_speed * 0.30;
  float ca = cos(t * 0.8), sa = sin(t * 0.8);
  vec3 ro = vec3(0.0, 0.0, -3.0 / max(u_zoom, 0.3)) + vec3(sa * 1.5, sin(t * 0.5) * 0.5, t * 2.0);
  vec3 fw = normalize(vec3(sin(t * 0.5) * 0.3, 0.0, 1.0));
  vec3 rt = normalize(cross(vec3(0.0, 1.0, 0.0), fw));
  vec3 up = cross(fw, rt);
  vec3 rd = normalize(uv.x * rt + uv.y * up + 1.5 * fw);

  // Ray march
  float dist = 0.0;
  bool hit = false;
  vec3 cellId = vec3(0.0);
  vec3 hitCell = vec3(0.0);
  float steps = 0.0;
  for (int i = 0; i < 64; i++) {
    vec3 p = ro + rd * dist;
    float d = mapCubes(p, cellId);
    if (d < 0.002) { hit = true; hitCell = cellId; break; }
    if (dist > 14.0) break;
    dist += d;
    steps += 1.0;
  }

  vec3 col;
  if (hit) {
    vec3 p = ro + rd * dist;
    vec3 n = calcNormal(p);

    // Per-cube palette variation
    float cellHash = hash3(hitCell);
    float pt = fract(cellHash + t * 0.05 + u_bassPres * 0.2);
    vec3 base = palette(pt);

    // Lambert against two key lights + fresnel rim
    vec3 L1 = normalize(vec3(0.6, 0.8, -0.3));
    vec3 L2 = normalize(vec3(-0.5, 0.2, 0.7));
    float lam = 0.25 + 0.6 * max(0.0, dot(n, L1)) + 0.4 * max(0.0, dot(n, L2));

    // Fresnel edge glow
    float fres = pow(1.0 - max(0.0, -dot(n, rd)), 3.0);

    col = base * lam;
    col += palette(fract(pt + 0.3)) * fres * u_glow * (0.6 + u_beatOnset * 1.5);

    // Distance fog — deep cubes fade
    float fog = exp(-dist * 0.12);
    col *= fog;

    // Per-cell beat emission — only specific cells light up on each beat
    float emit = step(0.7, fract(cellHash * 5.37 + u_beatPhase * 3.0));
    col += base * emit * u_bassHit * 0.8;

  } else {
    // Background — subtle palette gradient from cosmic dust
    float bg = 0.5 + 0.5 * uv.y;
    col = palette(fract(bg * 0.3 + t * 0.02)) * 0.08;
  }

  // Vignette
  col *= smoothstep(1.9, 0.25, length(uv));
  col = pow(col, vec3(0.85));
  gl_FragColor = vec4(col, 1.0);
}
