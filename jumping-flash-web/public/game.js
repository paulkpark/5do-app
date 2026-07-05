// ============================================================================
// JUMPING FLASH WEB — first-person hop-and-bop platformer
// Inspired by the PS1 classic "Jumping Flash!" (1995).
// Modern rendering: PBR materials, procedural texture maps, ACES tonemapping,
// PCF soft shadows, UnrealBloom post-processing. No build step — ES modules.
// ============================================================================
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------
const GRAVITY = 28;
const JUMP_VEL = [12.5, 18, 25];          // 1st / 2nd / 3rd jump launch speed
const BOUNCE_PAD_VEL = 30;
const MOVE_SPEED = 8.5;
const GROUND_ACCEL = 60;
const AIR_ACCEL = 24;
const GROUND_FRICTION = 10;
const AIR_DRAG = 0.6;
const PLAYER_RADIUS = 0.55;
const PLAYER_HEIGHT = 1.75;               // feet -> head
const EYE_HEIGHT = 1.55;
const COYOTE_TIME = 0.12;
const KILL_Y = -30;
const MAX_HEARTS = 3;
const LOOKDOWN_PITCH = -1.15;             // auto look-down pitch at high-jump apex

const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

// ---------------------------------------------------------------------------
// Procedural textures (canvas-generated maps: albedo / emissive / roughness)
// ---------------------------------------------------------------------------
function canvasTex(size, draw, { repeat = 1, srgb = true } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  return t;
}

function noise(ctx, s, alpha) {
  for (let i = 0; i < s * s * 0.08; i++) {
    ctx.fillStyle = `rgba(255,255,255,${Math.random() * alpha})`;
    ctx.fillRect(Math.random() * s, Math.random() * s, 1.5, 1.5);
  }
}

const TEX = {};
function buildTextures() {
  // Platform top: dark panel + neon grid + corner bolts
  TEX.platTop = canvasTex(512, (ctx, s) => {
    ctx.fillStyle = '#1c1c30'; ctx.fillRect(0, 0, s, s);
    const g = ctx.createRadialGradient(s / 2, s / 2, s * 0.1, s / 2, s / 2, s * 0.7);
    g.addColorStop(0, 'rgba(124,92,252,0.10)'); g.addColorStop(1, 'rgba(0,0,0,0.25)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = 'rgba(124,92,252,0.55)'; ctx.lineWidth = 3;
    const n = 4, cell = s / n;
    for (let i = 0; i <= n; i++) {
      ctx.beginPath(); ctx.moveTo(i * cell, 0); ctx.lineTo(i * cell, s); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * cell); ctx.lineTo(s, i * cell); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(62,207,207,0.35)'; ctx.lineWidth = 1;
    for (let i = 0; i <= n * 4; i++) {
      ctx.beginPath(); ctx.moveTo(i * cell / 4, 0); ctx.lineTo(i * cell / 4, s); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * cell / 4); ctx.lineTo(s, i * cell / 4); ctx.stroke();
    }
    ctx.fillStyle = '#3a3a5c';
    for (const [x, y] of [[26, 26], [s - 26, 26], [26, s - 26], [s - 26, s - 26]]) {
      ctx.beginPath(); ctx.arc(x, y, 9, 0, 7); ctx.fill();
    }
    noise(ctx, s, 0.05);
  });

  // Platform side: striped tech panel
  TEX.platSide = canvasTex(512, (ctx, s) => {
    ctx.fillStyle = '#20203a'; ctx.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 64) {
      ctx.fillStyle = (y / 64) % 2 ? '#2a2a48' : '#242440';
      ctx.fillRect(0, y, s, 64);
      ctx.fillStyle = 'rgba(124,92,252,0.35)';
      ctx.fillRect(0, y + 60, s, 3);
    }
    ctx.fillStyle = 'rgba(255,184,108,0.8)';
    for (let x = 0; x < s; x += 96) ctx.fillRect(x + 8, 20, 40, 8);
    noise(ctx, s, 0.04);
  });

  // Grass-like top for "garden" platforms
  TEX.grass = canvasTex(512, (ctx, s) => {
    ctx.fillStyle = '#173a2a'; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 2600; i++) {
      const x = Math.random() * s, y = Math.random() * s;
      ctx.fillStyle = `hsl(${140 + Math.random() * 40},${45 + Math.random() * 30}%,${18 + Math.random() * 22}%)`;
      ctx.fillRect(x, y, 2 + Math.random() * 3, 2 + Math.random() * 3);
    }
    ctx.strokeStyle = 'rgba(62,207,207,0.25)'; ctx.lineWidth = 4;
    ctx.strokeRect(6, 6, s - 12, s - 12);
  }, { repeat: 2 });

  // Bounce pad: concentric energy rings
  TEX.pad = canvasTex(512, (ctx, s) => {
    ctx.fillStyle = '#101020'; ctx.fillRect(0, 0, s, s);
    for (let r = s * 0.46; r > 20; r -= 40) {
      ctx.strokeStyle = r % 80 < 40 ? 'rgba(62,207,207,0.9)' : 'rgba(124,92,252,0.9)';
      ctx.lineWidth = 14;
      ctx.beginPath(); ctx.arc(s / 2, s / 2, r, 0, 7); ctx.stroke();
    }
    ctx.fillStyle = '#3ECFCF';
    ctx.beginPath(); ctx.arc(s / 2, s / 2, 22, 0, 7); ctx.fill();
  });

  // Rough map shared by platforms (non-color data)
  TEX.rough = canvasTex(256, (ctx, s) => {
    ctx.fillStyle = '#888'; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 900; i++) {
      const v = 90 + Math.random() * 120 | 0;
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(Math.random() * s, Math.random() * s, 6, 6);
    }
  }, { srgb: false });

  // Jet pod shell: glowing stripes
  TEX.pod = canvasTex(256, (ctx, s) => {
    ctx.fillStyle = '#FFB86C'; ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#FF6B9D';
    for (let y = 0; y < s; y += 42) ctx.fillRect(0, y, s, 18);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for (let y = 0; y < s; y += 42) ctx.fillRect(0, y + 18, s, 4);
  });

  // Enemy face
  TEX.enemy = canvasTex(256, (ctx, s) => {
    ctx.fillStyle = '#2a1030'; ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = '#FF6B9D'; ctx.lineWidth = 10;
    ctx.strokeRect(14, 14, s - 28, s - 28);
    ctx.fillStyle = '#F87171';
    ctx.beginPath(); ctx.arc(s * 0.33, s * 0.4, 22, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(s * 0.67, s * 0.4, 22, 0, 7); ctx.fill();
    ctx.strokeStyle = '#F87171'; ctx.lineWidth = 12;
    ctx.beginPath(); ctx.moveTo(s * 0.3, s * 0.72); ctx.lineTo(s * 0.7, s * 0.72); ctx.stroke();
  });
}

// ---------------------------------------------------------------------------
// Tiny WebAudio synth
// ---------------------------------------------------------------------------
const SFX = (() => {
  let ac = null;
  const ensure = () => (ac ||= new (window.AudioContext || window.webkitAudioContext)());
  function blip(f0, f1, dur, type = 'square', vol = 0.12, delay = 0) {
    try {
      const a = ensure(); if (a.state === 'suspended') a.resume();
      const t = a.currentTime + delay;
      const o = a.createOscillator(), g = a.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(a.destination);
      o.start(t); o.stop(t + dur + 0.02);
    } catch (_) { /* audio not available */ }
  }
  return {
    unlock() { try { ensure().resume(); } catch (_) {} },
    jump(n) { blip(220 * (1 + n * 0.5), 660 * (1 + n * 0.5), 0.18, 'square', 0.10); },
    land()  { blip(180, 70, 0.12, 'triangle', 0.10); },
    pod()   { blip(880, 880, 0.08, 'sine', 0.12); blip(1320, 1320, 0.12, 'sine', 0.12, 0.09); },
    stomp() { blip(400, 60, 0.22, 'sawtooth', 0.14); },
    hurt()  { blip(200, 60, 0.35, 'sawtooth', 0.16); },
    pad()   { blip(300, 1200, 0.3, 'sine', 0.14); },
    portal(){ [523, 659, 784, 1047].forEach((f, i) => blip(f, f, 0.22, 'triangle', 0.12, i * 0.11)); },
    over()  { [400, 300, 220, 140].forEach((f, i) => blip(f, f * 0.8, 0.3, 'sawtooth', 0.12, i * 0.18)); },
  };
})();

// ---------------------------------------------------------------------------
// Stage data
// ---------------------------------------------------------------------------
// P(x, y, z, w, d, opts) — y is TOP surface height, thickness auto
function P(x, y, z, w, d, opts = {}) { return { x, y, z, w, d, h: opts.h ?? 1.2, ...opts }; }

const STAGES = [
  { // ---- Stage 1: Sky Garden — learn the triple jump
    name: 'SKY GARDEN',
    spawn: [0, 0.01, 6], sky: ['#0A0A2E', '#7C5CFC', '#0A0A0F'],
    platforms: [
      P(0, 0, 6, 14, 14, { skin: 'grass' }),
      P(0, 1.5, -6, 6, 6),
      P(8, 3.5, -10, 5, 5),
      P(15, 6, -4, 5, 5, { skin: 'grass' }),
      P(12, 9, 5, 4, 4),
      P(3, 12, 9, 5, 5, { skin: 'grass' }),
      P(-8, 8, 8, 4, 4, { type: 'move', axis: [0, 1, 0], amp: 3, speed: 1.1 }),
      P(-14, 13, 0, 5, 5),
      P(-8, 16, -9, 5, 5, { skin: 'grass' }),
      P(2, 18, -14, 6, 6),
      P(2, 0.2, -14, 3, 3, { type: 'pad' }),
    ],
    pods: [[8, 5.3, -10], [12, 10.8, 5], [-14, 14.8, 0], [-5, 2, 11]],
    enemies: [
      { a: [15, 7.4, -6], b: [15, 7.4, -2] },
      { a: [-9, 17.4, -9], b: [-6, 17.4, -9] },
    ],
    exit: [2, 18, -14],
  },
  { // ---- Stage 2: Neon Drift — moving platforms over the void
    name: 'NEON DRIFT',
    spawn: [0, 0.01, 0], sky: ['#001a1a', '#3ECFCF', '#0A0A0F'],
    platforms: [
      P(0, 0, 0, 10, 10),
      P(0, 2, -12, 4, 4, { type: 'move', axis: [1, 0, 0], amp: 5, speed: 1.4 }),
      P(0, 4.5, -22, 4, 4, { type: 'move', axis: [0, 0, 1], amp: 4, speed: 1.7, phase: 2 }),
      P(9, 7, -28, 5, 5, { skin: 'grass' }),
      P(18, 7, -22, 3.5, 3.5, { type: 'move', axis: [0, 1, 0], amp: 3.5, speed: 1.5 }),
      P(24, 12, -14, 5, 5),
      P(24, 12.2, -14, 2.6, 2.6, { type: 'pad' }),
      P(24, 22, -2, 5, 5, { skin: 'grass' }),
      P(14, 24, 4, 4, 4, { type: 'move', axis: [1, 0, 1], amp: 3, speed: 1.2 }),
      P(2, 26, 8, 6, 6),
      P(-10, 4, 6, 4, 4),
      P(-18, 8, 0, 4, 4, { type: 'move', axis: [0, 1, 0], amp: 4, speed: 1.8, phase: 1 }),
    ],
    pods: [[0, 6.3, -22], [18, 9.5, -22], [-18, 10.5, 0], [24, 23.8, -2], [-10, 5.8, 6]],
    enemies: [
      { a: [7, 8.4, -28], b: [11, 8.4, -28] },
      { a: [22, 13.4, -16], b: [26, 13.4, -12] },
      { a: [0, 27.4, 8], b: [4, 27.4, 8] },
    ],
    exit: [2, 26, 8],
  },
  { // ---- Stage 3: Babel Tower — vertical gauntlet
    name: 'BABEL TOWER',
    spawn: [0, 0.01, 10], sky: ['#1a0a1a', '#FF6B9D', '#0A0A0F'],
    platforms: [
      P(0, 0, 10, 12, 12),
      P(0, 0.2, 10, 3, 3, { type: 'pad' }),
      P(0, 8, 0, 7, 7),
      P(7, 11, -6, 4, 4, { skin: 'grass' }),
      P(0, 14, -11, 4, 4, { type: 'move', axis: [1, 0, 0], amp: 4, speed: 1.6 }),
      P(-8, 17, -6, 4, 4),
      P(-11, 20, 3, 4, 4, { type: 'move', axis: [0, 1, 0], amp: 2.5, speed: 2 }),
      P(-4, 24, 9, 5, 5, { skin: 'grass' }),
      P(-4, 24.2, 9, 2.6, 2.6, { type: 'pad' }),
      P(-4, 36, 0, 6, 6),
      P(4, 39, -7, 3.5, 3.5, { type: 'move', axis: [1, 0, 1], amp: 2.5, speed: 1.4 }),
      P(12, 42, -1, 5, 5, { skin: 'grass' }),
      P(6, 45, 7, 4, 4, { type: 'move', axis: [0, 0, 1], amp: 3, speed: 1.9 }),
      P(-3, 48, 12, 6, 6),
    ],
    pods: [[0, 9.8, 0], [0, 15.8, -11], [-11, 22.3, 3], [-4, 37.8, 0], [12, 43.8, -1], [6, 47, 7]],
    enemies: [
      { a: [-2, 9.4, -2], b: [2, 9.4, 2] },
      { a: [-9.5, 18.4, -6], b: [-6.5, 18.4, -6] },
      { a: [-6, 37.4, 0], b: [-2, 37.4, 0] },
      { a: [10, 43.4, -2.5], b: [14, 43.4, 0.5] },
    ],
    exit: [-3, 48, 12],
  },
];

// ---------------------------------------------------------------------------
// Renderer / scene bootstrap
// ---------------------------------------------------------------------------
const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
// Mobile GPUs (iPhone/iPad Safari): lower pixel ratio + lighter shadow/bloom budget
renderer.setPixelRatio(Math.min(window.devicePixelRatio, isTouch ? 1.75 : 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(78, window.innerWidth / window.innerHeight, 0.1, 900);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomScale = isTouch ? 0.5 : 1;
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth * bloomScale, window.innerHeight * bloomScale), 0.75, 0.5, 0.82);
composer.addPass(bloom);
composer.addPass(new OutputPass());

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  bloom.setSize(window.innerWidth * bloomScale, window.innerHeight * bloomScale);
  const tip = document.getElementById('rotate-tip');
  if (tip) tip.style.display = (isTouch && window.innerHeight > window.innerWidth) ? '' : 'none';
}
window.addEventListener('resize', onResize);
// iOS fires orientationchange before the new innerWidth/Height settle
window.addEventListener('orientationchange', () => setTimeout(onResize, 250));

// Lights
const hemi = new THREE.HemisphereLight(0x9b7fff, 0x1a1a3f, 0.85);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff2e0, 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(isTouch ? 1024 : 2048, isTouch ? 1024 : 2048);
sun.shadow.camera.left = -40; sun.shadow.camera.right = 40;
sun.shadow.camera.top = 40; sun.shadow.camera.bottom = -40;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 200;
sun.shadow.bias = -0.0004;
scene.add(sun, sun.target);

// Sky dome (gradient shader) + stars + drifting clouds
const skyUniforms = {
  topColor: { value: new THREE.Color('#0A0A2E') },
  midColor: { value: new THREE.Color('#7C5CFC') },
  botColor: { value: new THREE.Color('#0A0A0F') },
};
const skyDome = new THREE.Mesh(
  new THREE.SphereGeometry(600, 32, 24),
  new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: skyUniforms,
    vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      varying vec3 vP;
      uniform vec3 topColor, midColor, botColor;
      void main(){
        float h = normalize(vP).y;
        vec3 c = h > 0.0
          ? mix(midColor * 0.35, topColor, smoothstep(0.0, 0.7, h))
          : mix(midColor * 0.35, botColor, smoothstep(0.0, 0.5, -h));
        // horizon glow band
        c += midColor * 0.35 * exp(-abs(h) * 9.0);
        gl_FragColor = vec4(c, 1.0);
      }`,
  })
);
scene.add(skyDome);

const starGeo = new THREE.BufferGeometry();
{
  const pts = [];
  const starCount = isTouch ? 700 : 1200;
  for (let i = 0; i < starCount; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(550);
    if (v.y > -60) pts.push(v.x, v.y, v.z);
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
}
const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.8, fog: false }));
scene.add(stars);

const clouds = new THREE.Group();
{
  const cGeo = new THREE.SphereGeometry(1, 12, 8);
  const cMat = new THREE.MeshBasicMaterial({ color: 0x8a7fd0, transparent: true, opacity: 0.11, fog: false });
  for (let i = 0; i < 26; i++) {
    const m = new THREE.Mesh(cGeo, cMat);
    m.position.set((Math.random() - 0.5) * 500, -80 - Math.random() * 100, (Math.random() - 0.5) * 500);
    m.scale.set(24 + Math.random() * 40, 4 + Math.random() * 5, 18 + Math.random() * 30);
    m.userData.drift = 0.5 + Math.random() * 1.5;
    clouds.add(m);
  }
}
scene.add(clouds);

// ---------------------------------------------------------------------------
// Materials (built after textures)
// ---------------------------------------------------------------------------
buildTextures();
const MAT = {
  top: new THREE.MeshStandardMaterial({ map: TEX.platTop, roughnessMap: TEX.rough, roughness: 0.75, metalness: 0.35, emissive: 0x7c5cfc, emissiveIntensity: 0.08, emissiveMap: TEX.platTop }),
  side: new THREE.MeshStandardMaterial({ map: TEX.platSide, roughnessMap: TEX.rough, roughness: 0.85, metalness: 0.4 }),
  grass: new THREE.MeshStandardMaterial({ map: TEX.grass, roughnessMap: TEX.rough, roughness: 0.95, metalness: 0.0 }),
  pad: new THREE.MeshStandardMaterial({ map: TEX.pad, emissiveMap: TEX.pad, emissive: 0xffffff, emissiveIntensity: 0.6, roughness: 0.4, metalness: 0.2 }),
  pod: new THREE.MeshStandardMaterial({ map: TEX.pod, emissiveMap: TEX.pod, emissive: 0xffffff, emissiveIntensity: 0.9, roughness: 0.3, metalness: 0.1 }),
  enemy: new THREE.MeshStandardMaterial({ map: TEX.enemy, emissiveMap: TEX.enemy, emissive: 0xffffff, emissiveIntensity: 0.5, roughness: 0.5, metalness: 0.6 }),
  portalOff: new THREE.MeshStandardMaterial({ color: 0x44446a, emissive: 0x3a3a6a, emissiveIntensity: 0.7, roughness: 0.4, metalness: 0.8 }),
  portalOn: new THREE.MeshStandardMaterial({ color: 0x3ecfcf, emissive: 0x3ecfcf, emissiveIntensity: 2.2, roughness: 0.2, metalness: 0.5 }),
};

// ---------------------------------------------------------------------------
// HUD / overlay DOM helpers
// ---------------------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const hud = $('hud'), toastEl = $('toast'), heartsEl = $('hearts');
const jumpPips = [...document.querySelectorAll('#jump-meter span')];
let toastTimer = 0;
function toast(msg, ms = 1800) {
  toastEl.textContent = msg;
  toastEl.style.opacity = 1;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toastEl.style.opacity = 0), ms);
}
function showOverlay(id) {
  for (const ov of document.querySelectorAll('.overlay')) ov.classList.add('hidden');
  if (id) $(id).classList.remove('hidden');
}

// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------
const world = new THREE.Group();
scene.add(world);

const state = {
  phase: 'title',            // title | play | pause | clear | over | allclear
  stageIdx: 0,
  hearts: MAX_HEARTS,
  score: 0,
  totalTime: 0,
  stageTime: 0,
  platforms: [],             // { mesh, base, type, axis, amp, speed, phase, w, d, h, pos, prevPos }
  pods: [],
  enemies: [],
  exit: null, exitActive: false,
  spawn: new THREE.Vector3(),
  podTotal: 0, podCount: 0,
};

const player = {
  pos: new THREE.Vector3(),       // feet position
  vel: new THREE.Vector3(),
  yaw: 0, pitch: 0,
  grounded: false, coyote: 0,
  jumpCount: 0, jumpHeld: false,
  ridingPlat: null,
  invuln: 0,
  lookDown: 0,                    // 0..1 auto look-down blend
  bob: 0,
};

// blob shadow (landing guide — the make-or-break UI of Jumping Flash)
const blobShadow = new THREE.Mesh(
  new THREE.CircleGeometry(0.6, 24),
  new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false })
);
blobShadow.rotation.x = -Math.PI / 2;
blobShadow.visible = false;
scene.add(blobShadow);
const downRay = new THREE.Raycaster();
downRay.far = 200;

// ---------------------------------------------------------------------------
// Stage construction
// ---------------------------------------------------------------------------
function clearWorld() {
  world.traverse((o) => { if (o.geometry && !o.userData.shared) o.geometry.dispose(); });
  world.clear();
  state.platforms.length = 0;
  state.pods.length = 0;
  state.enemies.length = 0;
  state.exit = null;
}

function buildStage(idx) {
  clearWorld();
  const S = STAGES[idx];
  skyUniforms.topColor.value.set(S.sky[0]);
  skyUniforms.midColor.value.set(S.sky[1]);
  skyUniforms.botColor.value.set(S.sky[2]);
  scene.fog = new THREE.FogExp2(new THREE.Color(S.sky[2]).lerp(new THREE.Color(S.sky[1]), 0.15), 0.006);

  for (const p of S.platforms) {
    const geo = new THREE.BoxGeometry(p.w, p.h, p.d);
    let mats;
    if (p.type === 'pad') {
      mats = [MAT.side, MAT.side, MAT.pad, MAT.side, MAT.side, MAT.side];
    } else {
      const topMat = p.skin === 'grass' ? MAT.grass : MAT.top;
      mats = [MAT.side, MAT.side, topMat, MAT.side, MAT.side, MAT.side];
    }
    const mesh = new THREE.Mesh(geo, mats);
    mesh.castShadow = mesh.receiveShadow = true;
    const base = new THREE.Vector3(p.x, p.y - p.h / 2, p.z); // center of box (p.y = top)
    mesh.position.copy(base);
    world.add(mesh);
    state.platforms.push({
      mesh, base, w: p.w, d: p.d, h: p.h,
      type: p.type || 'static',
      axis: p.axis ? new THREE.Vector3(...p.axis).normalize() : null,
      amp: p.amp || 0, speed: p.speed || 1, phase: p.phase || 0,
      pos: base.clone(), prevPos: base.clone(),
    });
    // neon edge trim (bloom catcher)
    if (p.type !== 'pad') {
      const edge = new THREE.Mesh(
        new THREE.BoxGeometry(p.w + 0.06, 0.1, p.d + 0.06),
        new THREE.MeshStandardMaterial({ color: 0x7c5cfc, emissive: 0x7c5cfc, emissiveIntensity: p.type === 'move' ? 2.0 : 0.9 })
      );
      edge.position.set(0, p.h / 2 - 0.05, 0);
      mesh.add(edge);
    }
  }

  // Jet pods (the carrot-analog collectible)
  const podGeo = new THREE.CapsuleGeometry(0.32, 0.55, 6, 14);
  for (const [x, y, z] of S.pods) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(podGeo, MAT.pod);
    body.castShadow = true;
    const fin = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.4, 4), new THREE.MeshStandardMaterial({ color: 0x3ecfcf, emissive: 0x3ecfcf, emissiveIntensity: 1.4 }));
    fin.position.y = 0.75;
    g.add(body, fin);
    // per-pod point lights are too costly on mobile GPUs; bloom sells the glow
    if (!isTouch) g.add(new THREE.PointLight(0xffb86c, 4, 7, 2));
    g.position.set(x, y, z);
    world.add(g);
    state.pods.push({ g, baseY: y, taken: false, t: Math.random() * 6 });
  }
  state.podTotal = S.pods.length;
  state.podCount = 0;

  // Enemies — hovering "spikers" that patrol between two points
  for (const e of S.enemies) {
    const g = new THREE.Group();
    const core = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), MAT.enemy);
    core.castShadow = true;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.75, 0.07, 8, 24),
      new THREE.MeshStandardMaterial({ color: 0xff6b9d, emissive: 0xff6b9d, emissiveIntensity: 1.6 })
    );
    ring.rotation.x = Math.PI / 2;
    g.add(core, ring);
    world.add(g);
    state.enemies.push({
      g, core, a: new THREE.Vector3(...e.a), b: new THREE.Vector3(...e.b),
      t: Math.random() * Math.PI * 2, dead: false, deadT: 0,
    });
  }

  // Exit portal
  {
    const [x, y, z] = S.exit;
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.16, 12, 40), MAT.portalOff);
    ring.position.y = 1.8;
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(1.34, 40),
      new THREE.MeshBasicMaterial({ color: 0x3ecfcf, transparent: true, opacity: 0, side: THREE.DoubleSide })
    );
    disc.position.y = 1.8;
    const light = new THREE.PointLight(0x3ecfcf, 0, 12, 2);
    light.position.y = 2;
    g.add(ring, disc, light);
    g.position.set(x, y, z);
    world.add(g);
    state.exit = { g, ring, disc, light, pos: new THREE.Vector3(x, y, z) };
    state.exitActive = false;
  }

  state.spawn.set(...S.spawn);
  respawn();
  state.stageTime = 0;
  $('stage-num').textContent = idx + 1;
  $('pod-total').textContent = state.podTotal;
  $('pod-count').textContent = 0;
  updateHearts();
  toast(`STAGE ${idx + 1} — ${S.name}`, 2400);
}

function respawn() {
  player.pos.copy(state.spawn);
  player.vel.set(0, 0, 0);
  player.yaw = 0;
  const look = state.platforms[1]; // face the next platform on spawn
  if (look) player.yaw = Math.atan2(-(look.pos.x - player.pos.x), -(look.pos.z - player.pos.z));
  player.pitch = 0;
  player.grounded = true;
  player.jumpCount = 0;
  player.ridingPlat = null;
  player.lookDown = 0;
  player.invuln = 2;
}

function updateHearts() {
  heartsEl.innerHTML = '';
  for (let i = 0; i < MAX_HEARTS; i++) {
    const s = document.createElement('span');
    s.textContent = '♥';
    s.style.color = i < state.hearts ? '#FF6B9D' : '#3a3a5c';
    heartsEl.appendChild(s);
  }
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------
const keys = {};
let jumpQueued = false;
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  keys[e.code] = true;
  if (e.code === 'Space') { jumpQueued = true; e.preventDefault(); }
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });

const LOOK_SENS = 0.0023;
function applyLook(dx, dy) {
  player.yaw -= dx * LOOK_SENS;
  player.pitch -= dy * LOOK_SENS;
  player.pitch = Math.max(-1.35, Math.min(1.35, player.pitch));
}

// pointer lock (desktop)
if (!isTouch) {
  canvas.addEventListener('click', () => {
    if (state.phase === 'play') lockPointer();
  });
  document.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement === canvas && state.phase === 'play') applyLook(e.movementX, e.movementY);
  });
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement !== canvas && state.phase === 'play') pauseGame();
  });
}

// touch controls
const touch = { move: new THREE.Vector2(), stickId: null, lookId: null, lookLast: new THREE.Vector2() };
if (isTouch) {
  $('touch-controls-help').style.display = '';
  $('kb-controls').style.display = 'none';
  const stickZone = $('stick-zone'), base = $('stick-base'), nub = $('stick-nub');
  const stickOrigin = new THREE.Vector2();
  stickZone.addEventListener('touchstart', (e) => {
    const t = e.changedTouches[0];
    touch.stickId = t.identifier;
    stickOrigin.set(t.clientX, t.clientY);
    base.style.display = nub.style.display = 'block';
    base.style.left = (t.clientX - 55) + 'px'; base.style.top = (t.clientY - 55) + 'px';
    nub.style.left = (t.clientX - 24) + 'px'; nub.style.top = (t.clientY - 24) + 'px';
    e.preventDefault();
  }, { passive: false });
  stickZone.addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier !== touch.stickId) continue;
      const dx = t.clientX - stickOrigin.x, dy = t.clientY - stickOrigin.y;
      const len = Math.hypot(dx, dy), max = 48;
      const cl = Math.min(len, max);
      const nx = len ? dx / len : 0, ny = len ? dy / len : 0;
      touch.move.set(nx * (cl / max), ny * (cl / max));
      nub.style.left = (stickOrigin.x + nx * cl - 24) + 'px';
      nub.style.top = (stickOrigin.y + ny * cl - 24) + 'px';
    }
    e.preventDefault();
  }, { passive: false });
  const endStick = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier !== touch.stickId) continue;
      touch.stickId = null; touch.move.set(0, 0);
      base.style.display = nub.style.display = 'none';
    }
  };
  stickZone.addEventListener('touchend', endStick);
  stickZone.addEventListener('touchcancel', endStick);

  const lookZone = $('look-zone');
  lookZone.addEventListener('touchstart', (e) => {
    const t = e.changedTouches[0];
    touch.lookId = t.identifier;
    touch.lookLast.set(t.clientX, t.clientY);
    e.preventDefault();
  }, { passive: false });
  lookZone.addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier !== touch.lookId) continue;
      applyLook((t.clientX - touch.lookLast.x) * 2.4, (t.clientY - touch.lookLast.y) * 2.4);
      touch.lookLast.set(t.clientX, t.clientY);
    }
    e.preventDefault();
  }, { passive: false });
  const endLook = (e) => { for (const t of e.changedTouches) if (t.identifier === touch.lookId) touch.lookId = null; };
  lookZone.addEventListener('touchend', endLook);
  lookZone.addEventListener('touchcancel', endLook);

  $('btn-jump').addEventListener('touchstart', (e) => { SFX.unlock(); jumpQueued = true; e.preventDefault(); }, { passive: false });

  const pauseBtn = $('btn-pause');
  pauseBtn.style.display = '';
  pauseBtn.addEventListener('click', pauseGame);
}

// auto-pause when the tab/app goes to background (phone lock, app switch)
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseGame();
});

// ---------------------------------------------------------------------------
// Physics + gameplay update
// ---------------------------------------------------------------------------
const _wish = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();

function updatePlatforms(t, dt) {
  for (const pl of state.platforms) {
    pl.prevPos.copy(pl.pos);
    if (pl.type === 'move') {
      const off = Math.sin(t * pl.speed + pl.phase) * pl.amp;
      pl.pos.copy(pl.base).addScaledVector(pl.axis, off);
    }
    pl.mesh.position.copy(pl.pos);
  }
}

function platBounds(pl) {
  return {
    minX: pl.pos.x - pl.w / 2, maxX: pl.pos.x + pl.w / 2,
    minZ: pl.pos.z - pl.d / 2, maxZ: pl.pos.z + pl.d / 2,
    minY: pl.pos.y - pl.h / 2, maxY: pl.pos.y + pl.h / 2,
  };
}

function doJump() {
  const n = Math.min(player.jumpCount, 2);
  player.vel.y = JUMP_VEL[n];
  player.jumpCount++;
  player.grounded = false;
  player.coyote = 0;
  player.ridingPlat = null;
  SFX.jump(n);
  for (let i = 0; i < 3; i++) jumpPips[i].classList.toggle('lit', i < player.jumpCount);
  if (n === 2) toast('TRIPLE JUMP!', 900);
}

function hurt(knockFrom) {
  if (player.invuln > 0) return;
  state.hearts--;
  updateHearts();
  SFX.hurt();
  player.invuln = 1.6;
  const v = $('damage-vignette');
  v.style.opacity = 1;
  setTimeout(() => (v.style.opacity = 0), 260);
  if (knockFrom) {
    const kb = player.pos.clone().sub(knockFrom).setY(0).normalize().multiplyScalar(7);
    player.vel.x = kb.x; player.vel.z = kb.z; player.vel.y = Math.max(player.vel.y, 6);
    player.grounded = false;
  }
  if (state.hearts <= 0) gameOver();
}

function fellOff() {
  state.hearts--;
  updateHearts();
  SFX.hurt();
  if (state.hearts <= 0) { gameOver(); return; }
  respawn();
  toast('추락! 다시 도전하세요', 1500);
}

function updatePlayer(dt, t) {
  // riding a moving platform: inherit its delta first
  if (player.ridingPlat) {
    const d = player.ridingPlat.pos.clone().sub(player.ridingPlat.prevPos);
    player.pos.add(d);
  }

  // input direction in yaw space
  let ix = 0, iz = 0;
  if (keys.KeyW || keys.ArrowUp) iz -= 1;
  if (keys.KeyS || keys.ArrowDown) iz += 1;
  if (keys.KeyA || keys.ArrowLeft) ix -= 1;
  if (keys.KeyD || keys.ArrowRight) ix += 1;
  if (isTouch) { ix += touch.move.x; iz += touch.move.y; }

  _fwd.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  _right.set(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
  _wish.set(0, 0, 0).addScaledVector(_fwd, -iz).addScaledVector(_right, ix);
  if (_wish.lengthSq() > 1) _wish.normalize();

  const accel = player.grounded ? GROUND_ACCEL : AIR_ACCEL;
  player.vel.x += _wish.x * accel * dt;
  player.vel.z += _wish.z * accel * dt;

  // friction / drag on the horizontal plane
  const damp = player.grounded ? GROUND_FRICTION : AIR_DRAG;
  const f = Math.max(0, 1 - damp * dt * (_wish.lengthSq() > 0.01 && player.grounded ? 0.35 : 1));
  player.vel.x *= f; player.vel.z *= f;

  // clamp horizontal speed
  const hs = Math.hypot(player.vel.x, player.vel.z);
  if (hs > MOVE_SPEED) {
    player.vel.x *= MOVE_SPEED / hs;
    player.vel.z *= MOVE_SPEED / hs;
  }

  // jump
  if (jumpQueued) {
    jumpQueued = false;
    if (player.grounded || player.coyote > 0) {
      player.jumpCount = 0;
      doJump();
    } else if (player.jumpCount < 3) {
      doJump(); // air jumps — walking off an edge still leaves you your stack
    }
  }

  // integrate
  player.vel.y -= GRAVITY * dt;
  player.vel.y = Math.max(player.vel.y, -45);
  const prevFeet = player.pos.y;
  player.pos.addScaledVector(player.vel, dt);

  // collide with platforms
  const wasGrounded = player.grounded;
  player.grounded = false;
  let ridden = null;
  const R = PLAYER_RADIUS;
  for (const pl of state.platforms) {
    const b = platBounds(pl);
    const inX = player.pos.x > b.minX - R && player.pos.x < b.maxX + R;
    const inZ = player.pos.z > b.minZ - R && player.pos.z < b.maxZ + R;
    if (!inX || !inZ) continue;

    // landing on top
    if (player.vel.y <= 0 && prevFeet >= b.maxY - 0.05 && player.pos.y <= b.maxY + 0.01) {
      player.pos.y = b.maxY;
      if (pl.type === 'pad') {
        player.vel.y = BOUNCE_PAD_VEL;
        player.jumpCount = 1;
        SFX.pad();
        toast('BOOST!', 700);
        for (let i = 0; i < 3; i++) jumpPips[i].classList.toggle('lit', i < 1);
      } else {
        player.vel.y = 0;
        player.grounded = true;
        if (pl.type === 'move') ridden = pl;
        if (!wasGrounded) {
          SFX.land();
          player.jumpCount = 0;
          jumpPips.forEach((p) => p.classList.remove('lit'));
        }
      }
      continue;
    }
    // head bump
    const head = player.pos.y + PLAYER_HEIGHT;
    const prevHead = prevFeet + PLAYER_HEIGHT;
    if (player.vel.y > 0 && prevHead <= b.minY + 0.05 && head >= b.minY) {
      player.pos.y = b.minY - PLAYER_HEIGHT;
      player.vel.y = 0;
      continue;
    }
    // side push-out (only when vertically overlapping the slab)
    if (player.pos.y < b.maxY - 0.08 && head > b.minY + 0.05) {
      const pushW = Math.min(player.pos.x - (b.minX - R), (b.maxX + R) - player.pos.x);
      const pushD = Math.min(player.pos.z - (b.minZ - R), (b.maxZ + R) - player.pos.z);
      if (pushW < pushD) {
        player.pos.x += (player.pos.x < pl.pos.x ? -pushW : pushW);
        player.vel.x = 0;
      } else {
        player.pos.z += (player.pos.z < pl.pos.z ? -pushD : pushD);
        player.vel.z = 0;
      }
    }
  }
  player.ridingPlat = ridden;
  player.coyote = player.grounded ? COYOTE_TIME : Math.max(0, player.coyote - dt);

  if (player.invuln > 0) player.invuln -= dt;

  // fell off the world
  if (player.pos.y < KILL_Y) fellOff();

  // ---- auto look-down at apex of high jumps (the signature mechanic) ----
  const wantLookDown = !player.grounded && player.jumpCount >= 2 && player.vel.y < 5;
  player.lookDown = THREE.MathUtils.clamp(player.lookDown + (wantLookDown ? dt * 2.2 : -dt * 3.2), 0, 1);

  // head bob
  const speed2d = Math.hypot(player.vel.x, player.vel.z);
  if (player.grounded && speed2d > 0.5) player.bob += dt * speed2d * 1.4;

  // camera
  const ease = player.lookDown * player.lookDown * (3 - 2 * player.lookDown);
  const pitch = THREE.MathUtils.lerp(player.pitch, LOOKDOWN_PITCH, ease);
  camera.position.set(
    player.pos.x,
    player.pos.y + EYE_HEIGHT + Math.sin(player.bob) * 0.06,
    player.pos.z
  );
  camera.rotation.order = 'YXZ';
  camera.rotation.set(pitch, player.yaw, Math.sin(player.bob * 0.5) * 0.012);
  const targetFov = 78 + (player.jumpCount >= 3 && !player.grounded ? 8 : 0) + speed2d * 0.4;
  camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 6);
  camera.updateProjectionMatrix();

  // damage blink: flicker exposure slightly during invuln
  renderer.toneMappingExposure = player.invuln > 0 && (t * 12 | 0) % 2 ? 0.8 : 1.05;

  // blob shadow raycast
  downRay.set(new THREE.Vector3(player.pos.x, player.pos.y + 0.1, player.pos.z), new THREE.Vector3(0, -1, 0));
  const hits = downRay.intersectObjects(state.platforms.map((p) => p.mesh), false);
  if (hits.length) {
    blobShadow.visible = true;
    blobShadow.position.copy(hits[0].point).y += 0.03;
    const d = hits[0].distance;
    const s = THREE.MathUtils.clamp(1.15 - d * 0.02, 0.45, 1.15);
    blobShadow.scale.setScalar(s);
    blobShadow.material.opacity = THREE.MathUtils.clamp(0.5 - d * 0.006, 0.15, 0.5);
  } else {
    blobShadow.visible = false;
  }
}

function updatePods(dt, t) {
  for (const pod of state.pods) {
    if (pod.taken) continue;
    pod.t += dt;
    pod.g.rotation.y += dt * 2.2;
    pod.g.position.y = pod.baseY + Math.sin(pod.t * 2) * 0.25;
    const dx = pod.g.position.x - player.pos.x;
    const dz = pod.g.position.z - player.pos.z;
    const dy = pod.g.position.y - (player.pos.y + 1.0);
    if (dx * dx + dz * dz < 1.7 && Math.abs(dy) < 1.6) {
      pod.taken = true;
      pod.g.visible = false;
      state.podCount++;
      state.score += 100;
      $('pod-count').textContent = state.podCount;
      SFX.pod();
      if (state.podCount >= state.podTotal) activateExit();
      else toast(`젯 포드 ${state.podCount}/${state.podTotal}`, 1000);
    }
  }
}

function activateExit() {
  state.exitActive = true;
  const e = state.exit;
  e.ring.material = MAT.portalOn;
  e.disc.material.opacity = 0.35;
  e.light.intensity = 8;
  SFX.portal();
  toast('EXIT 포털이 열렸습니다! ✨', 2200);
}

function updateEnemies(dt, t) {
  for (const en of state.enemies) {
    if (en.dead) {
      en.deadT += dt;
      en.g.scale.setScalar(Math.max(0.001, 1 - en.deadT * 4));
      en.g.rotation.y += dt * 20;
      if (en.deadT > 0.3) en.g.visible = false;
      continue;
    }
    en.t += dt;
    const k = (Math.sin(en.t * 1.2) + 1) / 2;
    en.g.position.lerpVectors(en.a, en.b, k);
    en.g.position.y += Math.sin(en.t * 3) * 0.15;
    en.core.rotation.y += dt * 1.5;
    en.g.children[1].rotation.z += dt * 2.5;

    const dx = en.g.position.x - player.pos.x;
    const dz = en.g.position.z - player.pos.z;
    const h2 = dx * dx + dz * dz;
    if (h2 > 1.7) continue;
    const feet = player.pos.y;
    const eTop = en.g.position.y + 0.45, eBot = en.g.position.y - 0.55;
    // stomp: falling onto it from above
    if (player.vel.y < -2 && feet > en.g.position.y - 0.1 && feet < eTop + 0.6) {
      en.dead = true;
      state.score += 250;
      player.vel.y = 14;
      player.jumpCount = 1;
      SFX.stomp();
      toast('+250', 700);
    } else if (feet < eTop && feet + PLAYER_HEIGHT > eBot) {
      hurt(en.g.position);
    }
  }
}

function updateExit(dt, t) {
  const e = state.exit;
  if (!e) return;
  e.ring.rotation.y += dt * (state.exitActive ? 1.6 : 0.3);
  if (state.exitActive) {
    e.disc.rotation.z += dt * 2;
    e.disc.material.opacity = 0.25 + Math.sin(t * 4) * 0.12;
    const d = e.pos.distanceTo(player.pos);
    if (d < 1.9 && Math.abs(player.pos.y - e.pos.y) < 3) stageClear();
  }
}

// ---------------------------------------------------------------------------
// Flow
// ---------------------------------------------------------------------------
function startGame() {
  state.stageIdx = 0;
  state.hearts = MAX_HEARTS;
  state.score = 0;
  state.totalTime = 0;
  buildStage(0);
  setPhase('play');
}

function lockPointer() {
  if (isTouch || document.pointerLockElement === canvas) return;
  try { canvas.requestPointerLock()?.catch?.(() => {}); } catch (_) { /* re-lock too soon */ }
}

function setPhase(p) {
  state.phase = p;
  jumpQueued = false;
  hud.classList.toggle('on', p === 'play');
  if (isTouch) $('touch-ui').classList.toggle('on', p === 'play');
  if (p === 'play') {
    showOverlay(null);
    lockPointer();
  }
}

function pauseGame() {
  if (state.phase !== 'play') return;
  state.phase = 'pause';
  showOverlay('ov-pause');
}

function stageClear() {
  const timeBonus = Math.max(0, 500 - Math.floor(state.stageTime) * 5);
  state.score += 300 + timeBonus + state.hearts * 100;
  state.totalTime += state.stageTime;
  SFX.portal();
  $('clear-time').textContent = state.stageTime.toFixed(1);
  $('clear-score').textContent = state.score;
  $('clear-title').textContent = `${STAGES[state.stageIdx].name} 클리어!`;
  $('btn-next').textContent = state.stageIdx + 1 < STAGES.length ? '다음 스테이지' : '결과 보기';
  state.phase = 'clear';
  document.exitPointerLock?.();
  showOverlay('ov-clear');
}

function nextStage() {
  state.stageIdx++;
  if (state.stageIdx >= STAGES.length) {
    $('final-score').textContent = state.score;
    $('final-time').textContent = state.totalTime.toFixed(1);
    state.phase = 'allclear';
    showOverlay('ov-allclear');
    return;
  }
  state.hearts = Math.min(MAX_HEARTS, state.hearts + 1); // small mercy heal
  buildStage(state.stageIdx);
  setPhase('play');
}

function gameOver() {
  SFX.over();
  $('over-score').textContent = state.score;
  $('over-stage').textContent = state.stageIdx + 1;
  state.phase = 'over';
  document.exitPointerLock?.();
  showOverlay('ov-gameover');
}

$('btn-start').addEventListener('click', () => { SFX.unlock(); startGame(); });
$('btn-resume').addEventListener('click', () => setPhase('play'));
$('btn-next').addEventListener('click', nextStage);
$('btn-retry').addEventListener('click', () => { SFX.unlock(); startGame(); });
$('btn-again').addEventListener('click', () => { SFX.unlock(); startGame(); });

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();
let elapsed = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 1 / 30);
  elapsed += dt;

  // ambient motion runs even on menus (nice background)
  stars.rotation.y += dt * 0.004;
  for (const c of clouds.children) {
    c.position.x += c.userData.drift * dt;
    if (c.position.x > 280) c.position.x = -280;
  }

  if (state.phase === 'play') {
    state.stageTime += dt;
    $('time-val').textContent = state.stageTime.toFixed(1);
    updatePlatforms(elapsed, dt);
    updatePlayer(dt, elapsed);
    updatePods(dt, elapsed);
    updateEnemies(dt, elapsed);
    updateExit(dt, elapsed);
  }

  // sun follows the player so shadows stay crisp
  sun.position.set(player.pos.x + 30, player.pos.y + 60, player.pos.z + 20);
  sun.target.position.copy(player.pos);
  skyDome.position.copy(camera.position);
  stars.position.copy(camera.position);

  composer.render();
}

// boot: build stage 1 behind the title screen as a diorama backdrop
buildStage(0);
camera.position.set(14, 10, 20);
camera.lookAt(0, 6, -4);
onResize();
animate();
