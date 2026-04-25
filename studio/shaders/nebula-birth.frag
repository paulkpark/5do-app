#pragma use_lib palette
#pragma use_lib audio
precision highp float;
uniform float u_time;
uniform vec2  u_resolution;

// ── Preset parameters ──
uniform float u_speed;          // 0-1     gas drift speed
uniform float u_density;        // 0.5-2   cloud density
uniform float u_starDensity;    // 0-1
uniform float u_palette;        // 0-1
uniform float u_glow;           // 0-2
uniform float u_audioReact;     // 0-1
uniform float u_swirl;          // 0-1     rotational distortion
uniform float u_emissionPower;  // 0.5-2   bright stars-formation core intensity

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float hash22Float(vec2 p) {
  return fract(sin(dot(p, vec2(269.5, 183.3))) * 43758.5453);
}

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
  for (int i = 0; i < 6; i++) {
    v += amp * vnoise(p);
    p *= 2.07; amp *= 0.5;
  }
  return v;
}

mat2 rot(float a) { return mat2(cos(a), -sin(a), sin(a), cos(a)); }

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float r = length(uv);

  float t = u_time * u_speed * 0.05;

  // ── Swirling distortion ──
  // Rotate UV by an angle depending on radius — closer to center rotates faster.
  // Creates a soft swirl typical of nebulae.
  float swirlAng = u_swirl * (1.5 / max(r, 0.2)) - t * 4.0;
  vec2 swirledUV = rot(swirlAng) * uv;

  // ── Multi-octave noise for cloud density ──
  // Use domain-warping for organic gas feel.
  vec2 q = vec2(
    fbm(swirledUV * u_density + t * 0.3),
    fbm(swirledUV * u_density + vec2(5.2, 1.3) - t * 0.4)
  );
  vec2 q2 = vec2(
    fbm(swirledUV * u_density + 4.0 * q + vec2(1.7, 9.2) + t * 0.2),
    fbm(swirledUV * u_density + 4.0 * q + vec2(8.3, 2.8) - t * 0.5)
  );
  float cloud = fbm(swirledUV * u_density + 4.0 * q2);

  // Density falls off with radius (nebulae have natural extent)
  cloud *= smoothstep(2.5, 0.4, r);

  // ── Star-forming bright cores ──
  // Take a few high-frequency samples — peaks become dense bright knots.
  float coreNoise = fbm(swirledUV * 6.0 - t * 0.2);
  float core = smoothstep(0.65, 0.85, coreNoise) * smoothstep(2.0, 0.3, r);
  core *= u_emissionPower;

  // ── Color palette ──
  // Primary: pink/magenta gas. Secondary: blue/cyan emission. Bright cores: white-yellow.
  float hueT = fract(u_palette + cloud * 0.4 + r * 0.2 + t * 0.05);
  vec3 gasA = palette(hueT);
  // Bias toward pink/magenta
  gasA = mix(gasA, vec3(1.0, 0.4, 0.8), 0.45);

  vec3 gasB = palette(fract(u_palette + 0.5 + cloud * 0.3 + t * 0.04));
  gasB = mix(gasB, vec3(0.4, 0.7, 1.4), 0.45);  // bias toward blue/cyan

  // Mix gas colors based on cloud density (denser = more pink, less dense = more blue)
  vec3 gasCol = mix(gasB, gasA, smoothstep(0.3, 0.8, cloud));

  // ── Compose ──
  vec3 col = vec3(0.0);

  // Gas cloud
  float cloudPow = pow(cloud, 1.6);
  col += gasCol * cloudPow * (1.0 + u_glow * 0.6);

  // Bright star-formation cores (white-hot)
  col += vec3(1.5, 1.3, 1.0) * core * (1.0 + u_audioReact * (u_bassHit * 0.6 + u_bassPres * 0.4));

  // ── Background stars ──
  vec2 starGrid = floor(gl_FragCoord.xy * 0.7);
  float sH = hash21(starGrid);
  float starBright = step(0.997 - 0.002 * u_starDensity, sH);
  starBright *= 0.5 + 0.5 * sin(u_time * 1.4 + sH * 14.0);
  col += vec3(0.95, 0.96, 1.0) * starBright * (0.7 + u_trebleHit * 1.4);

  // ── Beat shockwave through nebula — pulse wave from origin ──
  float shock = sin(r * 18.0 - u_beatPhase * 12.0) * 0.5 + 0.5;
  shock *= u_beatOnset * exp(-r * 1.2) * u_audioReact;
  col += vec3(1.0, 0.7, 0.95) * shock * 0.4;

  // ── Subtle deep-space gradient backdrop ──
  vec3 bg = vec3(0.018, 0.012, 0.04);
  col += bg;

  // Vignette + tonemap + gamma
  col *= smoothstep(2.4, 0.30, r);
  col = col / (1.0 + col);
  col = pow(col, vec3(0.86));

  gl_FragColor = vec4(col, 1.0);
}
