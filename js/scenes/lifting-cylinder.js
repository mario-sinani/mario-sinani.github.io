/* Scene: potential flow past a lifting cylinder - uniform stream, doublet
   and vortex superposed - which is the field behind the site's hero.

   The simplest body that still produces circulation and therefore lift,
   and the reason the streaks above it run faster than those below. */

import { createStreaklines } from '../streaklines.js';
import { addVortex, addDoublet } from '../potential-flow.js';

const FREESTREAM = 42;        // freestream speed, px/s
const CIRCULATION = 9000;     // vortex strength around the body
const ADVECTION_GAIN = 1.6;   // visual speed-up of particle motion

export function createLiftingCylinder() {
  const streaks = createStreaklines({ spacing: 9, max: 190, stall: 7, accentEvery: 19, gain: ADVECTION_GAIN });
  const body = { x: 0, y: 0, r: 60 };

  function velocity(x, y) {
    const dx = x - body.x;
    const dy = y - body.y;
    if (dx * dx + dy * dy < body.r * body.r * 1.02) return null;
    const out = { u: FREESTREAM, v: 0 };
    addDoublet(out, x, y, body.x, body.y, body.r, FREESTREAM);
    // Sign is the mirror of the shared helper's: this vortex is clockwise
    // positive, which is what puts the fast side on top.
    addVortex(out, x, y, body.x, body.y, -CIRCULATION, 0);
    return out;
  }

  return {
    fade: 0.075,

    layout(w, h) {
      body.x = w * 0.3;
      body.y = h * 0.58;
      body.r = Math.min(w, h) * 0.13;
      streaks.layout(w, h);
    },

    frame(ctx, dt, t, ink) {
      streaks.draw(ctx, dt, velocity, ink);
    },

    still(ctx, ink) {
      streaks.still(ctx, velocity, ink, 26);
    },
  };
}
