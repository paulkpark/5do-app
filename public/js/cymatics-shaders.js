// public/js/cymatics-shaders.js

export const VERT_GLSL = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const COMMON_GLSL = `
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

vec3 palette(float t, vec3 a, vec3 b, vec3 c) {
  t = clamp(t, 0.0, 1.0);
  if (t < 0.5) return mix(a, b, t * 2.0);
  return mix(b, c, (t - 0.5) * 2.0);
}

vec3 hueRotate(vec3 c, float angle) {
  float cosA = cos(angle);
  float sinA = sin(angle);
  mat3 m = mat3(
    0.299 + 0.701*cosA + 0.168*sinA, 0.587 - 0.587*cosA + 0.330*sinA, 0.114 - 0.114*cosA - 0.497*sinA,
    0.299 - 0.299*cosA - 0.328*sinA, 0.587 + 0.413*cosA + 0.035*sinA, 0.114 - 0.114*cosA + 0.292*sinA,
    0.299 - 0.300*cosA + 1.250*sinA, 0.587 - 0.588*cosA - 1.050*sinA, 0.114 + 0.886*cosA - 0.203*sinA
  );
  return clamp(m * c, 0.0, 1.0);
}

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
`;

const PATTERN_PLACEHOLDERS_GLSL = `
vec3 patternChladni(vec2 uv) {
  float bass = bassEnergy();
  float mid = midEnergy();
  float treble = trebleEnergy();

  float n = 3.0 + treble * 8.0;
  float m = 4.0 + mid * 6.0;

  float a = sin(n * 3.14159 * uv.x + u_time * 0.5);
  float b = sin(m * 3.14159 * uv.y + u_time * 0.4);
  float field = a + b;

  float node = exp(-pow(field, 2.0) * 20.0);

  vec3 base = palette(0.5 + 0.4 * sin(u_time * 0.2), u_palA, u_palB, u_palC) * (0.05 + bass * 0.4);

  vec3 line = palette(0.5 + 0.5 * sin(field * 2.0 + u_time * 0.3), u_palA, u_palB, u_palC);

  return base + line * node * (0.6 + treble * 0.4);
}
vec3 patternMandala(vec2 uv) {
  float bass = bassEnergy();
  float mid = midEnergy();
  float treble = trebleEnergy();

  vec2 p = uv;
  float r = length(p);
  float theta = atan(p.y, p.x);

  float petals = 6.0 + floor(treble * 4.0);
  float petal = cos(theta * petals + u_time * 0.3);

  float breath = 0.6 + bass * 0.4 + sin(u_time * 1.0) * 0.05;
  float ring = exp(-pow((r - breath) * 6.0, 2.0));
  float inner = exp(-pow(r * 4.0, 2.0)) * (0.5 + bass * 0.5);

  float petalGlow = exp(-pow((r - breath * 0.7) * 5.0, 2.0)) * (0.5 + 0.5 * petal);

  vec3 col = vec3(0.0);
  col += palette(r, u_palA, u_palB, u_palC) * inner;
  col += palette(0.5 + 0.5 * sin(theta * 2.0 + u_time * 0.4), u_palA, u_palB, u_palC) * ring;
  col += palette(treble, u_palB, u_palC, u_palA) * petalGlow * (0.6 + mid * 0.6);

  return col;
}
vec3 patternLiquid(vec2 uv) { return vec3(0.0); }
vec3 patternParticle(vec2 uv) { return vec3(0.0); }
`;

export const FRAG_GLSL = `#version 300 es
precision highp float;

uniform sampler2D u_fftTex;
uniform float u_time;
uniform vec2 u_resolution;
uniform int u_mode;
uniform vec3 u_palA;
uniform vec3 u_palB;
uniform vec3 u_palC;
uniform float u_hueOffset;

in vec2 v_uv;
out vec4 outColor;

${COMMON_GLSL}
${PATTERN_PLACEHOLDERS_GLSL}

void main() {
  vec2 uv = v_uv * 2.0 - 1.0;
  uv.x *= u_resolution.x / u_resolution.y;
  vec3 col;
  if (u_mode == 0) col = patternChladni(uv);
  else if (u_mode == 1) col = patternMandala(uv);
  else if (u_mode == 2) col = patternLiquid(uv);
  else col = patternParticle(uv);

  col = hueRotate(col, u_hueOffset);

  outColor = vec4(col, 1.0);
}
`;
