/* Flowlines: a fixed set of streamlines through a velocity field, with
   tracer strokes that move with the flow.

   The module integrates each line again in each frame, so the set bends
   while the body moves. The lines are solid: a dash follows the path
   length, and that length changes in an unsteady field. Each tail
   integrates backward, so a tracer stays on its own line. */

import { withAlpha } from './ink.js';

export function createFlowlines(options = {}) {
  const lines = options.lines || 21;
  const accentEvery = options.accentEvery || 5;
  const step = options.step || 4;          // px advanced per integration step
  // Test for null and undefined only: a scene can ask for zero tracers.
  const tracerCount = options.tracers ?? 30;
  const tracerGain = options.tracerGain || 0.55;  // fraction of field speed
  const TAIL = 16;                         // px of comet tail
  const EASE = 0.8;                        // seconds to fade a tracer in/out

  let width = 0;
  let height = 0;
  let tracers = [];

  function spawn(tracer, anywhere) {
    tracer.x = anywhere ? Math.random() * width : -8;
    tracer.y = Math.random() * height;
    tracer.age = 0;
    tracer.life = 5 + Math.random() * 4;
    return tracer;
  }

  /* Add one streamline. Stop at the edge of the canvas or at the body. */
  function integrate(ctx, velocity, y0) {
    let x = -6;
    let y = y0;
    ctx.moveTo(x, y);
    const max = Math.ceil((width + 12) / step) + 80;
    for (let i = 0; i < max; i++) {
      const v = velocity(x, y);
      if (!v) return;
      const mag = Math.hypot(v.u, v.v) || 1;
      x += (v.u / mag) * step;
      y += (v.v / mag) * step;
      if (x > width + 6 || y < -6 || y > height + 6) return;
      ctx.lineTo(x, y);
    }
  }

  /* The lines are thin and near to each other: they are the texture. The
     bodies and the instruments give the weight. */
  function drawSkeleton(ctx, velocity, ink) {
    for (let i = 0; i < lines; i++) {
      const accent = i % accentEvery === accentEvery >> 1;
      ctx.beginPath();
      integrate(ctx, velocity, (i + 0.5) * (height / lines));
      ctx.lineWidth = 0.75;
      ctx.strokeStyle = accent ? withAlpha(ink.wash, 0.5) : withAlpha(ink.line, 0.42);
      ctx.stroke();
    }
  }

  function drawTracers(ctx, dt, velocity, ink) {
    for (let i = 0; i < tracers.length; i++) {
      const tr = tracers[i];
      const v = velocity(tr.x, tr.y);
      if (!v) { spawn(tr, false); continue; }
      tr.x += v.u * dt * tracerGain;
      tr.y += v.v * dt * tracerGain;
      tr.age += dt;

      // A tracer fades in after it starts, and out before it ends and near
      // the right edge.
      const presence = Math.min(
        1,
        tr.age / EASE,
        (tr.life - tr.age) / EASE,
        (width + 8 - tr.x) / 90
      );
      if (presence <= 0 || tr.y < -10 || tr.y > height + 10) { spawn(tr, false); continue; }

      /* Integrate the tail backward, so it lies on the streamline. It
         becomes thinner from the head to the end. */
      const points = [[tr.x, tr.y]];
      let bx = tr.x;
      let by = tr.y;
      for (let k = 0; k < TAIL / 4; k++) {
        const bv = velocity(bx, by);
        if (!bv) break;
        const mag = Math.hypot(bv.u, bv.v) || 1;
        bx -= (bv.u / mag) * 4;
        by -= (bv.v / mag) * 4;
        points.push([bx, by]);
      }
      const accent = i % accentEvery === 0;
      const colour = accent ? ink.accent : ink.wash;
      const base = (accent ? 0.85 : 0.7) * presence;
      ctx.lineCap = 'round';
      for (let k = 0; k < points.length - 1; k++) {
        const falloff = 1 - k / (points.length - 1);
        ctx.beginPath();
        ctx.moveTo(points[k][0], points[k][1]);
        ctx.lineTo(points[k + 1][0], points[k + 1][1]);
        ctx.lineWidth = 0.5 + 1 * falloff;
        ctx.strokeStyle = withAlpha(colour, base * falloff * falloff);
        ctx.stroke();
      }
      ctx.lineCap = 'butt';
    }
  }

  return {
    layout(w, h) {
      width = w;
      height = h;
      tracers = Array.from({ length: tracerCount }, () => spawn({}, true));
      // A different first life for each tracer, so they do not fade in
      // together.
      tracers.forEach((tr) => { tr.age = Math.random() * tr.life * 0.6; });
    },

    draw(ctx, dt, velocity, ink) {
      drawSkeleton(ctx, velocity, ink);
      drawTracers(ctx, dt, velocity, ink);
    },

    /* Fixed frame: the lines alone give the shape of the flow. */
    still(ctx, velocity, ink) {
      drawSkeleton(ctx, velocity, ink);
    },
  };
}
