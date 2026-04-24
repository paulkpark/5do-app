#pragma use_lib palette
#pragma use_lib audio
precision highp float;
uniform float u_time;
uniform vec2  u_resolution;

// ── Preset parameters ──
uniform float u_speed;            // 0-1   flow velocity
uniform float u_iterations;       // 2-8   fractal depth
uniform float u_fractal;          // 0/1   enable KIFS folds
uniform float u_metalBrightness;  // 0-1   overall brightness
uniform float u_flowFreq;         // 0-1.5 noise-warp frequency
uniform float u_shape;            // 0-1   scale factor morph
uniform float u_beatWobble;       // 0/1   beat-driven wobble toggle
uniform float u_zoom;             // 0.5-2 camera distance

// ─── SDF: Kaleidoscopic IFS (fractal) or plain rounded box ───
float map(vec3 p) {
  float t = u_time * u_speed * 0.30;

  // Flow warp — drives the "liquid carbon" feel
  p.xz += 0.18 * vec2(sin(p.y * u_flowFreq * 1.6 + t),
                      cos(p.y * u_flowFreq * 1.3 + t * 0.8));

  // Beat wobble — spikes the surface on each kick
  float wob = u_beatWobble * u_beatOnset * 0.18;
  p += wob * sin(p.yzx * 3.2 + t * 2.0);

  if (u_fractal > 0.5) {
    // Kaleidoscopic IFS (Knighty-style)
    float scale = 1.0;
    int iter = int(clamp(u_iterations, 1.0, 9.0));
    float k = 1.85 + u_shape * 0.35;
    vec3 offset = vec3(0.55, 0.70, 0.55) * (k - 1.0);
    for (int i = 0; i < 9; i++) {
      if (i >= iter) break;
      p = abs(p) - vec3(1.0);
      if (p.x < p.y) p.xy = p.yx;
      if (p.x < p.z) p.xz = p.zx;
      if (p.y < p.z) p.yz = p.zy;
      p = p * k - offset;
      scale *= k;
    }
    vec3 q = abs(p) - vec3(0.9);
    float d = length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
    return d / scale;
  }

  // Non-fractal fallback — twisted rounded box
  float ang = p.y * 0.6 + t * 0.5;
  float ca = cos(ang), sa = sin(ang);
  p.xz = mat2(ca, -sa, sa, ca) * p.xz;
  vec3 q = abs(p) - vec3(0.9 + u_shape * 0.2);
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - 0.12;
}

vec3 calcNormal(vec3 p) {
  vec2 e = vec2(1.0, -1.0) * 0.5773;
  const float h = 0.0012;
  return normalize(e.xyy * map(p + e.xyy * h) +
                   e.yyx * map(p + e.yyx * h) +
                   e.yxy * map(p + e.yxy * h) +
                   e.xxx * map(p + e.xxx * h));
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;

  // Camera orbit
  float ct = u_time * 0.13;
  float dist = (2.2 + 0.3 * sin(ct * 0.3)) / max(u_zoom, 0.2);
  vec3 ro = vec3(dist * cos(ct), 0.7 + 0.35 * sin(ct * 0.5), dist * sin(ct));
  vec3 fw = normalize(-ro);
  vec3 rt = normalize(cross(vec3(0.0, 1.0, 0.0), fw));
  vec3 up = cross(fw, rt);
  vec3 rd = normalize(uv.x * rt + uv.y * up + 1.55 * fw);

  // Ray march
  float t = 0.0;
  float d = 0.0;
  float steps = 0.0;
  bool hit = false;
  for (int i = 0; i < 80; i++) {
    vec3 p = ro + rd * t;
    d = map(p);
    if (d < 0.001) { hit = true; break; }
    if (t > 9.0) break;
    t += d * 0.82;
    steps += 1.0;
  }

  vec3 col;
  if (hit) {
    vec3 p = ro + rd * t;
    vec3 n = calcNormal(p);
    vec3 refl = reflect(rd, n);

    // Environment approximation — vertical gradient + warm horizon
    float sky = smoothstep(-0.3, 1.0, refl.y);
    vec3 skyCol = mix(vec3(0.08, 0.06, 0.14), vec3(0.95, 0.92, 1.0), sky);
    skyCol = mix(skyCol, vec3(1.0, 0.75, 0.45), smoothstep(0.2, -0.1, refl.y) * 0.35);

    // Palette tint driven by iteration depth + surface position + audio presence
    float pt = fract(steps * 0.014 + u_time * 0.04 + p.y * 0.12 + u_bassPres * 0.15);
    vec3 tint = palette(pt);

    // Fresnel rim
    float fres = pow(1.0 - max(0.0, -dot(n, rd)), 3.5);

    // Metallic mix: environment tinted by palette + fresnel bloom
    col = skyCol * (0.55 + 0.45 * tint);
    col = mix(col, col * tint * 1.4 + fres * tint, 0.5);
    col += fres * 0.6 * tint;

    // Deep-fold ambient occlusion
    float ao = 1.0 - smoothstep(30.0, 75.0, steps) * 0.55;
    col *= ao;

    // Brightness control
    col *= 0.55 + 0.85 * u_metalBrightness;

    // Beat flash
    col += u_beatOnset * 0.35 * tint;
  } else {
    // Background — gentle gradient echoing the palette
    float bg = 0.5 + 0.5 * uv.y;
    col = palette(fract(bg * 0.3 + u_time * 0.01)) * 0.08;
  }

  // Vignette + subtle gamma
  col *= smoothstep(1.7, 0.25, length(uv));
  col = pow(col, vec3(0.85));

  gl_FragColor = vec4(col, 1.0);
}
