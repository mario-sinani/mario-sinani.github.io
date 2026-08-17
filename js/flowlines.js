/* Flowlines: a fixed set of streamlines through a velocity field, with
   tracer strokes that move with the flow.

   The module integrates each streamline from the same start point in
   each frame. The set of lines then bends while the body moves. The
   lines are solid and not dashed. The position of a dash comes from the
   length of the path. In an unsteady field that length changes in each
   frame, and the dashes moved without control.

   The tracers show the motion. The velocity of the field advects each
   tracer, and the movement is continuous. A tracer fades in when it
   starts. It fades out at the end of its life, or near the right edge.
   The module integrates each tail backward through the field, and the
   tracer stays on its own streamline. */

import { withAlpha } from './ink.js';

export function createFlowlines(options = {}) {
  const lines = options.lines || 21;
  const accentEvery = options.accentEvery || 5;
  const step = options.step || 4;          // px advanced per integration step
  // The test is for null and undefined only, because a scene can ask
  // for zero tracers.
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

  /* Add one streamline to the current path. Stop at the edge of the
     canvas or at the body. */
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

  /* Draw the lines thin and near to each other. They are the texture
     of the drawing. The bodies and the instruments give the drawing its
     weight. */
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

      // The tracer becomes visible after it starts. It becomes
      // invisible before it ends, and also near the right edge. A new
      // tracer fades in, and it does not appear suddenly.
      const presence = Math.min(
        1,
        tr.age / EASE,
        (tr.life - tr.age) / EASE,
        (width + 8 - tr.x) / 90
      );
      if (presence <= 0 || tr.y < -10 || tr.y > height + 10) { spawn(tr, false); continue; }

      /* Integrate the tail backward, and it is then on the streamline.
         Draw the tail one segment at a time. The tail becomes thinner
         from the head to the end. */
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
      // Give each tracer a different first life, because the tracers
      // must not fade in at the same time.
      tracers.forEach((tr) => { tr.age = Math.random() * tr.life * 0.6; });
    },

    draw(ctx, dt, velocity, ink) {
      drawSkeleton(ctx, velocity, ink);
      drawTracers(ctx, dt, velocity, ink);
    },

    /* Fixed frame: the lines alone show the shape of the flow. */
    still(ctx, velocity, ink) {
      drawSkeleton(ctx, velocity, ink);
    },
  };
}
