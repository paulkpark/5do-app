#pragma use_lib palette
#pragma use_lib audio
precision highp float;
uniform float u_time;
uniform vec2  u_resolution;

// ── Preset parameters ──
uniform float u_speed;        // 0-2    flow velocity
uniform float u_symmetry;     // 3-16   angular sectors (kaleidoscopic fold)
uniform float u_tunnelDepth;  // 0-1    0 = flat, 1 = deep tunnel
uniform float u_plasmaFreq;   // 0.5-3  plasma wave density
uniform float u_glow;         // 0-1    center bloom strength
uniform float u_twist;        // 0-1    rotational shear per depth
uniform float u_beatPulse;    // 0/1    toggle beat-driven radius pump

// Cheap 2D hash/noise for a mist overlay
float hash21(vec2 p) {
  p = fract(p * vec2(234.17, 453.12));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;

  // Beat pulse — squeeze/expand the tube radius
  float pump = u_beatPulse * u_beatOnset * 0.35;
  uv *= 1.0 - pump;

  float r = length(uv);
  float a = atan(uv.y, uv.x);

  // Kaleidoscopic angular fold (Karleido-signature radial symmetry)
  float N = max(2.0, floor(u_symmetry + 0.5));
  float sector = 3.14159265 / N;
  a = abs(mod(a + sector, sector * 2.0) - sector);

  // Tunnel projection — blend flat disc with 1/r perspective
  float z = mix(r, 1.0 / max(r, 0.08), u_tunnelDepth);

  // Rotational shear (twist with depth)
  a += z * u_twist * 2.5;

  // Time driven by speed + audio presence (subtle pressure follow)
  float t = u_time * u_speed * 0.55 + u_bassPres * 0.9 + u_beatPhase * 0.15;

  // Plasma field — four stacked sines, hit by treble high-frequency jitter
  float pf = u_plasmaFreq * 4.0 + u_trebleHit * 1.2;
  float v  = sin(z * pf + t * 2.1);
  v += sin(a * 4.0 + t * 1.35);
  v += sin((z + a) * pf * 0.7 - t * 1.7);
  v += sin(sqrt(z * z + a * a) * pf * 0.9 + t * 0.85);
  v = v * 0.25 + 0.5;

  // Palette sweep driven by plasma + audio offset
  float pt = fract(v + u_trebleHit * 0.18 + u_time * 0.02);
  vec3 col = palette(pt);

  // Mist grain — hint of texture in the plasma
  float mist = hash21(gl_FragCoord.xy * 0.5 + floor(t * 60.0));
  col += (mist - 0.5) * 0.035;

  // Center glow — exponential bloom with strong beat response
  float center = exp(-r * 2.8) * (0.45 + u_glow);
  col += palette(0.28) * center * (0.65 + u_beatOnset * 1.6 + u_bassHit * 0.4);

  // Outer ring light — ring at ~80% radius that pulses on snare
  float ring = smoothstep(0.04, 0.0, abs(r - 0.82));
  col += ring * palette(fract(0.6 + u_time * 0.1)) * (0.25 + u_midHit * 0.7);

  // Edge vignette
  col *= smoothstep(1.8, 0.2, r);

  // Gamma
  col = pow(max(col, 0.0), vec3(0.88));

  gl_FragColor = vec4(col, 1.0);
}
