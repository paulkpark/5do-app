// public/js/torus-shaders.js
//
// GLSL ES 3.00 sources for the Quantum Torus visualizer.
//
// Design note: no vertex positions are ever uploaded for the fibers or the
// particles. Each vertex carries two floats — a curve parameter and a fiber
// index — and evaluates P(u,v) itself. The CPU only touches 9 floats per node
// (position+scale, orientation, depth), so the recursion can grow by orders of
// magnitude without the per-frame upload growing with it.

const TAU_GLSL = '6.283185307179586';

/** Shared helpers: quaternion rotation and the projected-torus parametrization. */
const COMMON = `
#define TAU ${TAU_GLSL}
// Outer radius of the unit construction (1 + √2). Doubles as the on-screen
// size estimate for a node, which is what the particle gate measures against.
#define SILVER 2.414213562373095

vec3 qrot(vec4 q, vec3 v) {
  return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v);
}

// P(u,v) = geom * (cos u, sin u, cos v) / (C - sin v)
vec3 torPoint(float u, float v, float C, float geom) {
  return geom * vec3(cos(u), sin(u), cos(v)) / (C - sin(v));
}

// Which family a fiber index belongs to, and its phase within that family.
float chirOf(float f, float m)  { return f < m ? 1.0 : -1.0; }
float indexOf(float f, float m) { return f < m ? f : f - m; }

// The two chiralities counter-rotate: +alpha for one family, -alpha for the
// other. Advancing both by the same amount would merely spin the object.
float basePhase(float f, float m, float depth, float delta, float alpha) {
  float chir = chirOf(f, m);
  return TAU * indexOf(f, m) / m + chir * (depth * delta + alpha);
}

// Axial profile scale, applied in each node's own local frame so that a global
// squash never shears a rotated child.
vec3 deform(vec3 p, float profileZ) {
  p.z *= profileZ;
  return p;
}
`;

// ─── Fibers: instanced line segments ─────────────────────────────────────────

export const FIBER_VERT = `#version 300 es
precision highp float;
${COMMON}

in float aT;              // curve parameter for this vertex
in float aF;              // fiber index, [0, m) = +chirality, [m, 2m) = -
in vec4  iPosScale;       // per node: xyz position, w uniform scale
in vec4  iQuat;           // per node: orientation
in float iDepth;          // per node: recursion level
in vec3  iLight;          // per node: key light pre-rotated into node space

uniform mat4  u_viewProj;
uniform float u_m, u_delta, u_alpha, u_C, u_geom, u_profile;
uniform float u_sheenStrength, u_sheenSharpness;
uniform vec3  u_sheenColor;
uniform vec3  u_plusByDepth[4];
uniform vec3  u_minusByDepth[4];
uniform float u_audioSheen;   // treble lifts the specular streak
uniform float u_audioGlow;    // overall level lifts base brightness

out vec3 vColor;

void main() {
  float chir = chirOf(aF, u_m);
  float u = chir * aT + basePhase(aF, u_m, iDepth, u_delta, u_alpha);
  float v = aT;

  // One trig evaluation each; this shader runs on hundreds of thousands of
  // vertices per frame and recomputing sin/cos here is measurable.
  float su = sin(u), cu = cos(u), sv = sin(v), cv = cos(v);
  float d  = u_C - sv;
  vec3 local = u_geom * vec3(cu, su, cv) / d;

  // Analytic tangent dP/dt with du/dt = chir, dv/dt = 1, pre-multiplied by d*d
  // so both divisions cancel. normalize() removes the common factor, and d > 0
  // because u_C > 1 >= sin v for every valid hole ratio.
  vec3 T = normalize(chir * d * vec3(-su, cu, 0.0)
                     + vec3(cu * cv, su * cv, 1.0 - u_C * sv));

  // Lines have no normal, so the highlight comes off the tangent instead:
  // brightest where the curve runs perpendicular to the light.
  float sheen = (u_sheenStrength + u_audioSheen)
              * pow(max(1.0 - abs(dot(T, iLight)), 0.0), u_sheenSharpness);

  int di = int(clamp(iDepth, 0.0, 3.0));
  vec3 base = chir > 0.0 ? u_plusByDepth[di] : u_minusByDepth[di];
  vColor = mix(base * (1.0 + u_audioGlow), u_sheenColor, clamp(sheen, 0.0, 1.0));

  local = deform(local, u_profile);
  vec3 p = qrot(iQuat, local * iPosScale.w) + iPosScale.xyz;
  gl_Position = u_viewProj * vec4(p, 1.0);
}`;

export const FIBER_FRAG = `#version 300 es
precision highp float;
uniform float u_opacity;
in vec3 vColor;
out vec4 outColor;
void main() { outColor = vec4(vColor, u_opacity); }`;

// ─── Particles: instanced points flowing along the fibers ────────────────────

export const PARTICLE_VERT = `#version 300 es
precision highp float;
${COMMON}

in float aF, aPhase, aSpd, aSeed, aSize, aTail;
in vec4  iPosScale;
in vec4  iQuat;
in float iDepth;

uniform mat4  u_view, u_proj;
uniform float u_m, u_delta, u_alpha, u_C, u_geom, u_profile;
uniform float u_time, u_flow, u_size, u_alphaMul;
uniform float u_resScale, u_focal, u_gateLo, u_gateHi, u_sizeGamma;
uniform vec3  u_plusByDepth[4];
uniform vec3  u_minusByDepth[4];
uniform float u_audioFlow, u_audioBright;

out vec3 vCol;
out float vA;

void main() {
  float chir = chirOf(aF, u_m);
  float ph   = basePhase(aF, u_m, iDepth, u_delta, u_alpha);

  // The particle's own parameter advances along the fiber — this is the flow.
  float t = aPhase + u_time * aSpd * (u_flow + u_audioFlow);
  vec3 local = torPoint(chir * t + ph, t, u_C, u_geom);
  local = deform(local, u_profile);

  vec3 p = qrot(iQuat, local * iPosScale.w) + iPosScale.xyz;
  vec4 mv = u_view * vec4(p, 1.0);
  float depthEye = max(0.001, -mv.z);

  // A node only a few pixels across cannot show flow, so its particles collapse
  // to zero size and emit no fragments at all.
  float pxR  = iPosScale.w * SILVER * u_focal / depthEye;
  float gain = smoothstep(u_gateLo, u_gateHi, pxR);

  float tw = 0.82 + 0.18 * sin(u_time * 2.3 + aSeed * 628.318);
  int di = int(clamp(iDepth, 0.0, 3.0));
  vCol = (chir > 0.0 ? u_plusByDepth[di] : u_minusByDepth[di]) * (1.35 + u_audioBright);
  vA = u_alphaMul * aTail * tw * gain;

  // Node scale spans a couple of orders of magnitude across depths, so point
  // size follows a gamma rather than tracking scale linearly.
  float sizeScale = pow(max(iPosScale.w, 1e-5), u_sizeGamma);

  // u_resScale references the same fixed-height buffer the bloom uses, not
  // devicePixelRatio. A capped dpr keeps a point constant in CSS pixels while
  // the artwork keeps growing with the framebuffer, which makes particles look
  // proportionally tiny on tall or high-DPI displays.
  gl_PointSize = clamp(u_size * aSize * tw * u_resScale * sizeScale * (10.0 / depthEye),
                       0.0, 24.0 * u_resScale);
  if (gain <= 0.0) gl_PointSize = 0.0;
  gl_Position = u_proj * mv;
}`;

export const PARTICLE_FRAG = `#version 300 es
precision highp float;
in vec3 vCol;
in float vA;
out vec4 outColor;
void main() {
  vec2 u = gl_PointCoord - 0.5;
  float r2 = dot(u, u);
  if (r2 > 0.25) discard;
  float g = exp(-r2 * 10.0) * (1.0 - r2 * 4.0);
  float a = g * vA;
  if (a <= 0.002) discard;
  outColor = vec4(vCol * a * 1.15, a);
}`;

// ─── Shell: the solid metallic ring ──────────────────────────────────────────

export const SHELL_VERT = `#version 300 es
precision highp float;
${COMMON}

in vec3 aPos;
in vec3 aNormal;
in vec4 iPosScale;
in vec4 iQuat;
in float iDepth;

uniform mat4  u_viewProj;
uniform float u_profile;
uniform vec3  u_torusByDepth[4];

out vec3 vNormal;
out vec3 vWorld;
out vec3 vBase;

void main() {
  vec3 local = deform(aPos, u_profile);
  // The profile scale is non-uniform, so the normal takes the inverse
  // transpose — dividing z by the same factor the position multiplied by.
  vec3 n = vec3(aNormal.x, aNormal.y, aNormal.z / max(u_profile, 1e-5));

  vec3 p = qrot(iQuat, local * iPosScale.w) + iPosScale.xyz;
  vNormal = normalize(qrot(iQuat, n));
  vWorld = p;
  vBase = u_torusByDepth[int(clamp(iDepth, 0.0, 3.0))];
  gl_Position = u_viewProj * vec4(p, 1.0);
}`;

export const SHELL_FRAG = `#version 300 es
precision highp float;

uniform vec3  u_camPos;
uniform vec3  u_lightDir;
uniform vec3  u_envLow, u_envMid, u_envHigh, u_envKey;
uniform vec3  u_emissiveColor;
uniform float u_metalness, u_roughness, u_envIntensity;
uniform float u_emissiveStrength, u_opacity, u_audioEmissive;

in vec3 vNormal;
in vec3 vWorld;
in vec3 vBase;
out vec4 outColor;

// Analytic stand-in for a prefiltered environment map: a vertical gradient plus
// two soft key lobes. Costs nothing to load and stays tunable from the palette,
// which matters more here than physical accuracy.
vec3 envColor(vec3 d) {
  float t = d.z * 0.5 + 0.5;
  vec3 c = mix(u_envLow, u_envMid, smoothstep(0.0, 0.55, t));
  c = mix(c, u_envHigh, smoothstep(0.5, 1.0, t));
  c += u_envKey * pow(max(dot(d, u_lightDir), 0.0), 8.0);
  return c;
}

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(u_camPos - vWorld);
  if (dot(N, V) < 0.0) N = -N;           // rings are viewed from both sides
  vec3 R = reflect(-V, N);
  float NdotV = max(dot(N, V), 1e-3);

  vec3 F0 = mix(vec3(0.04), vBase, u_metalness);
  vec3 F = F0 + (1.0 - F0) * pow(1.0 - NdotV, 5.0);

  // Roughness fades the mirror direction toward the normal direction, which is
  // the cheap approximation of widening the specular lobe.
  vec3 spec = mix(envColor(R), envColor(N), u_roughness) * F * u_envIntensity;
  vec3 diff = vBase * (1.0 - u_metalness) * envColor(N) * 0.35;
  vec3 emis = u_emissiveColor * (u_emissiveStrength + u_audioEmissive);

  outColor = vec4(spec + diff + emis, u_opacity);
}`;

// ─── Post-processing ─────────────────────────────────────────────────────────

export const QUAD_VERT = `#version 300 es
precision highp float;
in vec2 a_pos;
out vec2 vUv;
void main() {
  vUv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

export const BRIGHT_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
uniform float u_threshold, u_knee;
in vec2 vUv;
out vec4 outColor;
void main() {
  vec3 c = texture(u_tex, vUv).rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  // A soft knee keeps the bloom from popping on as the level crosses threshold.
  float w = smoothstep(u_threshold, u_threshold + max(u_knee, 1e-4), l);
  outColor = vec4(c * w, 1.0);
}`;

export const BLUR_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
uniform vec2 u_direction;    // texel-sized step, horizontal or vertical
in vec2 vUv;
out vec4 outColor;
void main() {
  // 9-tap gaussian collapsed to 5 bilinear fetches.
  float w0 = 0.2270270270;
  float w1 = 0.3162162162;
  float w2 = 0.0702702703;
  vec2 o1 = u_direction * 1.3846153846;
  vec2 o2 = u_direction * 3.2307692308;
  vec3 c = texture(u_tex, vUv).rgb * w0;
  c += texture(u_tex, vUv + o1).rgb * w1;
  c += texture(u_tex, vUv - o1).rgb * w1;
  c += texture(u_tex, vUv + o2).rgb * w2;
  c += texture(u_tex, vUv - o2).rgb * w2;
  outColor = vec4(c, 1.0);
}`;

export const COMPOSITE_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_scene;
uniform sampler2D u_bloom;
uniform float u_bloomStrength, u_exposure, u_vignette;
in vec2 vUv;
out vec4 outColor;

// Narkowicz ACES approximation — the filmic shoulder is what stops the bright
// fiber cores from clipping to flat white where they cross.
vec3 aces(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

void main() {
  vec3 c = texture(u_scene, vUv).rgb + texture(u_bloom, vUv).rgb * u_bloomStrength;
  c = aces(c * u_exposure);
  vec2 q = (vUv - 0.5) * 2.0;
  float vig = 1.0 - u_vignette * dot(q, q) * 0.42;
  outColor = vec4(c * clamp(vig, 0.0, 1.0), 1.0);
}`;
