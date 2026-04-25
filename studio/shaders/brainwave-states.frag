#pragma use_lib palette
#pragma use_lib audio
precision highp float;
uniform float u_time;
uniform vec2  u_resolution;

// ── Preset parameters ──
uniform float u_speed;        // 0-2     wave flow rate
uniform float u_amplitude;    // 0.05-0.4  wave height
uniform float u_thickness;    // 0.005-0.05 line thickness
uniform float u_glow;         // 0-2
uniform float u_audioReact;   // 0-1
uniform float u_blend;        // 0-1     line vs filled-region balance
uniform float u_resonance;    // 0-1     standing-wave overlap intensity

// Colors per brainwave band
//   Delta (slow, 0.5-4 Hz)   — deep blue   — root sleep
//   Theta (4-8 Hz)           — violet      — meditation/trance
//   Alpha (8-13 Hz)          — teal        — relaxed alert
//   Beta (13-30 Hz)          — yellow      — focused (NOT shown by default)
// We render Delta + Theta + Alpha as 3 main waves.

float wave(vec2 uv, float frequency, float phase, float amplitude) {
  return uv.y - amplitude * sin(uv.x * frequency + phase);
}

float waveLine(float wDist, float thickness, float glow) {
  float core = smoothstep(thickness * 1.5, 0.0, abs(wDist));
  float halo = exp(-wDist * wDist / (thickness * thickness * 36.0)) * 0.45 * glow;
  return max(core, halo);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time * u_speed;

  // ── Delta wave — slow + deep ──
  float dFreq  = 1.4;
  float dAmp   = u_amplitude * (1.0 + u_audioReact * u_bassPres * 1.5);
  float dPhase = t * 0.6 + u_bassPres * 1.0;
  float dDist  = wave(uv - vec2(0.0, -0.45), dFreq, dPhase, dAmp);

  // ── Theta wave — medium ──
  float thFreq  = 3.5;
  float thAmp   = u_amplitude * 0.8 * (1.0 + u_audioReact * u_midPres * 1.4);
  float thPhase = t * 1.5 + u_midPres * 1.4;
  float thDist  = wave(uv, thFreq, thPhase, thAmp);

  // ── Alpha wave — fast + crisp ──
  float aFreq  = 6.5;
  float aAmp   = u_amplitude * 0.6 * (1.0 + u_audioReact * u_treblePres * 1.2);
  float aPhase = t * 2.4 + u_treblePres * 1.8;
  float aDist  = wave(uv - vec2(0.0, 0.45), aFreq, aPhase, aAmp);

  // ── Render each wave ──
  float w = u_thickness;
  vec3 deltaCol = vec3(0.10, 0.22, 0.85);   // deep blue
  vec3 thetaCol = vec3(0.55, 0.20, 0.95);   // violet
  vec3 alphaCol = vec3(0.18, 0.85, 0.85);   // teal

  float dLine = waveLine(dDist, w, u_glow);
  float thLine = waveLine(thDist, w, u_glow);
  float aLine  = waveLine(aDist, w, u_glow);

  vec3 col = deltaCol * dLine
           + thetaCol * thLine
           + alphaCol * aLine;

  // ── Filled regions under waves (smooth gradient bands) ──
  if (u_blend > 0.01) {
    float dFill  = smoothstep(0.0, 0.4, -dDist);
    float thFill = smoothstep(0.0, 0.4, -thDist);
    float aFill  = smoothstep(0.0, 0.4, -aDist);
    col += deltaCol * dFill * 0.10 * u_blend;
    col += thetaCol * thFill * 0.10 * u_blend;
    col += alphaCol * aFill * 0.10 * u_blend;
  }

  // ── Standing-wave overlap zones — bright where waves cross ──
  if (u_resonance > 0.01) {
    float overlap = exp(-abs(dDist - thDist) * 20.0)
                  + exp(-abs(thDist - aDist) * 20.0)
                  + exp(-abs(dDist - aDist) * 20.0);
    overlap *= 0.18 * u_resonance;
    vec3 ovcol = mix(thetaCol, alphaCol, 0.5);
    col += ovcol * overlap;
  }

  // ── Beat-driven flash on waves ──
  col += deltaCol * dLine * u_bassHit * u_audioReact * 0.7;
  col += thetaCol * thLine * u_midHit  * u_audioReact * 0.7;
  col += alphaCol * aLine  * u_trebleHit * u_audioReact * 0.7;

  // ── Background gradient (deep meditation cosmos) ──
  vec3 bg = mix(vec3(0.025, 0.012, 0.06), vec3(0.05, 0.02, 0.12), 0.5 + 0.5 * uv.y);
  col += bg;

  // ── Sub-grid scan-lines for "EEG monitor" feel ──
  float scan = 0.92 + 0.08 * sin(uv.y * 200.0);
  col *= scan;

  // ── Frequency labels — 3 horizontal "tracks" ──
  // (Just dim band gradients to suggest the channels)
  float channelMask = step(abs(abs(uv.y - 0.45) - 0.45), 0.001) +
                      step(abs(uv.y), 0.001) +
                      step(abs(uv.y + 0.45), 0.001);
  // (channelMask not actually rendered — too sharp)

  // Vignette + tonemap + gamma
  float r = length(uv);
  col *= smoothstep(2.2, 0.5, r);
  col = col / (1.0 + col);
  col = pow(col, vec3(0.88));

  gl_FragColor = vec4(col, 1.0);
}
