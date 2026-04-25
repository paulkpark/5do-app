#pragma use_lib palette
#pragma use_lib audio
precision highp float;
uniform float u_time;
uniform vec2  u_resolution;

// ── Preset parameters ──
uniform float u_speed;          // 0-1     overall flow
uniform float u_breath;         // 0-1     breath-cycle amplitude
uniform float u_layers;         // 1-5     halo layer count
uniform float u_particleCount;  // 0-1     drifting particle density
uniform float u_glow;           // 0-2
uniform float u_audioReact;     // 0-1
uniform float u_palette;        // 0-1     hue offset
uniform float u_corePower;      // 0.3-1.5 central core brightness

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float r = length(uv);
  float a = atan(uv.y, uv.x);

  float t = u_time * u_speed;

  // ── Breath cycle: slow sine modulation drives layer pulsing ──
  // Period ~5 seconds (typical meditation breath)
  float breath = 0.5 + 0.5 * sin(t * 0.55);
  // Augment with audio presence (very gentle)
  float bAdj = u_breath * (0.20 * u_bassPres + 0.05 * u_midPres);

  vec3 col = vec3(0.0);

  // ── Multiple concentric halo layers ──
  // Each layer sits at a different radius, pulses with breath, has a chakra hue
  int layerN = int(clamp(u_layers, 1.0, 5.0));
  for (int i = 0; i < 5; i++) {
    if (i >= layerN) break;
    float fi = float(i);
    // Layer base radius spread across screen
    float layerR = 0.15 + fi * 0.18;
    // Breath-driven radius modulation (each layer slightly out of phase)
    float phase = fi * 0.45;
    float bR = layerR * (1.0 + (breath + bAdj) * 0.18 * sin(phase + t * 0.4));
    // Distance to layer ring centerline
    float layerDist = abs(r - bR);
    // Soft gaussian thickness
    float thickness = 0.07 + 0.05 * sin(t * 0.25 + fi);
    float layerMask = exp(-layerDist * layerDist / (thickness * thickness));
    // Layer hue: rotates through palette + offset per layer
    float hueT = fract(u_palette + fi * 0.13 + t * 0.025);
    vec3 hue = palette(hueT);
    col += hue * layerMask * 0.35;
  }

  // ── Central core: the brightest element, breath-pulsed ──
  float coreBright = u_corePower * (0.7 + 0.3 * breath);
  coreBright *= 1.0 + u_audioReact * (u_bassHit * 0.5 + u_bassPres * 0.3);
  vec3 coreCol = palette(fract(u_palette + 0.5 + t * 0.04));
  // Bright tight center + soft falloff to edges
  col += coreCol * (exp(-r * r * 18.0) * 1.4 + exp(-r * 2.5) * 0.45) * coreBright;

  // ── Drifting orbital particles ──
  // Particles slowly orbit, color-shifting along their path
  if (u_particleCount > 0.01) {
    int pN = int(8.0 + u_particleCount * 16.0);
    for (int p = 0; p < 24; p++) {
      if (p >= pN) break;
      float fp = float(p);
      float rOrb = 0.20 + 0.65 * hash21(vec2(fp, 0.0));
      float angSpd = 0.10 + 0.20 * hash21(vec2(fp, 1.0));
      // Direction varies — half clockwise, half counter
      float sign_ = (hash21(vec2(fp, 2.0)) > 0.5) ? 1.0 : -1.0;
      float ang = t * angSpd * sign_ + fp * 0.83;
      // Radial drift (in/out breathing)
      float driftR = rOrb * (1.0 + breath * 0.06 * sin(fp * 0.7 + t * 0.3));
      vec2 pp = vec2(cos(ang), sin(ang)) * driftR;
      float dot_ = exp(-dot(uv - pp, uv - pp) * 1200.0);
      float pHue = fract(fp * 0.13 + u_palette + t * 0.05);
      vec3 pcol = palette(pHue);
      col += pcol * dot_ * (0.7 + u_trebleHit * 0.6);
    }
  }

  // ── Beat ripple — concentric wave from origin on each beat ──
  if (u_audioReact > 0.01) {
    float ripPhase = u_beatPhase * 6.28;
    float rip = sin(r * 24.0 - ripPhase) * 0.5 + 0.5;
    rip *= u_beatOnset * exp(-r * 1.4);
    col += palette(fract(u_palette + 0.7)) * rip * 0.4 * u_audioReact;
  }

  // ── Outer aura blanket ──
  vec3 outerHue = palette(fract(u_palette + 0.3 + t * 0.02));
  col += outerHue * exp(-r * 1.3) * u_glow * 0.25 * (0.6 + u_bassPres * 0.5);

  // ── Background — deep cosmic gradient ──
  col += vec3(0.025, 0.018, 0.05);

  // Vignette + tonemap + gamma
  col *= smoothstep(2.0, 0.30, r);
  col = col / (1.0 + col);
  col = pow(col, vec3(0.86));

  gl_FragColor = vec4(col, 1.0);
}
