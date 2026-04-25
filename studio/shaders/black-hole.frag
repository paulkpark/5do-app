#pragma use_lib palette
#pragma use_lib audio
precision highp float;
uniform float u_time;
uniform vec2  u_resolution;

// ── Preset parameters ──
uniform float u_speed;          // 0-2     disk rotation speed
uniform float u_eventR;         // 0.10-0.25  event horizon radius
uniform float u_diskOuter;      // 0.5-1.5  accretion disk outer radius
uniform float u_diskBands;      // 6-24    band frequency in disk
uniform float u_lensing;        // 0-1     gravitational lensing strength
uniform float u_dopplerStrength;// 0-1     Doppler color shift intensity
uniform float u_audioReact;     // 0-1
uniform float u_jetIntensity;   // 0-1     relativistic jet intensity
uniform float u_starDensity;    // 0-1     background stars

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// fBm for disk turbulence
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
  for (int i = 0; i < 4; i++) {
    v += amp * vnoise(p);
    p *= 2.07; amp *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float r = length(uv);
  float a = atan(uv.y, uv.x);

  float t = u_time * u_speed * 0.5;

  // ── Event horizon + photon ring radii ──
  float eventR  = u_eventR;
  float photonR = eventR * 1.45;   // photon ring just outside event horizon
  float diskInR = eventR * 1.85;
  float diskOutR = u_diskOuter;

  // ── Beat-driven matter swallow flash (event horizon pulses) ──
  eventR *= 1.0 + u_audioReact * u_beatOnset * 0.06;

  // ── Background stars (gravitationally lensed) ──
  // Pseudo-lensing: bend UV around the BH using simple "1/r" displacement.
  vec2 lensUV = uv;
  float lensFactor = u_lensing * eventR / max(r, 0.01);
  lensUV -= uv * lensFactor;     // pull UV slightly toward BH

  // Two layers of stars at different scales
  vec2 starG1 = floor(lensUV * u_resolution.y * 0.6);
  float s1 = hash21(starG1);
  float star1 = step(0.996 - 0.002 * u_starDensity, s1) * (0.6 + 0.4 * sin(u_time * 1.5 + s1 * 14.0));
  vec2 starG2 = floor(lensUV * u_resolution.y * 1.0);
  float s2 = hash21(starG2);
  float star2 = step(0.998, s2) * 0.5;

  vec3 col = vec3(0.95, 0.96, 1.0) * (star1 + star2);

  // ── Subtle deep-space gradient ──
  col += vec3(0.025, 0.018, 0.05);

  // Mask out stars from inside the Einstein ring (matter falls in)
  float starMask = smoothstep(eventR * 1.05, eventR * 1.4, r);
  col *= starMask;

  // ── Accretion disk ──
  if (r > diskInR && r < diskOutR + 0.1) {
    // Disk mask with smooth fade
    float diskFade = smoothstep(diskInR, diskInR + 0.04, r) *
                     smoothstep(diskOutR + 0.05, diskOutR - 0.15, r);
    // Disk thickness — only render near horizontal plane (compress in Y)
    // Tilt the disk slightly so it's visible from "side"
    float tiltY = uv.y - uv.x * 0.10;     // tiny tilt
    float diskZ = abs(tiltY);
    diskFade *= smoothstep(0.30, 0.0, diskZ);

    // Rotation banding — inner orbits faster (Keplerian)
    float orbSpeed = 1.0 / pow(r, 0.5);
    float bandPhase = a + orbSpeed * t;
    float bands = sin(bandPhase * u_diskBands + log(max(r, 0.01)) * 4.0);
    bands = 0.55 + 0.45 * bands;

    // Turbulent disk texture
    vec2 polar = vec2(log(r) * 8.0, a * 5.0);
    float turb = fbm(polar + t * 1.2);
    bands *= 0.6 + 0.4 * turb;

    // Inner disk hotter (bluer/whiter), outer cooler (orange/red)
    vec3 hotCol  = vec3(1.6, 1.1, 0.6);
    vec3 coolCol = vec3(1.4, 0.45, 0.20);
    vec3 diskCol = mix(hotCol, coolCol, smoothstep(diskInR, diskOutR, r));

    // Doppler shift — left side approaching observer (blue-shift), right receding (red-shift)
    float dop = uv.x;  // -1..1
    vec3 doppler = mix(vec3(0.4, 0.7, 1.6), vec3(1.6, 0.55, 0.30), 0.5 + 0.5 * dop);
    diskCol = mix(diskCol, diskCol * doppler, u_dopplerStrength);

    col += diskCol * bands * diskFade * 1.4;
  }

  // ── Photon ring — bright thin ring at the photon sphere ──
  float photonMask = exp(-pow(r - photonR, 2.0) * 1500.0);
  vec3 photonCol = vec3(1.5, 1.2, 0.85);
  col += photonCol * photonMask * (1.6 + u_audioReact * u_beatOnset * 1.5);

  // ── Event horizon (perfect black inside) ──
  if (r < eventR) {
    col = vec3(0.0);
    // Subtle hint of a glow at the very edge — Hawking-radiation aesthetic
    col += vec3(0.08, 0.04, 0.18) * smoothstep(0.0, eventR, r) * 0.4;
  }

  // ── Relativistic jets (perpendicular to disk) ──
  if (u_jetIntensity > 0.01) {
    float jetVert = abs(uv.x);
    float jetCore = exp(-jetVert * jetVert * 800.0) * exp(-abs(uv.y) * 0.6);
    vec3 jetCol = mix(vec3(0.4, 0.7, 1.5), vec3(1.0, 1.0, 1.0), 0.5);
    col += jetCol * jetCore * u_jetIntensity * 0.6 * (0.5 + u_treblePres);
    // Pulsing knots traveling along the jet
    float jetKnot = step(0.95, fract(uv.y * 4.0 - t * 1.5));
    col += jetCol * jetKnot * jetCore * u_jetIntensity * u_audioReact * u_beatOnset;
  }

  // ── Beat halo: bright ring expanding from event horizon ──
  if (u_audioReact > 0.01) {
    float pulseR = mix(eventR, diskOutR, u_beatPhase);
    float pulse = exp(-pow(r - pulseR, 2.0) * 400.0) * u_beatOnset * u_audioReact * 0.5;
    col += vec3(1.4, 1.0, 0.8) * pulse;
  }

  // ── Tonemap + gentle vignette ──
  col *= smoothstep(2.2, 0.35, r);
  col = col / (1.0 + col);
  col = pow(col, vec3(0.85));

  gl_FragColor = vec4(col, 1.0);
}
