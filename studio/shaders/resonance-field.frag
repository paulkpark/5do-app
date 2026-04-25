#pragma use_lib palette
#pragma use_lib audio
precision highp float;
uniform float u_time;
uniform vec2  u_resolution;

// ── Preset parameters ──
uniform float u_speed;        // 0-1     overall flow speed
uniform float u_iterations;   // 3-9     fractal depth
uniform float u_breath;       // 0-1     breath cycle amplitude
uniform float u_aura;         // 0-1.5   outer aura halo intensity
uniform float u_resonance;    // 0-1     audio response strength
uniform float u_zoom;         // 0.4-2   camera distance
uniform float u_chakraFlow;   // 0-1     palette rotation speed
uniform float u_petals;       // 6-12    radial fold count (7 = chakras)
uniform float u_geometry;     // 0-1     fractal scale morph

// ── Chakra palette (root → crown) — 7-stop hue ladder ──
// Returns a smooth rainbow-like sweep going through the 7 chakra colors.
// Index: 0=root(red) → 1/7=sacral(orange) → 2/7=solar(yellow) → 3/7=heart(green)
//        → 4/7=throat(blue) → 5/7=third-eye(indigo) → 6/7=crown(violet) → wraps.
vec3 chakraTint(float t) {
  t = fract(t);
  vec3 c0, c1; float seg;
  if      (t < 0.1428) { c0 = vec3(0.96, 0.13, 0.22); c1 = vec3(1.00, 0.50, 0.13); seg = (t -      0.0) * 7.0; }
  else if (t < 0.2857) { c0 = vec3(1.00, 0.50, 0.13); c1 = vec3(1.00, 0.88, 0.22); seg = (t -   0.1428) * 7.0; }
  else if (t < 0.4285) { c0 = vec3(1.00, 0.88, 0.22); c1 = vec3(0.22, 0.88, 0.42); seg = (t -   0.2857) * 7.0; }
  else if (t < 0.5714) { c0 = vec3(0.22, 0.88, 0.42); c1 = vec3(0.22, 0.58, 0.96); seg = (t -   0.4285) * 7.0; }
  else if (t < 0.7142) { c0 = vec3(0.22, 0.58, 0.96); c1 = vec3(0.45, 0.20, 0.92); seg = (t -   0.5714) * 7.0; }
  else if (t < 0.8571) { c0 = vec3(0.45, 0.20, 0.92); c1 = vec3(0.92, 0.45, 1.00); seg = (t -   0.7142) * 7.0; }
  else                 { c0 = vec3(0.92, 0.45, 1.00); c1 = vec3(0.96, 0.13, 0.22); seg = (t -   0.8571) * 7.0; }
  // Smooth interpolation (cosine ease)
  seg = 0.5 - 0.5 * cos(seg * 3.14159265);
  return mix(c0, c1, seg);
}

mat2 rot(float a) { return mat2(cos(a), -sin(a), sin(a), cos(a)); }

// ── SDF: Sacred geometry mandala ──
// Each iteration: radial fold (N-fold) → translate/scale → tilt. Keeping the
// radial fold inside the loop preserves N-petal symmetry through all depths,
// producing a true mandala-like sacred-geometry fractal rather than generic KIFS.
float mapResonance(vec3 p, out float trap) {
  // Breath cycle — slow expand/contract synced to bass presence + LFO.
  float breath = 1.0 + u_breath * 0.18 * (sin(u_time * 0.40) + u_bassPres * 1.0);
  p /= breath;

  float beatSwell = u_resonance * u_beatOnset * 0.20;

  float N = clamp(u_petals, 3.0, 16.0);
  float secAngle = 6.28318530718 / N;
  float halfSec  = secAngle * 0.5;

  // Slow whole-mandala rotation
  p.xz *= rot(u_time * u_speed * 0.08);

  float scale = 1.0;
  trap = 1e6;
  int iter = int(clamp(u_iterations, 1.0, 6.0));
  float k = 1.20 + u_geometry * 0.25;            // Per-iter scale — gentler
  vec3 ofs = vec3(0.55, 0.42, 0.55);             // Smaller offset → less aggressive

  for (int i = 0; i < 6; i++) {
    if (i >= iter) break;

    // Radial fold first — keeps N-petal symmetry through the loop
    float a = atan(p.y, p.x);
    float r = length(p.xy);
    a = mod(a + halfSec, secAngle) - halfSec;
    p.xy = vec2(cos(a), sin(a)) * r;

    // Gentle KIFS step: abs + offset + scale
    p = abs(p) - ofs;
    p *= k;
    scale *= k;

    // Tilt per iteration so depth layers misalign nicely
    p.xz *= rot(0.25 + float(i) * 0.18 + u_midPres * 0.3);

    trap = min(trap, dot(p, p));
  }

  // Final primitive: large smooth torus ring → forms clean petal arcs
  vec2 q = vec2(length(p.xz) - 0.55, p.y);
  float d = length(q) - 0.18;
  return d / scale - beatSwell * 0.05;
}

vec3 calcNormal(vec3 p) {
  vec2 e = vec2(1.0, -1.0) * 0.5773 * 0.0008;
  float t;
  return normalize(
    e.xyy * mapResonance(p + e.xyy, t) +
    e.yyx * mapResonance(p + e.yyx, t) +
    e.yxy * mapResonance(p + e.yxy, t) +
    e.xxx * mapResonance(p + e.xxx, t)
  );
}

// Cheap 3D hash for sparkle / particle noise
float hash3(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float r2d = length(uv);

  // ── Camera — pulled WAY back to show the whole mandala + ample halo space ──
  float ct = u_time * u_speed * 0.08;
  float dist = (5.5 + 0.6 * sin(ct * 0.27)) / max(u_zoom, 0.35);
  // Slight tilt so we see top + side of the mandala (not perfectly face-on)
  vec3 ro = vec3(dist * 0.4 * cos(ct), 1.2 + 0.4 * sin(ct * 0.43), dist);
  // Slight rotation for movement
  ro.xz = rot(ct * 0.5) * ro.xz;
  vec3 fw = normalize(-ro);
  vec3 rt = normalize(cross(vec3(0.0, 1.0, 0.0), fw));
  vec3 up = cross(fw, rt);
  vec3 rd = normalize(uv.x * rt + uv.y * up + 1.65 * fw);

  // ── Ray march ──
  float tray = 0.0;
  bool hit = false;
  float trap = 1e6;
  float steps = 0.0;
  for (int i = 0; i < 90; i++) {
    vec3 p = ro + rd * tray;
    float trapStep;
    float d = mapResonance(p, trapStep);
    trap = min(trap, trapStep);
    if (d < 0.0009) { hit = true; break; }
    if (tray > 12.0) break;
    tray += d * 0.82;
    steps += 1.0;
  }

  vec3 col;
  if (hit) {
    vec3 p = ro + rd * tray;
    vec3 n = calcNormal(p);

    // Chakra tint indexed by trap depth + slow palette flow + audio offset.
    float palT = fract(trap * 0.18
                     + u_chakraFlow * u_time * 0.06
                     + p.y * 0.12
                     + u_midPres * 0.15);
    vec3 tint = chakraTint(palT);

    // Environment approximation: warm horizon to cool zenith
    vec3 refl = reflect(rd, n);
    float sky = smoothstep(-0.4, 1.0, refl.y);
    vec3 envCol = mix(vec3(0.04, 0.02, 0.08), vec3(0.95, 0.93, 1.0), sky);
    envCol = mix(envCol, vec3(1.0, 0.65, 0.40), smoothstep(0.15, -0.15, refl.y) * 0.30);

    // Two key lights — soft white + warm fill
    vec3 L1 = normalize(vec3( 0.40,  0.85, 0.30));
    vec3 L2 = normalize(vec3(-0.55, -0.20, 0.85));
    float dif1 = max(0.0, dot(n, L1));
    float dif2 = max(0.0, dot(n, L2)) * 0.6;
    vec3 lightCol = vec3(1.00, 0.96, 0.92) * dif1 + vec3(1.00, 0.55, 0.85) * dif2;

    // Fresnel rim — strongly reactive
    float fres = pow(1.0 - max(0.0, -dot(n, rd)), 3.0);

    // Specular highlight from L1
    vec3 h = normalize(L1 - rd);
    float spe = pow(max(0.0, dot(n, h)), 32.0) * 0.6;

    // Compose: chakra-tint dominates, not env. Brighter mid-tones.
    col = tint * (0.35 + 0.65 * (dif1 + dif2));
    col = mix(col, envCol * tint * 1.4, 0.35);    // Subtle env tint mix
    col += fres * tint * 1.8;                     // Strong rim — petals glow at edges
    col += spe * vec3(1.0, 0.95, 0.9);

    // Beat flash — chakra hue saturates on each kick
    col += tint * u_beatOnset * u_resonance * 0.65;

    // Edge AO from step count — deep folds darken
    float ao = 1.0 - smoothstep(35.0, 80.0, steps) * 0.55;
    col *= ao;

    // Treble micro-shimmer (high-freq hits make surface sparkle)
    float spark = step(0.985, hash3(p * 18.0 + u_time * 4.0)) * u_trebleHit;
    col += vec3(spark) * 1.4;
  } else {
    // Background — deep cosmic palette, hint of low-freq aura
    col = chakraTint(fract(u_chakraFlow * u_time * 0.04 + r2d * 0.4)) * 0.06;
    col += vec3(0.012, 0.008, 0.022);
  }

  // ── Aura halo overlay ──
  // Three layers of glow: tight inner core, medium ring, soft outer halo.
  // Each layer reacts to a different audio band so the aura visually "decomposes" the music.
  float coreGlow = exp(-r2d * 5.0);
  float ringGlow = exp(-pow(r2d - 0.45, 2.0) * 24.0);
  float outerGlow = exp(-r2d * 1.4);

  vec3 hueA = chakraTint(fract(u_time * 0.045));
  vec3 hueB = chakraTint(fract(u_time * 0.045 + 0.33));
  vec3 hueC = chakraTint(fract(u_time * 0.045 + 0.66));

  col += hueA * coreGlow  * u_aura * (0.85 + u_bassHit  * 1.50);
  col += hueB * ringGlow  * u_aura * (0.45 + u_midHit   * 1.20);
  col += hueC * outerGlow * u_aura * 0.30 * (0.55 + u_treblePres * 0.8);

  // Soft star-field background grain (very subtle)
  float starNoise = step(0.998, hash3(vec3(gl_FragCoord.xy * 1.7, floor(u_time * 4.0))));
  col += starNoise * 0.40 * vec3(0.95, 0.95, 1.00);

  // ── Final tonemap + vignette ──
  col *= smoothstep(1.85, 0.20, r2d);
  col = col / (1.0 + col);             // Reinhard tonemap — keeps highlights from blowing
  col = pow(col, vec3(0.86));          // Gentle gamma

  gl_FragColor = vec4(col, 1.0);
}
