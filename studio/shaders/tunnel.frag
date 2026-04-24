#pragma use_lib palette
#pragma use_lib audio
precision highp float;
uniform float u_time;
uniform vec2  u_resolution;

uniform float u_speed;     // 0-3    travel speed
uniform float u_twist;     // 0-1    rotational shear with depth
uniform float u_rings;     // 3-20   ring density
uniform float u_ribbons;   // 0-1    radial ribbons strength
uniform float u_glow;      // 0-1.5
uniform float u_pulse;     // 0/1    beat-driven camera pulse

mat2 rot2(float a) { return mat2(cos(a), -sin(a), sin(a), cos(a)); }

// Cheap 2D hash
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;

  // Camera pulse on beats (breathes in/out)
  float pulse = u_pulse * u_beatOnset * 0.22;
  uv *= 1.0 + pulse;

  float r = length(uv);
  float a = atan(uv.y, uv.x);

  // Tunnel projection — z = 1/r, gives classic infinite recession
  float z = 1.0 / max(r, 0.02);
  float t = u_time * u_speed * 0.60 + u_bassPres * 1.2;
  float depth = z + t;

  // Twist: rotate per depth
  a += depth * u_twist * 0.35;

  // Ring field — bright bands every 1 unit of depth
  float ringCount = max(3.0, u_rings);
  float ringCoord = fract(depth * ringCount * 0.12);
  float ring = smoothstep(0.45, 0.5, ringCoord) * smoothstep(0.55, 0.5, ringCoord);
  ring = pow(ring * 2.0, 1.2);

  // Per-ring random color + random emission (cells wake on specific beats)
  float ringId = floor(depth * ringCount * 0.12);
  float rHash  = hash(vec2(ringId, 3.7));
  float ringEmit = smoothstep(0.35, 1.0, sin(ringId * 1.1 + t * 0.8) * 0.5 + 0.5);

  // Radial ribbons — like spokes receding into tunnel
  float ribbonCount = 12.0;
  float ribbon = smoothstep(0.92, 1.0, cos(a * ribbonCount + depth * 0.8));
  ribbon *= u_ribbons;

  // Palette driven per ring
  vec3 ringCol = palette(fract(rHash + t * 0.05));
  vec3 ribbonCol = palette(fract(0.4 + a * 0.1 + t * 0.2));

  vec3 col = ringCol * ring * (0.4 + ringEmit * (0.6 + u_bassHit * 1.5));
  col += ribbonCol * ribbon * (0.3 + u_midHit * 1.2);

  // Center vanishing glow
  col += palette(fract(0.6 + t * 0.15)) * exp(-r * 2.8) * u_glow * (0.5 + u_beatOnset * 1.5);

  // Atmospheric fade — far depths darker (inverse of tunnel: small r = deep)
  float atm = smoothstep(0.0, 0.5, r);
  col *= 0.3 + 0.7 * atm;

  // Edge vignette
  col *= smoothstep(2.0, 0.3, r);
  col = pow(col, vec3(0.88));
  gl_FragColor = vec4(col, 1.0);
}
