// public/js/cymatics-shaders.js
//
// WebGL2 procedural particle visualizer.
// 2048 particles drawn as additive-blended points; positions/colors computed
// in the vertex shader from gl_VertexID + FFT energy bands. No persistent
// state — fully procedural so it stays cheap and works on every WebGL2
// device. The 32-bin FFT texture is the only audio input.

const COMMON_GLSL = `
uniform sampler2D u_fftTex;
uniform float u_time;
uniform vec2 u_resolution;

float fftBin(int i) {
  return texelFetch(u_fftTex, ivec2(i, 0), 0).r;
}
float bassEnergy() {
  float s = 0.0;
  for (int i = 0; i < 4; i++) s += fftBin(i);
  return s / 4.0;
}
float midEnergy() {
  float s = 0.0;
  for (int i = 4; i < 16; i++) s += fftBin(i);
  return s / 12.0;
}
float trebleEnergy() {
  float s = 0.0;
  for (int i = 16; i < 32; i++) s += fftBin(i);
  return s / 16.0;
}

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}
`;

export const VERT_GLSL = `#version 300 es
${COMMON_GLSL}

out vec3 v_color;

#define PI 3.14159265
#define TAU 6.28318531
#define N_PARTICLES 2048.0

void main() {
  float idx = float(gl_VertexID);
  float a = idx / N_PARTICLES;

  float bass = bassEnergy();
  float mid = midEnergy();
  float treble = trebleEnergy();
  float t = u_time;

  // Per-particle randomness
  float r1 = hash11(idx);
  float r2 = hash11(idx + 7.7);
  float r3 = hash11(idx + 13.3);

  // Number of orbital arms varies per particle for organic chaos
  float orbitArms = floor(2.0 + r1 * 5.0);    // 2..6
  float speed     = 0.2 + r2 * 0.6 + bass * 0.5;

  // Radial distribution with audio-driven pulse
  float baseR     = 0.15 + a * 0.75;
  float radialOsc = sin(t * 0.4 + r3 * TAU) * 0.15
                  + cos(t * 0.7 + a * 8.0) * 0.05;
  float r         = baseR + radialOsc + bass * 0.08;

  float ang = a * TAU * orbitArms + t * speed * (0.5 + r2);

  // Curl-like perturbation, magnitude tied to mid energy
  vec2 pos = vec2(cos(ang) * r, sin(ang) * r);
  pos.x += sin(t * 0.7 + ang * 3.0) * 0.08 * mid;
  pos.y += cos(t * 0.5 + ang * 2.0) * 0.08 * mid;

  // Aspect-correct so circles stay circles regardless of canvas ratio
  float aspect = u_resolution.x / max(u_resolution.y, 1.0);
  pos.x /= aspect;

  // Point size: mostly per-particle, treble for sparkle
  float baseSize = 1.5 + r1 * 3.5;
  float pulse    = 1.0 + 0.8 * sin(t * 1.7 + r1 * TAU) * (0.4 + treble);
  gl_PointSize   = baseSize * pulse * (1.0 + treble * 1.5);

  // Hue cycles slowly; saturation high for vivid feel; brightness with treble
  float hue = fract(r1 * 0.5 + r2 * 0.3 + t * 0.04);
  float val = 0.45 + treble * 0.45 + r3 * 0.15;
  v_color   = hsv2rgb(vec3(hue, 0.85, val));

  gl_Position = vec4(pos, 0.0, 1.0);
}
`;

export const FRAG_GLSL = `#version 300 es
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

export const PARTICLE_COUNT = 2048;
