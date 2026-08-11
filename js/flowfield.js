/* Flow field: 2D potential flow past a lifting cylinder, visualised with
   advected particle streaklines on the hero canvas.

   The theme is injected as an `isDark` predicate so this module has no
   knowledge of how theming is implemented. */

const FREESTREAM = 42;        // freestream speed, px/s
const CIRCULATION = 9000;     // vortex strength around the body
const ADVECTION_GAIN = 1.6;   // visual speed-up of particle motion
const TRAIL_FADE = 0.075;     // per-frame wash of trails toward the ground
const STALL_SPEED = 7;        // cull threshold near the stagnation point
const ACCENT_EVERY = 19;      // every nth particle draws in the accent color
const MAX_PARTICLES = 190;

export function initFlowField(canvas, isDark) {
  if (!canvas) return null;

  const ctx = canvas.getContext('2d');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const body = { x: 0, y: 0, r: 60 };
  const palette = { fade: '', stroke: '', accent: '' };
  let particles = [];
  let width = 0;
  let height = 0;
  let lastFrameTime = 0;

  function readPalette() {
    const styles = getComputedStyle(document.documentElement);
    const dark = isDark();
    palette.fade = styles.getPropertyValue('--paper').trim();
    palette.stroke = dark ? 'rgba(237, 242, 246, 0.32)' : 'rgba(15, 25, 38, 0.3)';
    palette.accent = dark ? 'rgba(106, 106, 255, 0.8)' : 'rgba(0, 0, 205, 0.7)';
  }

  // Potential flow: uniform stream + doublet + vortex at the body centre.
  // Returns null inside the body.
  function velocity(x, y) {
    const dx = x - body.x;
    const dy = y - body.y;
    const r2 = dx * dx + dy * dy;
    const R2 = body.r * body.r;
    if (r2 < R2 * 1.02) return null;
    const r4 = r2 * r2;
    return {
      u: FREESTREAM * (1 - R2 * (dx * dx - dy * dy) / r4) + CIRCULATION * dy / (6.2832 * r2),
      v: -FREESTREAM * R2 * (2 * dx * dy) / r4 - CIRCULATION * dx / (6.2832 * r2),
    };
  }

  // Particles live until they leave the canvas or stall, so every streak
  // traces its streamline end to end instead of cutting off mid-flow.
  function spawn(particle, anywhere) {
    particle.x = anywhere ? Math.random() * width : -10;
    particle.y = Math.random() * height;
    return particle;
  }

  function clearCanvas() {
    ctx.fillStyle = palette.fade;
    ctx.fillRect(0, 0, width, height);
  }

  function resize() {
    const rect = canvas.parentElement.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = Math.max(rect.width, 1);
    height = Math.max(rect.height, 1);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    body.x = width * 0.30;
    body.y = height * 0.58;
    body.r = Math.min(width, height) * 0.13;
    readPalette();
    clearCanvas();
    const count = Math.min(MAX_PARTICLES, Math.round(width / 9));
    particles = Array.from({ length: count }, () => spawn({}, true));
    if (reducedMotion) drawStatic();
  }

  // Static fallback: integrate and stroke whole streamlines once.
  function drawStatic() {
    clearCanvas();
    const lines = 26;
    for (let i = 0; i < lines; i++) {
      let x = -5;
      let y = (i + 0.5) * (height / lines);
      const accent = i % 9 === 4;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let step = 0; step < 900; step++) {
        const vel = velocity(x, y);
        if (!vel) break;
        const mag = Math.sqrt(vel.u * vel.u + vel.v * vel.v) || 1;
        x += (vel.u / mag) * 3;
        y += (vel.v / mag) * 3;
        if (x > width + 5 || y < -5 || y > height + 5) break;
        ctx.lineTo(x, y);
      }
      ctx.strokeStyle = accent ? palette.accent : palette.stroke;
      ctx.lineWidth = accent ? 1.2 : 1;
      ctx.stroke();
    }
  }

  // Streakline trails: each frame extends every particle's path by one
  // hairline segment while the whole canvas fades slowly toward paper.
  function frame(time) {
    const dt = Math.min((time - lastFrameTime) / 1000, 0.05) || 0.016;
    lastFrameTime = time;

    ctx.globalAlpha = TRAIL_FADE;
    clearCanvas();
    ctx.globalAlpha = 1;
    ctx.lineCap = 'butt';

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const vel = velocity(p.x, p.y);
      if (!vel) { spawn(p, false); continue; }
      const speed = Math.sqrt(vel.u * vel.u + vel.v * vel.v);
      // Cull stalled particles: near stagnation they barely move, so their
      // segments overlap frame after frame and pool into blobs.
      if (speed < STALL_SPEED) { spawn(p, false); continue; }
      const nx = p.x + vel.u * dt * ADVECTION_GAIN;
      const ny = p.y + vel.v * dt * ADVECTION_GAIN;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(nx, ny);
      const accent = i % ACCENT_EVERY === 0;
      ctx.strokeStyle = accent ? palette.accent : palette.stroke;
      ctx.lineWidth = accent ? 1.2 : 1;
      ctx.stroke();
      p.x = nx;
      p.y = ny;
      if (p.x > width + 10 || p.y < -10 || p.y > height + 10) spawn(p, false);
    }
    requestAnimationFrame(frame);
  }

  function repaint() {
    readPalette();
    clearCanvas();
    if (reducedMotion) drawStatic();
  }

  resize();
  window.addEventListener('resize', resize);
  if (!reducedMotion) requestAnimationFrame(frame);

  return { repaint };
}
