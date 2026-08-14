/* Flowlines: a fixed family of streamlines through whatever velocity field
   they are handed - the figure a textbook draws around an aerofoil.

   Where streaklines scatter particles and let their trails smear, this
   draws the same curves a wind-tunnel schematic would: each streamline is
   integrated fresh every frame from the same seed, so the family visibly
   bends as the body moves, and the direction of flow is carried by dashes
   marching downstream along each curve rather than by particle motion.
   Nothing accumulates, so the ground never tints and the drawing stays as
   crisp as the instruments beside it. */

import { withAlpha } from './ink.js';

export function createFlowlines(options = {}) {
  const count = options.lines || 16;
  const accentEvery = options.accentEvery || 5;
  const step = options.step || 4;        // px advanced per integration step
  const march = options.march || 30;     // px/s the dashes travel at
  const DASH = [2, 9];
  const PERIOD = DASH[0] + DASH[1];

  let width = 0;
  let height = 0;

  /* One streamline, appended to the current path. Ends where it leaves the
     canvas or meets the body - the stagnation streamline simply stops. */
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

  return {
    layout(w, h) {
      width = w;
      height = h;
    },

    /* Two strokes per curve over one built path: a faint solid skeleton so
       the streamline reads as a line, and brighter marching dashes so the
       flow reads as moving. Pass t = 0 for a frozen frame. */
    draw(ctx, velocity, ink, t) {
      for (let i = 0; i < count; i++) {
        const y0 = (i + 0.5) * (height / count);
        const accent = i % accentEvery === accentEvery >> 1;

        ctx.beginPath();
        integrate(ctx, velocity, y0);

        ctx.setLineDash([]);
        ctx.lineWidth = 1;
        ctx.strokeStyle = accent ? withAlpha(ink.accent, 0.22) : withAlpha(ink.line, 0.35);
        ctx.stroke();

        ctx.setLineDash(DASH);
        ctx.lineDashOffset = -((t * march) % PERIOD);
        ctx.lineWidth = accent ? 1.2 : 1;
        ctx.strokeStyle = accent ? withAlpha(ink.accent, 0.75) : ink.line;
        ctx.stroke();
      }
      ctx.setLineDash([]);
    },
  };
}
