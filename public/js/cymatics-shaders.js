// public/js/cymatics-shaders.js
//
// Real N-body particle simulation in WebGL2.
//
// 1024 particles (32×32 state texture, RGBA32F: x, y, vx, vy)
// 7 particle types (chakra-colored), 7×7 force matrix
// O(N²) pair forces in the update fragment shader (~1M ops / frame)
// Ping-pong: update shader reads tex A, writes tex B; render samples B.
// Audio: bass scales force magnitude, mid loosens damping, treble brightens.

export const PARTICLE_COUNT = 1024;
export const PARTICLE_TEX_SIZE = 32;
export const N_TYPES = 7;

// ─── Force matrix presets ──────────────────────────────────────────────────
// Each preset is a 7×7 matrix flattened to length 49.
// matrix[i*N + j] = force type i exerts on type j (+ attract, − repel).
// We blend between three "personalities" over time to break up steady-state
// clusters; bass kicks inject noise so the system never settles for long.

function _orbitalHarmony() {
  const N = N_TYPES, m = new Float32Array(N * N);
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    if (i === j) m[i*N+j] = 0.15;
    else if (j === (i + 1) % N) m[i*N+j] = 0.5;
    else if (j === (i + N - 1) % N) m[i*N+j] = -0.3;
    else if (j === (i + 3) % N) m[i*N+j] = 0.25;
    else m[i*N+j] = -0.1 + 0.2 * ((i * 7 + j * 3) % 5) / 5;
  }
  return m;
}

function _predatorChase() {
  const N = N_TYPES, m = new Float32Array(N * N);
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    if (i === j) m[i*N+j] = -0.08;          // mild self-repel
    else if (j === (i + 1) % N) m[i*N+j] = 0.85; // strong chase next
    else if (j === (i + N - 1) % N) m[i*N+j] = -0.55; // flee from prev
    else if (j === (i + 2) % N) m[i*N+j] = 0.20;
    else m[i*N+j] = -0.05 + 0.1 * ((i * 11 + j * 5) % 7) / 7;
  }
  return m;
}

function _stormSwarm() {
  const N = N_TYPES, m = new Float32Array(N * N);
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    if (i === j) m[i*N+j] = 0.45;           // strong self-attract → tight clouds
    else m[i*N+j] = -0.25 + 0.45 * (((i + j) * 7 + 13) % 11) / 11; // varied repel/attract
  }
  return m;
}

const _PRESETS = [_orbitalHarmony(), _predatorChase(), _stormSwarm()];

/**
 * Compute the live force matrix for a given time + audio energies.
 * Smoothly cross-fades between three preset personalities (~30s each)
 * and overlays audio-driven noise so bass kicks visibly disturb the
 * dynamics.
 */
export function computeForceMatrix(timeSec, bass = 0, mid = 0) {
  const N = N_TYPES;
  const out = new Float32Array(N * N);
  const cycleLen = 90 + (1 - mid) * 30;       // 90s..120s; mid speeds the cycle up
  const phase = (timeSec / cycleLen) % 1;      // 0..1
  const seg = phase * _PRESETS.length;
  const i0 = Math.floor(seg) % _PRESETS.length;
  const i1 = (i0 + 1) % _PRESETS.length;
  const blendRaw = seg - Math.floor(seg);
  const blend = blendRaw * blendRaw * (3 - 2 * blendRaw);  // smoothstep
  const m0 = _PRESETS[i0], m1 = _PRESETS[i1];
  for (let k = 0; k < N * N; k++) out[k] = m0[k] * (1 - blend) + m1[k] * blend;

  // Bass-driven matrix jitter — particles get knocked into new relationships
  // when a beat hits. Threshold so quiet sections stay legible.
  if (bass > 0.35) {
    const kick = (bass - 0.35) * 0.6;
    for (let k = 0; k < N * N; k++) {
      const noise = Math.sin(timeSec * 13.0 + k * 7.7) * Math.cos(timeSec * 9.0 + k * 3.3);
      out[k] += noise * kick;
    }
  }
  return out;
}

// Back-compat: caller can still ask for a static matrix
export function defaultForceMatrix() { return _orbitalHarmony(); }

// 7 chakra colors (root → crown), as Float32Array for uniform upload
export const CHAKRA_COLORS = new Float32Array([
  1.00, 0.15, 0.25,  // root
  1.00, 0.50, 0.10,  // sacral
  1.00, 0.85, 0.20,  // solar
  0.25, 0.95, 0.35,  // heart
  0.20, 0.65, 1.00,  // throat
  0.40, 0.25, 0.90,  // third eye
  0.75, 0.35, 1.00   // crown
]);

const COMMON_GLSL = `
const int N_PARTICLES = 1024;
const int TEX_SIZE    = 32;
const int N_TYPES     = 7;

float fftBin(sampler2D fft, int i) {
  return texelFetch(fft, ivec2(i, 0), 0).r;
}
float bassEnergy(sampler2D fft) {
  float s = 0.0;
  for (int i = 0; i < 4; i++) s += fftBin(fft, i);
  return s / 4.0;
}
float midEnergy(sampler2D fft) {
  float s = 0.0;
  for (int i = 4; i < 16; i++) s += fftBin(fft, i);
  return s / 12.0;
}
float trebleEnergy(sampler2D fft) {
  float s = 0.0;
  for (int i = 16; i < 32; i++) s += fftBin(fft, i);
  return s / 16.0;
}

float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

ivec2 idxToCoord(int i) {
  return ivec2(i % TEX_SIZE, i / TEX_SIZE);
}

int particleType(int i) {
  // 1024 / 7 = ~146 per type
  return min(N_TYPES - 1, i * N_TYPES / N_PARTICLES);
}
`;

// ─── Quad vertex shader (used by init + update fragment passes) ─────────────
export const QUAD_VERT_GLSL = `#version 300 es
in vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

// ─── Init fragment: random positions, zero velocity ────────────────────────
export const INIT_FRAG_GLSL = `#version 300 es
precision highp float;

uniform float u_seed;
out vec4 outColor;

${COMMON_GLSL}

void main() {
  int idx = int(gl_FragCoord.y) * TEX_SIZE + int(gl_FragCoord.x);
  float r1 = hash11(float(idx) + u_seed);
  float r2 = hash11(float(idx) + u_seed + 7.7);
  // Position uniformly in [-0.9, 0.9]
  float x = (r1 - 0.5) * 1.8;
  float y = (r2 - 0.5) * 1.8;
  outColor = vec4(x, y, 0.0, 0.0);
}
`;

// ─── Update fragment: N-body force integration ─────────────────────────────
export const UPDATE_FRAG_GLSL = `#version 300 es
precision highp float;

uniform sampler2D u_state;       // current state (RGBA32F)
uniform sampler2D u_fftTex;      // 32-bin FFT
uniform float u_matrix[49];      // 7×7 force matrix flat
uniform float u_dt;              // frame time (seconds)
out vec4 outColor;

${COMMON_GLSL}

const float R_MAX = 0.45;        // interaction range
const float BETA  = 0.06;        // close-repel range
const float FORCE_SCALE = 0.30;  // base global scale

void main() {
  int myIdx = int(gl_FragCoord.y) * TEX_SIZE + int(gl_FragCoord.x);
  if (myIdx >= N_PARTICLES) { outColor = vec4(0.0); return; }
  vec4 me = texelFetch(u_state, ivec2(gl_FragCoord.xy), 0);
  int myType = particleType(myIdx);

  float bass = bassEnergy(u_fftTex);
  float mid  = midEnergy(u_fftTex);

  // Audio modulates force magnitude and damping
  float forceScale = FORCE_SCALE * (0.7 + bass * 1.4 + trebleEnergy(u_fftTex) * 0.4);
  float damping    = 0.92 + mid * 0.06;     // 0.92..0.98 — sustains motion longer

  vec2 force = vec2(0.0);
  for (int j = 0; j < N_PARTICLES; j++) {
    if (j == myIdx) continue;
    vec4 other = texelFetch(u_state, idxToCoord(j), 0);
    vec2 d = other.xy - me.xy;
    // Toroidal wrap: shortest distance across the [-1,1] torus
    if (d.x >  1.0) d.x -= 2.0;
    if (d.x < -1.0) d.x += 2.0;
    if (d.y >  1.0) d.y -= 2.0;
    if (d.y < -1.0) d.y += 2.0;
    float dist = length(d);
    if (dist < 1e-6 || dist > R_MAX) continue;
    int otherType = particleType(j);
    float a = u_matrix[myType * N_TYPES + otherType];
    float f;
    if (dist < BETA) {
      // Strong close-range repulsion (universal)
      f = (dist / BETA - 1.0);
    } else {
      // Attraction/repulsion ramp peaking in the middle of [BETA, R_MAX]
      float t = (dist - BETA) / (R_MAX - BETA);
      f = a * (1.0 - abs(2.0 * t - 1.0));
    }
    force += (d / dist) * f;
  }

  vec2 vel = me.zw + force * forceScale * u_dt;
  vel *= damping;
  vec2 pos = me.xy + vel * u_dt;

  // Toroidal wrap on position
  if (pos.x >  1.0) pos.x -= 2.0;
  if (pos.x < -1.0) pos.x += 2.0;
  if (pos.y >  1.0) pos.y -= 2.0;
  if (pos.y < -1.0) pos.y += 2.0;

  outColor = vec4(pos, vel);
}
`;

// ─── Render shaders: read state texture, draw points ───────────────────────
export const RENDER_VERT_GLSL = `#version 300 es

uniform sampler2D u_state;
uniform sampler2D u_fftTex;
uniform vec2 u_resolution;
uniform vec3 u_colors[7];

out vec3 v_color;

${COMMON_GLSL}

void main() {
  int idx = gl_VertexID;
  vec4 s = texelFetch(u_state, idxToCoord(idx), 0);
  vec2 pos = s.xy;
  // Aspect correction
  float aspect = u_resolution.x / max(u_resolution.y, 1.0);
  pos.x /= aspect;

  int t = particleType(idx);
  v_color = u_colors[t];

  // Speed-aware sparkle: faster particles slightly brighter
  float speed = length(s.zw);
  float treble = trebleEnergy(u_fftTex);
  v_color *= 0.55 + treble * 0.55 + clamp(speed * 4.0, 0.0, 0.5);

  // Point size: tiny per-particle randomness + treble flare
  float r1 = hash11(float(idx));
  gl_PointSize = (1.5 + r1 * 3.5) * (1.0 + treble * 1.4);

  gl_Position = vec4(pos, 0.0, 1.0);
}
`;

export const RENDER_FRAG_GLSL = `#version 300 es
precision highp float;

in vec3 v_color;
out vec4 outColor;

void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c) * 2.0;
  float alpha = smoothstep(1.0, 0.0, d);
  alpha = pow(alpha, 2.0);
  outColor = vec4(v_color * alpha, alpha);
}
`;

// ─── Stateless visual modes (Waves, Ripples) ───────────────────────────────
// Fullscreen-quad fragment shader covering 2 alternative visual styles.
// Selected by u_mode (1 = Waves, 2 = Ripples). Mode 0 reserved for the
// N-body particle path which uses different programs entirely.

export const STATELESS_VERT_GLSL = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

// UON-style stateless shader: Plasma Field + Polar Kaleidoscope.
// Counter-rotating chakra/cosine palettes, chromatic aberration, HSV
// hue cycle on top — adapted from akashic-frequency Visual Therapy
// (commit 703a2eb).
export const STATELESS_FRAG_GLSL = `#version 300 es
precision highp float;

uniform sampler2D u_fftTex;
uniform float u_time;
uniform vec2 u_resolution;
uniform int u_mode;          // 1=plasma, 2=kaleido

in vec2 v_uv;
out vec4 outColor;

#define PI 3.14159265
#define TAU 6.28318531

float fftBin(int i) { return texelFetch(u_fftTex, ivec2(i, 0), 0).r; }
float bassEnergy()   { float s=0.0; for(int i=0;i<4;i++)s+=fftBin(i);   return s/4.0;  }
float midEnergy()    { float s=0.0; for(int i=4;i<16;i++)s+=fftBin(i);  return s/12.0; }
float trebleEnergy() { float s=0.0; for(int i=16;i<32;i++)s+=fftBin(i); return s/16.0; }

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}
vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0/3.0, 2.0/3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

// Inigo Quilez cosine palette — infinite smooth rainbow
vec3 cosPalette(float t, float bassMod) {
  vec3 a = vec3(0.5, 0.42, 0.5);
  vec3 b = vec3(0.5, 0.5, 0.5);
  vec3 c = vec3(1.0) + bassMod * 0.3;
  vec3 d = vec3(0.0, 0.33, 0.67);
  return clamp(a + b * cos(TAU * (c * t + d)), 0.0, 1.0);
}

// 7 chakra colors hard-coded (root → crown)
vec3 chakraSample(int idx) {
  if (idx == 0) return vec3(1.00, 0.15, 0.25);
  if (idx == 1) return vec3(1.00, 0.50, 0.10);
  if (idx == 2) return vec3(1.00, 0.85, 0.20);
  if (idx == 3) return vec3(0.25, 0.95, 0.35);
  if (idx == 4) return vec3(0.20, 0.65, 1.00);
  if (idx == 5) return vec3(0.40, 0.25, 0.90);
  return vec3(0.75, 0.35, 1.00);
}
// Multi-stop chakra palette with hat-function blending
vec3 chakraPalette(float t) {
  float fT = fract(t);
  float pos = fT * 7.0;
  float baseI = floor(pos);
  float f = pos - baseI;
  int i0 = int(mod(baseI - 1.0 + 7.0, 7.0));
  int i1 = int(baseI);
  int i2 = int(mod(baseI + 1.0, 7.0));
  vec3 c0 = chakraSample(i0);
  vec3 c1 = chakraSample(i1);
  vec3 c2 = chakraSample(i2);
  float w0 = (1.0 - f) * 0.4;
  float w1 = 1.0 - abs(f - 0.5) * 0.8;
  float w2 = f * 0.4;
  float wSum = w0 + w1 + w2;
  return (c0 * w0 + c1 * w1 + c2 * w2) / wSum;
}

// ── Mode 1: Plasma Field (UON) — multi-sine layered, two counter-flows ──
vec3 plasmaField(vec2 uv, float bass, float mid, float treble, float kick) {
  float zoom = 3.5 + treble * 1.0;
  vec2 P = uv * zoom;
  float t = u_time * 0.6;
  float v = sin(P.x * 1.5 + t)
          + sin(P.y * 2.0 + t * 1.3)
          + sin((P.x + P.y) * 1.2 + t * 0.7)
          + sin(length(P) * 3.0 - t * 0.9);
  v *= 0.25;
  v += sin(t * 2.0 + length(P) * (4.0 + mid * 6.0)) * 0.2;
  v += kick * 0.4;

  vec3 base = chakraPalette(v + u_time * 0.05);
  float v2 = sin(P.x * 1.7 - t * 0.8)
           + sin(P.y * 2.3 - t * 1.1)
           + sin(length(P) * 2.5 + t * 0.6);
  v2 *= 0.3;
  vec3 over = cosPalette(v2 - u_time * 0.04, bass);
  float mixT = 0.5 + 0.3 * sin(uv.x * 4.0 + u_time * 0.2)
                   + 0.2 * cos(uv.y * 5.0 - u_time * 0.15);
  mixT = clamp(mixT, 0.0, 1.0);
  return mix(base, over, mixT);
}

// ── Mode 2: Polar Kaleidoscope (UON) — N-fold radial mirror, dual streams ──
vec3 polarKaleido(vec2 uv, float bass, float mid, float treble, float kick) {
  float r = length(uv);
  float a = atan(uv.y, uv.x);
  float seg = 6.0 + floor(treble * 8.0);
  a = mod(a + PI, TAU / seg) - PI / seg;
  a += u_time * 0.18;
  r *= 1.0 + 0.25 * sin(r * 14.0 - u_time * 1.3 - kick * 2.5);
  vec2 p = vec2(cos(a) * r, sin(a) * r);

  float v = 0.0;
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    v += sin(p.x * (3.0 + fi * 1.7) + u_time * (0.6 + fi * 0.13)) *
         cos(p.y * (3.5 + fi * 1.3) + u_time * (0.5 + fi * 0.11));
  }
  v *= 0.18;

  vec3 base = chakraPalette(v + r * 1.2 + u_time * 0.05 + mid * 0.3);
  vec3 over = cosPalette(v * 0.7 - r * 0.8 - u_time * 0.025 - mid * 0.2, bass);
  float mixT = smoothstep(0.2, 0.9, r) * 0.5;
  return mix(base, over, mixT);
}

vec3 patternAt(vec2 uv, float bass, float mid, float treble, float kick) {
  if (u_mode == 1) return plasmaField(uv, bass, mid, treble, kick);
  return polarKaleido(uv, bass, mid, treble, kick);
}

void main() {
  vec2 uv = v_uv;
  uv.x *= u_resolution.x / max(u_resolution.y, 1.0);

  float bass = bassEnergy();
  float mid = midEnergy();
  float treble = trebleEnergy();
  // Kick approximated from bass^2 — fires harder on percussive onsets
  float kick = clamp(bass * bass * 1.8, 0.0, 1.0);

  // Chromatic aberration: 3-tap re-sample with offset proportional to edge + kick
  float edge = length(uv);
  float ca = (0.004 + kick * 0.014) * edge;
  vec2 dir = (edge < 0.001) ? vec2(1.0, 0.0) : normalize(uv);
  vec3 colR = patternAt(uv + dir * ca, bass, mid, treble, kick);
  vec3 colG = patternAt(uv,            bass, mid, treble, kick);
  vec3 colB = patternAt(uv - dir * ca, bass, mid, treble, kick);
  vec3 col = vec3(colR.r, colG.g, colB.b);

  // Spatial hue separation + global hue cycle
  vec3 hsv = rgb2hsv(col);
  hsv.x = fract(hsv.x + u_time * 0.012 + mid * 0.08 + uv.x * 0.04);
  hsv.y = clamp(hsv.y * (1.0 + bass * 0.4), 0.0, 1.0);
  col = hsv2rgb(hsv);

  outColor = vec4(col, 1.0);
}
`;
