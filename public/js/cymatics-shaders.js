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

// Particle Life force matrix — same shape as akashic-frequency/particle-life.js
// matrix[i*N + j] = force type i exerts on type j
// (positive = attract, negative = repel)
export function defaultForceMatrix() {
  const N = N_TYPES;
  const m = new Float32Array(N * N);
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      let v;
      if (i === j) v = 0.15;
      else if (j === (i + 1) % N) v = 0.5;
      else if (j === (i + N - 1) % N) v = -0.3;
      else if (j === (i + 3) % N) v = 0.25;
      else v = -0.1 + 0.2 * ((i * 7 + j * 3) % 5) / 5;
      m[i * N + j] = v;
    }
  }
  return m;
}

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
  float forceScale = FORCE_SCALE * (0.6 + bass * 1.2);
  float damping    = 0.86 + mid * 0.10;     // more mid = lighter damping = more motion

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
