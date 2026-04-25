#pragma use_lib palette
#pragma use_lib audio
precision highp float;
uniform float u_time;
uniform vec2  u_resolution;

// ── Preset parameters ──
uniform float u_speed;          // 0-2     surface boil rate
uniform float u_starSize;       // 0.4-0.9  star disc radius
uniform float u_corona;         // 0-2     corona intensity
uniform float u_prominences;    // 0-1     solar prominence/flare strength
uniform float u_temperature;    // 0-1     0=red giant, 1=blue dwarf
uniform float u_audioReact;     // 0-1
uniform float u_glow;           // 0-2
uniform float u_starfield;      // 0-1

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
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
  float v = 0.0; float amp = 0.5;
  for (int i = 0; i < 5; i++) { v += amp * vnoise(p); p *= 2.07; amp *= 0.5; }
  return v;
}

mat2 rot(float a) { return mat2(cos(a), -sin(a), sin(a), cos(a)); }

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float r = length(uv);
  float a = atan(uv.y, uv.x);

  float t = u_time * u_speed;

  vec3 col = vec3(0.0);

  // ── Star disc ──
  float starR = u_starSize;
  // Beat-driven slight pulsation
  starR *= 1.0 + u_audioReact * u_beatOnset * 0.04;
  float discMask = smoothstep(starR + 0.005, starR - 0.005, r);

  // ── Star surface — boiling plasma (granulation) ──
  if (r < starR + 0.015) {
    // Spherical UV mapping for the disc — give surface a "ball" feel
    // (parallax effect — center looks like top of sphere)
    float depth = sqrt(max(0.0, starR * starR - r * r)) / starR;  // 0 at edge, 1 at center

    // Animated turbulent surface
    vec2 surfUV = uv * 2.0 / starR;
    surfUV.x += t * 0.15;
    float granule = fbm(surfUV * 4.0 + t * 0.5);
    granule += 0.4 * fbm(surfUV * 12.0 + t * 1.2);

    // Sunspots — darker patches from low-frequency noise
    float spots = smoothstep(0.55, 0.30, fbm(surfUV * 1.5 + 7.0));

    // Limb darkening (edges of disc darker than center)
    float limb = pow(depth, 0.6);

    // Color: temperature-dependent gradient
    vec3 hot  = vec3(1.5, 1.4, 1.1);   // white-hot core
    vec3 mid  = vec3(1.3, 0.85, 0.45); // yellow
    vec3 cool = vec3(1.0, 0.45, 0.15); // orange
    vec3 deep = vec3(0.8, 0.20, 0.10); // red
    // Temperature blend — higher temp pulls toward blue
    vec3 stellarTint = mix(deep, mix(cool, mix(mid, hot, granule), granule), granule);
    if (u_temperature > 0.5) {
      vec3 blueTint = mix(vec3(0.8, 0.95, 1.5), vec3(0.5, 0.7, 1.6), 1.0 - granule);
      stellarTint = mix(stellarTint, blueTint, (u_temperature - 0.5) * 2.0);
    }

    vec3 surfaceCol = stellarTint * (0.8 + 0.6 * granule) * limb * (1.0 - spots * 0.6);
    surfaceCol *= 1.3;
    col += surfaceCol * discMask;
  }

  // ── Corona — soft halo around star ──
  float coronaDist = max(r - starR, 0.0);
  float coronaGlow = exp(-coronaDist * 1.6) * u_corona;
  // Dynamic corona shape — wobbles with hot fbm
  float coronaPattern = fbm(vec2(a * 4.0 + t * 0.3, r * 8.0 - t * 0.2));
  coronaGlow *= 0.5 + 0.5 * coronaPattern;
  vec3 coronaCol = mix(vec3(1.4, 0.9, 0.4), vec3(1.6, 0.6, 0.9), u_temperature);
  col += coronaCol * coronaGlow;

  // ── Solar prominences — flame-like plasma loops at the limb ──
  if (u_prominences > 0.01) {
    // Multiple flares at random angles
    float flame = 0.0;
    for (int i = 0; i < 6; i++) {
      float fi = float(i);
      float baseAng = fi * 1.047 + t * 0.05;
      // Oscillation in flare amplitude (each flare grows/shrinks at own rate)
      float amp = 0.04 + 0.10 * (0.5 + 0.5 * sin(t * 0.7 + fi * 1.6 + u_bassPres * 1.5));
      float angDiff = abs(a - baseAng);
      angDiff = min(angDiff, 6.28318 - angDiff);
      float angSig = 0.20;
      // Distance from limb
      float limbDist = r - starR;
      float flameMask = exp(-angDiff * angDiff / (angSig * angSig)) *
                        smoothstep(amp, 0.0, limbDist) *
                        step(0.0, limbDist);
      flame += flameMask;
    }
    flame *= u_prominences;
    col += coronaCol * flame * 1.6 * (1.0 + u_audioReact * u_midHit * 1.5);
  }

  // ── Beat flare — explosive expansion of corona on beat ──
  float beatFlare = exp(-coronaDist * 0.8) * u_beatOnset * u_audioReact * 0.55;
  col += coronaCol * beatFlare;

  // ── Background star field ──
  if (u_starfield > 0.01) {
    vec2 starG = floor(gl_FragCoord.xy * 0.7);
    float sH = hash21(starG);
    float star = step(0.998 - 0.002 * u_starfield, sH);
    star *= 0.4 + 0.6 * sin(u_time * 1.5 + sH * 14.0);
    col += vec3(0.95, 0.97, 1.0) * star * (0.7 + u_trebleHit * 1.2);
  }

  // ── Background — deep cosmic gradient ──
  col += vec3(0.018, 0.012, 0.04);

  // Glow boost
  col += col * u_glow * 0.30;

  // Vignette + tonemap + gamma
  col *= smoothstep(2.0, 0.30, r);
  col = col / (1.0 + col);
  col = pow(col, vec3(0.86));

  gl_FragColor = vec4(col, 1.0);
}
