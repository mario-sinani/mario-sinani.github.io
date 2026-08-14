/* Flowlines: the figure a wind-tunnel schematic draws - a fixed family of
   streamlines through whatever velocity field it is handed, with the flow's
   motion carried by a few tracers riding it.

   The streamlines are integrated fresh every frame from the same seeds, so
   the family visibly bends as the body moves. They are drawn solid and
   faint: a dashed treatment was tried and dropped, because dashes are
   positioned by arclength along the path, and in an unsteady field the
   upstream path length flutters a little every frame - which made every
   dash downstream of the body wobble at frame rate.

   The tracers are what move instead: short comet strokes advected by the
   actual field velocity, so their motion is continuous by construction.
   Each fades in as it is born, out as it dies or nears the edge, and its
   tail is integrated backwards through the field so the comet always lies
   along its own streamline. Nothing accumulates on the canvas. */

import { withAlpha } from './ink.js';

export function createFlowlines(options = {}) {
  const lines = options.lines || 15;
  const accentEvery = options.accentEvery || 5;
  const step = options.step || 4;          // px advanced per integration step
  const tracerCount = options.tracers || 30;
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

  /* One streamline appended to the current path, ending where it leaves
     the canvas or meets the body - the stagnation streamline just stops. */
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

  function drawSkeleton(ctx, velocity, ink) {
    for (let i = 0; i < lines; i++) {
      const accent = i % accentEvery === accentEvery >> 1;
      ctx.beginPath();
      integrate(ctx, velocity, (i + 0.5) * (height / lines));
      ctx.lineWidth = 1;
      ctx.strokeStyle = accent ? withAlpha(ink.accent, 0.3) : withAlpha(ink.line, 0.55);
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

      // Presence eases in over the first EASE seconds and out over the
      // last, and again approaching the right edge, so a respawn is a
      // fade rather than a pop.
      const presence = Math.min(
        1,
        tr.age / EASE,
        (tr.life - tr.age) / EASE,
        (width + 8 - tr.x) / 90
      );
      if (presence <= 0 || tr.y < -10 || tr.y > height + 10) { spawn(tr, false); continue; }

      // The tail, integrated backwards so the comet lies on its streamline.
      ctx.beginPath();
      ctx.moveTo(tr.x, tr.y);
      let bx = tr.x;
      let by = tr.y;
      for (let k = 0; k < TAIL / 4; k++) {
        const bv = velocity(bx, by);
        if (!bv) break;
        const mag = Math.hypot(bv.u, bv.v) || 1;
        bx -= (bv.u / mag) * 4;
        by -= (bv.v / mag) * 4;
        ctx.lineTo(bx, by);
      }
      const accent = i % accentEvery === 0;
      ctx.lineWidth = accent ? 1.4 : 1.1;
      ctx.strokeStyle = withAlpha(accent ? ink.accent : ink.line, (accent ? 0.85 : 0.8) * presence);
      ctx.stroke();
    }
  }

  return {
    layout(w, h) {
      width = w;
      height = h;
      tracers = Array.from({ length: tracerCount }, () => spawn({}, true));
      // Stagger the first lives so the field does not breathe in unison.
      tracers.forEach((tr) => { tr.age = Math.random() * tr.life * 0.6; });
    },

    draw(ctx, dt, velocity, ink) {
      drawSkeleton(ctx, velocity, ink);
      drawTracers(ctx, dt, velocity, ink);
    },

    /* Frozen frame: the skeleton alone already carries the whole shape of
       the flow, which is what a reader without motion needs. */
    still(ctx, velocity, ink) {
      drawSkeleton(ctx, velocity, ink);
    },
  };
}
