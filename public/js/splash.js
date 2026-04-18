/* ===== splash.js: Intro splash animation (Seed of Life + particles) ===== */

(function(){
  const c = document.getElementById('introCanvas');
  if (!c) return;
  const ctx = c.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  let W, H, particles = [], frame = 0;

  function resize() {
    W = window.innerWidth; H = window.innerHeight;
    c.width = W * dpr; c.height = H * dpr;
    ctx.scale(dpr, dpr);
  }
  resize();

  // Particles
  for (let i = 0; i < 80; i++) {
    particles.push({
      x: Math.random() * W, y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.8, vy: (Math.random() - 0.5) * 0.8,
      r: Math.random() * 1.5 + 0.5,
      a: Math.random() * 0.5 + 0.2,
    });
  }

  // Seed of Life: 7 circles (1 center + 6 around)
  const seedR = Math.min(W, H) * 0.12;

  function draw() {
    frame++;
    ctx.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2;
    const t = frame / 60;
    const introAlpha = Math.min(1, frame / 30);

    // Radial glow
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, seedR * 4);
    g.addColorStop(0, `rgba(124,92,252,${0.12 * introAlpha})`);
    g.addColorStop(0.5, `rgba(62,207,207,${0.05 * introAlpha})`);
    g.addColorStop(1, 'transparent');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // Rotating Seed of Life
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(t * 0.15);
    const geoAlpha = Math.min(0.35, frame / 60 * 0.35);

    // Center circle
    ctx.beginPath();
    ctx.arc(0, 0, seedR, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(124,92,252,${geoAlpha})`;
    ctx.lineWidth = 1;
    ctx.stroke();

    // 6 surrounding circles
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const px = Math.cos(a) * seedR;
      const py = Math.sin(a) * seedR;
      ctx.beginPath();
      ctx.arc(px, py, seedR, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(62,207,207,${geoAlpha * 0.7})`;
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }

    // Outer bounding circle
    const outerR = seedR * 2 * (1 + Math.sin(t * 1.5) * 0.03);
    ctx.beginPath();
    ctx.arc(0, 0, outerR, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255,107,157,${geoAlpha * 0.4})`;
    ctx.lineWidth = 0.6;
    ctx.stroke();

    ctx.restore();

    // Particles
    particles.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
      if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(240,240,255,${p.a * introAlpha})`;
      ctx.fill();
    });

    if (frame < 180) requestAnimationFrame(draw);
  }
  draw();

  // Trigger logo animation (setTimeout ensures repaint on iOS)
  window._splashShown = Date.now();
  setTimeout(() => {
    const logo = document.getElementById('introLogo');
    const sub = document.getElementById('introSub');
    const subKo = document.getElementById('introSubKo');
    if (logo) { logo.style.opacity = '1'; logo.style.transform = 'scale(1)'; }
    if (sub) { sub.style.opacity = '1'; sub.style.transform = 'translateY(0)'; }
    if (subKo) { subKo.style.opacity = '1'; subKo.style.transform = 'translateY(0)'; }
  }, 50);

  // Safety: force remove splash after 8 seconds even if init hangs
  window._forceHideSplash = () => {
    const sp = document.getElementById('introSplash');
    if (sp && sp.parentNode) {
      sp.style.opacity = '0';
      setTimeout(() => sp.remove(), 600);
    }
  };
  setTimeout(window._forceHideSplash, 8000);
})();
