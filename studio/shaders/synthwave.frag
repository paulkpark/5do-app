#pragma use_lib palette
#pragma use_lib audio
precision highp float;
uniform float u_time;
uniform vec2  u_resolution;

uniform float u_speed;        // 0-2    grid travel speed
uniform float u_gridScale;    // 4-20   grid line density
uniform float u_sunSize;      // 0.1-0.5
uniform float u_sunGlow;      // 0-2
uniform float u_horizon;      // 0.3-0.7  horizon line position
uniform float u_perspective;  // 0.2-0.8  grid z-fade curve

void main() {
  vec2 uv = (gl_FragCoord.xy / u_resolution);
  vec2 cuv = uv * 2.0 - 1.0;
  cuv.x *= u_resolution.x / u_resolution.y;

  float t = u_time * u_speed * 0.30;

  // Split horizon
  float horizon = u_horizon * 2.0 - 1.0;    // map 0.3-0.7 → -0.4 to +0.4
  float belowHorizon = step(cuv.y, horizon);

  vec3 col;

  if (belowHorizon > 0.5) {
    // ─── Ground: perspective grid ───
    float y = horizon - cuv.y;              // distance below horizon
    float persp = pow(y, u_perspective);    // perspective compression
    float gridY = fract(persp * 4.0 - t * 3.0 - u_bassPres * 1.5);
    float gridX = fract(cuv.x / max(y * 1.5, 0.05) * u_gridScale);

    float lineY = smoothstep(0.06, 0.0, abs(gridY - 0.5));
    float lineX = smoothstep(0.08, 0.0, abs(gridX - 0.5));
    float grid = max(lineY, lineX);

    // Glow intensity by distance — close lines brighter
    float fog = exp(-y * 1.8);
    grid *= fog;

    // Beat reacts by pumping emission
    grid *= (0.6 + u_bassHit * 0.8 + u_beatOnset * 0.5);

    vec3 gridCol = palette(fract(0.1 + y * 0.3));
    col = gridCol * grid;

    // Deep ground bg — faint palette tint
    col += palette(0.05) * 0.04 * (1.0 - fog);

  } else {
    // ─── Sky: sun + gradient ───
    vec2 sunUv = cuv;
    sunUv.y = (sunUv.y - horizon) / max(1.0 - horizon, 0.1);

    // Sky gradient (palette top → horizon)
    vec3 top   = palette(fract(0.8 + t * 0.05));
    vec3 bot   = palette(fract(0.1 + t * 0.05));
    col = mix(bot, top, pow(sunUv.y, 1.3));

    // Sun disc
    float sunR = length(vec2(sunUv.x, (sunUv.y - 0.4) * 1.1));
    float sun  = smoothstep(u_sunSize, u_sunSize - 0.02, sunR);
    float halo = smoothstep(u_sunSize * 3.5, u_sunSize, sunR);

    // Scanlines across the sun
    float scan = smoothstep(0.0, 0.04, abs(fract(sunUv.y * 14.0 - t) - 0.5));
    sun *= scan;

    vec3 sunCol = palette(fract(0.5 + t * 0.1));
    col = mix(col, sunCol, sun);
    col += sunCol * halo * u_sunGlow * (0.4 + u_midPres * 0.5);

    // Stars (treble sparkle)
    float star = step(0.997, fract(sin(dot(cuv * 400.0, vec2(12.9898, 78.233))) * 43758.5453));
    col += star * u_trebleHit * 1.2 * vec3(1.0);
  }

  // Horizon glow line
  float hline = smoothstep(0.015, 0.0, abs(cuv.y - horizon));
  col += palette(fract(0.3 + t * 0.15)) * hline * (0.6 + u_beatOnset * 1.0);

  col = pow(col, vec3(0.88));
  gl_FragColor = vec4(col, 1.0);
}
