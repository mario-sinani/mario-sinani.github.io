/* Aeroelastic field: the unsteady flow around a wing section that pitches
   and plunges, drawn as advected streaklines.

   A sibling of the hero flow field, and deliberately the same visual
   language - hairline streaks washing slowly toward the page ground - but
   the physics belongs to the paper it sits behind rather than to the site:

     · the section carries a bound vortex whose strength follows the
       effective incidence, so the flow visibly turns as the wing moves;
     · Kelvin's theorem is respected by shedding the change in that
       circulation off the trailing edge, which is what draws the wake;
     · the oscillation amplitude sweeps slowly, standing in for the sweep
       across trim conditions the model is built over.

   Screen axes are x right, y down, so a nose-up section is a negative
   canvas rotation and positive bound circulation.

   The theme arrives as an `isDark` predicate, so this module knows nothing
   about how theming is implemented. */

/* Speeds are in px/s and the section is sized in px, so the two together
   fix the reduced frequency k = omega * chord / (2 * freestream) - the
   number that decides whether this looks like a wing in a tunnel or like
   noise. These values put k near 0.4, squarely in the flutter range. */
const FREESTREAM = 110;         // freestream speed, px/s
const ADVECTION_GAIN = 1;       // particles are drawn at the true field speed
/* Slower fade and more particles than the hero field: the wake is the
   point here, and a vortex street only reads once the streaks are long
   enough to bend around it. */
const TRAIL_FADE = 0.05;        // per-frame wash of trails toward the ground
const STALL_SPEED = 9;          // cull threshold near the stagnation point
const ACCENT_EVERY = 17;        // every nth particle draws in the accent color
const MAX_PARTICLES = 260;

const FLUTTER_HZ = 0.1;         // pitch/plunge frequency
const PITCH_LEAD = 1.9;         // radians by which pitch leads plunge
const PITCH_AMPLITUDE = 0.26;   // radians
const PLUNGE_FRACTION = 0.06;   // plunge amplitude, fraction of canvas height
const SWEEP_SECONDS = 26;       // period of the slow amplitude sweep

const SHED_INTERVAL = 0.1;      // seconds between shed wake vortices
const MAX_WAKE = 80;
const WAKE_CORE2 = 210;         // squared core radius, keeps induction finite
const TWO_PI = 6.2832;

export function initAeroelasticField(canvas, isDark) {
  if (!canvas) return null;

  const ctx = canvas.getContext('2d');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const palette = { fade: '', stroke: '', accent: '', body: '' };

  // Mid-chord position, chord, incidence and the circulation that follows.
  const section = { x: 0, y: 0, baseY: 0, chord: 120, half: 60, thickness: 7, gain: 0, alpha: 0, gamma: 0 };
  let wake = [];
  let particles = [];
  let width = 0;
  let height = 0;
  let clock = 0;
  let sinceShed = 0;
  let pendingShed = 0;
  let lastFrameTime = 0;

  function readPalette() {
    const styles = getComputedStyle(document.documentElement);
    const dark = isDark();
    palette.fade = styles.getPropertyValue('--paper').trim();
    palette.stroke = dark ? 'rgba(237, 242, 246, 0.32)' : 'rgba(15, 25, 38, 0.3)';
    palette.accent = dark ? 'rgba(106, 106, 255, 0.8)' : 'rgba(0, 0, 205, 0.7)';
    palette.body = dark ? 'rgba(154, 154, 255, 0.75)' : 'rgba(0, 0, 205, 0.55)';
  }

  /* Kinematics. Plunge is positive upward, so the section's screen y is the
     rest height minus it, and a downward plunge rate raises the effective
     incidence the same way a nose-up rotation does. */
  function moveSection(t) {
    const omega = TWO_PI * FLUTTER_HZ;
    const sweep = 0.55 + 0.45 * Math.sin((TWO_PI * t) / SWEEP_SECONDS);
    const plungeAmp = height * PLUNGE_FRACTION * sweep;

    const h = plungeAmp * Math.sin(omega * t);
    const hRate = plungeAmp * omega * Math.cos(omega * t);

    section.alpha = PITCH_AMPLITUDE * sweep * Math.sin(omega * t + PITCH_LEAD);
    section.y = section.baseY - h;
    section.gamma = section.gain * (section.alpha - hRate / FREESTREAM);
  }

  function quarterChord() {
    // A quarter chord back from the leading edge, where thin-aerofoil
    // theory places the bound vortex.
    const offset = -section.half * 0.5;
    return {
      x: section.x + offset * Math.cos(section.alpha),
      y: section.y - offset * Math.sin(section.alpha),
    };
  }

  function trailingEdge() {
    return {
      x: section.x + section.half * Math.cos(section.alpha),
      y: section.y - section.half * Math.sin(section.alpha),
    };
  }

  /* True when a point clears the section: distance from the point to the
     chord segment, taken past the leading and trailing edges as well so the
     rounded ends are covered too. */
  function offSection(x, y) {
    const dx = x - section.x;
    const dy = y - section.y;
    const cos = Math.cos(section.alpha);
    const sin = -Math.sin(section.alpha);
    let along = dx * cos + dy * sin;
    if (along > section.half) along = section.half;
    if (along < -section.half) along = -section.half;
    const px = dx - along * cos;
    const py = dy - along * sin;
    return px * px + py * py > section.thickness * section.thickness;
  }

  function addVortex(out, x, y, vx, vy, gamma) {
    const dx = x - vx;
    const dy = y - vy;
    const k = gamma / (TWO_PI * (dx * dx + dy * dy + WAKE_CORE2));
    out.u -= k * dy;
    out.v += k * dx;
  }

  // Uniform stream, a doublet for the section's thickness, the bound vortex
  // and every vortex already shed. Null inside the section.
  function velocity(x, y) {
    if (!offSection(x, y)) return null;

    const out = { u: FREESTREAM, v: 0 };

    const dx = x - section.x;
    const dy = y - section.y;
    const r2 = dx * dx + dy * dy;
    const R2 = section.thickness * section.thickness * 4;
    if (r2 > R2) {
      const r4 = r2 * r2;
      out.u += -FREESTREAM * R2 * (dx * dx - dy * dy) / r4;
      out.v += -FREESTREAM * R2 * (2 * dx * dy) / r4;
    }

    const bound = quarterChord();
    addVortex(out, x, y, bound.x, bound.y, section.gamma);

    for (let i = 0; i < wake.length; i++) {
      addVortex(out, x, y, wake[i].x, wake[i].y, wake[i].gamma);
    }
    return out;
  }

  /* Kelvin's theorem: whatever the bound circulation gains, the wake takes
     the opposite. Change is banked between sheds so the wake stays a
     countable number of vortices rather than one per frame. */
  function shed(dt, previousGamma) {
    pendingShed -= section.gamma - previousGamma;
    sinceShed += dt;
    if (sinceShed < SHED_INTERVAL) return;
    sinceShed = 0;
    const edge = trailingEdge();
    wake.push({ x: edge.x, y: edge.y, gamma: pendingShed });
    pendingShed = 0;
    if (wake.length > MAX_WAKE) wake.shift();
  }

  function convectWake(dt) {
    const bound = quarterChord();
    for (let i = 0; i < wake.length; i++) {
      const w = wake[i];
      const out = { u: FREESTREAM, v: 0 };
      addVortex(out, w.x, w.y, bound.x, bound.y, section.gamma);
      w.x += out.u * dt * ADVECTION_GAIN;
      w.y += out.v * dt * ADVECTION_GAIN;
    }
    wake = wake.filter((w) => w.x < width + 40);
  }

  function spawn(particle, anywhere) {
    particle.x = anywhere ? Math.random() * width : -10;
    particle.y = Math.random() * height;
    return particle;
  }

  function clearCanvas() {
    ctx.fillStyle = palette.fade;
    ctx.fillRect(0, 0, width, height);
  }

  /* The section itself, as a hairline outline rather than a solid mass:
     the hero text sits over this canvas, and a filled shape behind a
     paragraph reads as a smudge where an outline reads as a drawing. */
  function drawSection() {
    ctx.beginPath();
    ctx.ellipse(
      section.x, section.y,
      section.half, section.thickness,
      -section.alpha, 0, TWO_PI
    );
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = palette.body;
    ctx.stroke();
  }

  function resize() {
    const rect = canvas.parentElement.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = Math.max(rect.width, 1);
    height = Math.max(rect.height, 1);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    section.chord = Math.min(width * 0.2, height * 0.34);
    section.half = section.chord / 2;
    section.thickness = Math.max(section.chord * 0.055, 4);
    // Thin-aerofoil bound circulation per radian of incidence: pi * c * U.
    section.gain = Math.PI * section.chord * FREESTREAM;
    /* High and to the left: the hero panel is vertically centred, so this
       band above it is clear, and the wake then streams right across the
       full width instead of running straight off the near edge. */
    section.x = width * 0.3;
    section.baseY = height * 0.2;

    wake = [];
    readPalette();
    moveSection(clock);
    clearCanvas();
    const count = Math.min(MAX_PARTICLES, Math.round(width / 7));
    particles = Array.from({ length: count }, () => spawn({}, true));
    if (reducedMotion) drawStatic();
  }

  // Static fallback: the section frozen at incidence with whole streamlines
  // stroked once, so the physics still reads without any motion.
  function drawStatic() {
    clock = 0.9 / FLUTTER_HZ;
    moveSection(clock);
    clearCanvas();
    const lines = 24;
    for (let i = 0; i < lines; i++) {
      let x = -5;
      let y = (i + 0.5) * (height / lines);
      const accent = i % 8 === 3;
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
    drawSection();
  }

  function frame(time) {
    const dt = Math.min((time - lastFrameTime) / 1000, 0.05) || 0.016;
    lastFrameTime = time;
    clock += dt;

    const previousGamma = section.gamma;
    moveSection(clock);
    shed(dt, previousGamma);
    convectWake(dt);

    ctx.globalAlpha = TRAIL_FADE;
    clearCanvas();
    ctx.globalAlpha = 1;
    ctx.lineCap = 'butt';

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const vel = velocity(p.x, p.y);
      if (!vel) { spawn(p, false); continue; }
      const speed = Math.sqrt(vel.u * vel.u + vel.v * vel.v);
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

    drawSection();
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
