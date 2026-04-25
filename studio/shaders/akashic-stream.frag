#pragma use_lib palette
#pragma use_lib audio
precision highp float;
uniform float u_time;
uniform vec2  u_resolution;

// ── Preset parameters ──
uniform float u_speed;        // 0-3      base scroll speed
uniform float u_density;      // 0.6-3    grid density (cells per unit)
uniform float u_glyphSize;    // 0.2-1    glyph size relative to cell
uniform float u_layers;       // 1-3      parallax layer count
uniform float u_glow;         // 0-2      bloom strength
uniform float u_audioFlow;    // 0-1      bass-driven scroll boost
uniform float u_palette;      // 0-1      hue offset
uniform float u_starfield;    // 0-1      background star sparkle

// ── Hash + SDFs for sacred symbols ──
float hash11(float p) { return fract(sin(p * 78.233) * 43758.5453); }
float hash21(vec2 p)  { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

// Ring (chakra outline)
float sdRing(vec2 p, float r, float w) { return abs(length(p) - r) - w * 0.5; }

// Regular polygon (3=triangle, 6=hex, 7=heptagon = chakras)
float sdPolygon(vec2 p, int N, float radius) {
  float a = atan(p.x, p.y) + 3.14159265;
  float r = 6.28318530 / float(N);
  float d = cos(floor(0.5 + a / r) * r - a) * length(p);
  return d - radius;
}

// Star (N-pointed)
float sdStar(vec2 p, int N, float r, float spike) {
  float a = atan(p.x, p.y);
  float seg = 6.28318530 / float(N);
  a = mod(a + seg * 0.5, seg) - seg * 0.5;
  return length(p) - (r + cos(a * float(N)) * spike);
}

// Vesica piscis (two-circle intersection — sacred geometry classic)
float sdVesica(vec2 p, float r, float d) {
  p = abs(p);
  float b = sqrt(r*r - d*d);
  return p.y < 0.0 ? length(p - vec2(-d, 0.0)) - r
                   : length(p - vec2(0.0, b))  - r;
}

// Render one parallax layer of flowing glyphs.
// `layerIndex` 0..2; back layers move slower + dimmer for depth feel.
vec4 renderLayer(vec2 uv, float layerIndex, float t) {
  // Each layer has its own scale + horizontal shift + speed
  float layerScale = 0.9 + layerIndex * 0.45;
  float layerSpeed = (1.0 + layerIndex * 0.55);
  float layerOffsetX = layerIndex * 0.27;

  vec2 cellUv = uv * u_density * layerScale + vec2(layerOffsetX, 0.0);
  cellUv.y -= t * u_speed * 0.6 * layerSpeed;

  vec2 cellId = floor(cellUv);
  vec2 cellPos = fract(cellUv) - 0.5;

  // ── Per-cell randomness ──
  float h = hash21(cellId);
  if (h < 0.55) return vec4(0.0);                    // 55% empty (sparse)

  // Symbol type — 6 variants for sacred-geometry feel
  int symType = int(floor(hash21(cellId + vec2(1.7, 4.3)) * 6.0));

  // Symbol size (some big, some small)
  float sym = u_glyphSize * (0.18 + h * 0.12);

  // SDF of chosen symbol
  float d;
  if      (symType == 0) d = sdRing(cellPos, sym, 0.04);
  else if (symType == 1) d = sdPolygon(cellPos, 6, sym * 0.85);    // hex
  else if (symType == 2) d = sdPolygon(cellPos, 7, sym * 0.85);    // heptagon (7-fold = chakras)
  else if (symType == 3) d = sdStar(cellPos, 6, sym * 0.5, sym * 0.35);
  else if (symType == 4) d = sdVesica(cellPos, sym * 0.5, sym * 0.18);
  else                   d = length(cellPos) - sym * 0.12;         // bullet point

  // Outer glow contribution (smooth ring around the symbol shape)
  float core  = smoothstep(0.025, 0.0,  d);
  float halo  = smoothstep(0.16,  0.0,  d) * 0.45;
  float bright = max(core, halo) * (0.45 + 0.55 * h);

  // ── Per-cell flicker / pulse synced to beats ──
  // A slice of cells lights up on each beat (visualizes neuron firing).
  float beatLuck = step(0.62, fract(h * 100.0 + floor(t * 1.5) * 0.31));
  bright *= mix(0.55, 1.4, beatLuck);
  bright *= 1.0 + u_bassHit * 0.55 * beatLuck;

  // ── Color: indigo/violet biased palette (akashic third-eye / crown chakra) ──
  float hueT = fract(h * 0.27 + u_time * 0.03 + u_palette + layerIndex * 0.18);
  vec3 col = palette(hueT);
  col = mix(col, vec3(0.55, 0.30, 1.00), 0.42);  // indigo/violet bias

  // Layer falloff (back layers fade)
  bright *= mix(1.0, 0.5, layerIndex / 2.0);

  return vec4(col * bright, bright);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;

  // Audio-driven scroll boost — bass presence speeds the whole stream
  float t = u_time + u_audioFlow * u_bassPres * 6.0;

  vec3 col = vec3(0.0);
  int layerCount = int(clamp(u_layers, 1.0, 3.0));

  // Composite layers back-to-front
  for (int i = 2; i >= 0; i--) {
    if (i >= layerCount) continue;
    vec4 lc = renderLayer(uv, float(i), t);
    col += lc.rgb;
  }

  // ── Cosmic backdrop: deep gradient + central halo ──
  float r = length(uv);
  vec3 bg = mix(vec3(0.04, 0.02, 0.10), vec3(0.10, 0.05, 0.22), 1.0 - r * 0.4);
  bg += vec3(0.55, 0.30, 1.00) * exp(-r * 1.8) * (0.15 + 0.20 * u_bassPres);
  col += bg;

  // ── Background star sparkle (sub-pixel hash) ──
  vec2 starGrid = gl_FragCoord.xy * 0.7;
  float starH = hash21(floor(starGrid));
  float twinkle = step(0.997 - 0.002 * u_starfield, starH);
  twinkle *= 0.4 + 0.6 * sin(u_time * 3.0 + starH * 12.0);
  col += vec3(0.92, 0.96, 1.0) * twinkle * (0.6 + u_trebleHit * 1.2);

  // ── Beat-driven concentric ripple from origin ──
  float ripple = sin(r * 28.0 - u_beatPhase * 12.566) * 0.5 + 0.5;
  ripple *= u_beatOnset * 0.55 * exp(-r * 1.4);
  col += palette(fract(0.65 + u_time * 0.04)) * ripple;

  // ── Bloom-ish self-add to brighten symbol cores ──
  col += col * u_glow * 0.4;

  // Vignette + Reinhard tonemap + gamma
  col *= smoothstep(1.85, 0.25, r);
  col = col / (1.0 + col);
  col = pow(col, vec3(0.86));

  gl_FragColor = vec4(col, 1.0);
}
