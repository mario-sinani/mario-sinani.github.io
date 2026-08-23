/* Scene: the drawing of the Karman vortex street behind a cylinder, one of
   the two fields of the hero.

   The model is in js/models/vortex-street.js. The scene integrates the
   streamlines through the velocity the model gives, and draws the cores of
   the vortices and the body. The wave in the lines comes from the
   vortices, and is not a fixed oscillation. */

import { createFlowlines } from '../flowlines.js';
import { withAlpha } from '../ink.js';
import { TWO_PI } from '../potential-flow.js';
import { createVortexStreetModel, FREESTREAM, CONVECTION, SPACING, STAGGER, STRENGTH,
  CORE } from '../models/vortex-street.js';


export function createVortexStreet() {
  const flow = createFlowlines({ lines: 30, accentEvery: 6, step: 4, tracers: 0 });
  const body = { x: 0, y: 0, baseY: 0, r: 60 };
  const street = { spacing: 300, stagger: 84, period: 8, strength: 3000, core2: 2000 };
  const model = createVortexStreetModel(body, street);
  let width = 0;
  let height = 0;

  function drawBody(ctx, ink) {
    ctx.beginPath();
    ctx.arc(body.x, body.y, body.r, 0, TWO_PI);
    ctx.lineWidth = 1.1;
    ctx.strokeStyle = withAlpha(ink.body, 0.34);
    ctx.stroke();
  }

  /* The cores, as light rings. They show the centres that the lines turn
     around. */
  function drawCores(ctx, ink) {
    model.each((v) => {
      const fade = v.ramp * Math.min(1, (width + 40 - v.x) / 150);
      if (fade <= 0) return;
      ctx.beginPath();
      ctx.arc(v.x, v.y, body.r * 0.2, 0, TWO_PI);
      ctx.lineWidth = 1;
      ctx.strokeStyle = withAlpha(v.gamma > 0 ? ink.accent : ink.wash, 0.42 * fade);
      ctx.stroke();
    });
  }

  return {
    // A figure with lines. The engine clears it in each frame.
    fade: 1,

    /* Put the wake back at its start. The engine calls it before it
       draws a fixed frame after a resize. */
    reset() {
      model.reset();
    },

    layout(w, h) {
      width = w;
      height = h;
      model.setWidth(w);
      body.x = w * 0.28;
      body.baseY = h * 0.56;
      body.y = body.baseY;
      body.r = Math.min(w, h) * 0.1;

      const diameter = body.r * 2;
      street.spacing = w * SPACING;
      street.stagger = street.spacing * STAGGER;
      street.period = street.spacing / (FREESTREAM * CONVECTION);
      street.strength = STRENGTH * FREESTREAM * diameter;
      street.core2 = (CORE * diameter) ** 2;

      flow.layout(w, h);
    },

    frame(ctx, dt, t, ink) {
      model.advance(dt, t);
      flow.draw(ctx, dt, model.velocity, ink);
      drawCores(ctx, ink);
      drawBody(ctx, ink);
    },

    still(ctx, ink, t) {
      /* Make one street first, or the fixed frame shows an empty wake. */
      const at = t || 0;
      model.fillWake(at);
      flow.still(ctx, model.velocity, ink);
      drawCores(ctx, ink);
      drawBody(ctx, ink);
      return at;
    },
  };
}
