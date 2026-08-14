/* Streaklines: a pool of particles that a velocity field advects. Each
   particle keeps its recent path and draws it as one tapered stroke.

   The module does not paint on top of the last frame. An earlier version
   drew one short segment per frame and let the canvas fade. That method
   makes an uneven stroke: a particle advances about one pixel per frame,
   which is less than the width of an antialiased hairline, so each new
   segment inks the same pixels again. The head of the trail becomes a
   solid blob, and the tail stays thin.

   This version keeps the path and strokes it once per frame. The width
   stays constant along the trail, and a gradient from the head to the
   tail supplies the fade. One stroke per particle also keeps the cost
   low.

   The trail holds a fixed time, not a fixed number of points, so its
   length does not change with the refresh rate. A fast particle then
   draws a long streak and a slow particle a short one, which shows the
   speed of the flow.

   A particle that almost stops is replaced. Near a stagnation point its
   path points bunch together and the trail draws as a dark arc. */

import { withAlpha } from './ink.js';

export function createStreaklines(options = {}) {
  const spacing = options.spacing || 9;        // px of width per particle
  const max = options.max || 190;
  const accentEvery = options.accentEvery || 19;
  const gain = options.gain || 1;              // visual speed-up of advection
  const seconds = options.seconds || 0.8;      // time held in one trail
  const lineWidth = options.lineWidth || 1.3;
  const fadeIn = options.fadeIn || 0.5;        // seconds to fade a new trail in
  /* Speed below which a particle is replaced. Near a stagnation point a
     particle almost stops, and its path points bunch into a dark arc. */
  const stall = options.stall || 7;
  /* Seconds between path points. The particle still moves every frame;
     a coarser path costs less and a hairline hides the difference. */
  const sample = options.sample || 0.035;
  /* Speed that a particle at the freestream reaches. Faster particles
     draw brighter, so the acceleration over the body is visible. */
  const reference = options.reference || 0;

  let particles = [];
  let width = 0;
  let height = 0;

  function spawn(particle, anywhere) {
    particle.x = anywhere ? Math.random() * width : -10;
    particle.y = Math.random() * height;
    particle.path = [];
    particle.age = 0;
    particle.lastSample = -99;
    return particle;
  }

  /** Brightness from the local speed. Returns 1 with no reference speed. */
  function weigh(speed) {
    if (!reference) return 1;
    const ratio = speed / reference;
    return Math.min(1.25, Math.max(0.62, 0.62 + (ratio - 0.7) * 0.9));
  }

  return {
    layout(w, h) {
      width = w;
      height = h;
      const count = Math.min(max, Math.round(w / spacing));
      particles = Array.from({ length: count }, () => spawn({}, true));
      // Stagger the first ages, so the field does not fade in together.
      particles.forEach((p) => { p.age = Math.random() * fadeIn; });
    },

    draw(ctx, dt, velocity, ink, t) {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = lineWidth;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const v = velocity(p.x, p.y);
        if (!v) { spawn(p, false); continue; }
        if (Math.hypot(v.u, v.v) < stall) { spawn(p, false); continue; }

        p.x += v.u * dt * gain;
        p.y += v.v * dt * gain;
        p.age += dt;
        if (t - p.lastSample >= sample) {
          p.lastSample = t;
          p.path.push({ x: p.x, y: p.y, t });
        }
        while (p.path.length && t - p.path[0].t > seconds) p.path.shift();

        if (p.x > width + 10 || p.y < -10 || p.y > height + 10) { spawn(p, false); continue; }
        if (p.path.length < 2) continue;

        // The head is the live position, not the last recorded point.
        const head = { x: p.x, y: p.y };
        const tail = p.path[0];
        const accent = i % accentEvery === 0;
        /* Fade a new trail in, and fade every trail out as it nears the
           right edge, so no trail appears or disappears abruptly. */
        const presence = Math.min(1, p.age / fadeIn, (width + 10 - p.x) / 70)
          * weigh(Math.hypot(v.u, v.v));
        if (presence <= 0) continue;

        /* One gradient from the head to the tail gives the taper. The
           trail curves gently, so a linear gradient follows it closely
           enough, and it costs one stroke instead of one per segment. */
        const paint = ctx.createLinearGradient(head.x, head.y, tail.x, tail.y);
        const colour = accent ? ink.accent : ink.line;
        const lead = Math.min(1, presence);
        paint.addColorStop(0, withAlpha(colour, lead));
        paint.addColorStop(0.5, withAlpha(colour, lead * 0.55));
        paint.addColorStop(1, withAlpha(colour, 0));

        ctx.beginPath();
        ctx.moveTo(p.path[0].x, p.path[0].y);
        for (let k = 1; k < p.path.length; k++) ctx.lineTo(p.path[k].x, p.path[k].y);
        ctx.lineTo(head.x, head.y);
        ctx.strokeStyle = paint;
        ctx.stroke();
      }

      ctx.lineCap = 'butt';
      ctx.lineJoin = 'miter';
    },

    // Frozen frame: integrate and stroke whole streamlines once.
    still(ctx, velocity, ink, lines = 26) {
      for (let i = 0; i < lines; i++) {
        let x = -5;
        let y = (i + 0.5) * (height / lines);
        const accent = i % 9 === 4;
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (let step = 0; step < 900; step++) {
          const v = velocity(x, y);
          if (!v) break;
          const mag = Math.hypot(v.u, v.v) || 1;
          x += (v.u / mag) * 3;
          y += (v.v / mag) * 3;
          if (x > width + 5 || y < -5 || y > height + 5) break;
          ctx.lineTo(x, y);
        }
        ctx.strokeStyle = accent ? ink.accent : ink.line;
        ctx.lineWidth = accent ? 1.2 : 1;
        ctx.stroke();
      }
    },
  };
}
