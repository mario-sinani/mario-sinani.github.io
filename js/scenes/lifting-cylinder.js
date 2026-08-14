/* Scene: potential flow past a lifting cylinder. This is the field
   behind the site's hero: uniform stream, doublet, and vortex.

   The cylinder is the simplest body with circulation, and so with lift.

   The drawing is the figure this field is always shown with. The module
   integrates a family of streamlines from evenly spaced points at the
   inlet and strokes each one whole, so the lines run the width of the
   canvas. Streamlines cannot cross, and the flow between two of them is
   constant, so the space between two lines shows the local speed. The
   lines close over the top of the body, where the flow is fast, and open
   below it, where the flow is slow. That difference is the lift.

   Tracers ride the field and supply the motion. One faint circle shows
   the body that turns the flow. */

import { createFlowlines } from '../flowlines.js';
import { withAlpha } from '../ink.js';
import { addVortex, addDoublet, TWO_PI } from '../potential-flow.js';

const FREESTREAM = 42;        // freestream speed, px/s
const CIRCULATION = 9000;     // vortex strength around the body

export function createLiftingCylinder() {
  const flow = createFlowlines({
    lines: 22,
    accentEvery: 5,
    step: 4,
    tracers: 40,
    tracerGain: 1.5,
  });
  const body = { x: 0, y: 0, r: 60 };

  function velocity(x, y) {
    const dx = x - body.x;
    const dy = y - body.y;
    if (dx * dx + dy * dy < body.r * body.r * 1.02) return null;
    const out = { u: FREESTREAM, v: 0 };
    addDoublet(out, x, y, body.x, body.y, body.r, FREESTREAM);
    // Negative gamma makes this vortex clockwise, which puts the fast
    // side on top.
    addVortex(out, x, y, body.x, body.y, -CIRCULATION, 0);
    return out;
  }

  function drawBody(ctx, ink) {
    ctx.beginPath();
    ctx.arc(body.x, body.y, body.r, 0, TWO_PI);
    ctx.lineWidth = 1;
    ctx.strokeStyle = withAlpha(ink.body, 0.3);
    ctx.stroke();
  }

  return {
    // A drawn figure. The engine clears it fully each frame.
    fade: 1,

    layout(w, h) {
      body.x = w * 0.3;
      body.y = h * 0.58;
      body.r = Math.min(w, h) * 0.155;
      flow.layout(w, h);
    },

    frame(ctx, dt, t, ink) {
      flow.draw(ctx, dt, velocity, ink);
      drawBody(ctx, ink);
    },

    still(ctx, ink) {
      flow.still(ctx, velocity, ink);
      drawBody(ctx, ink);
    },
  };
}
