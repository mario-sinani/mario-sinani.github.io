/* Vortex wake: the vortices that a lifting body sheds from its
   trailing edge.

   This module controls the state of the wake and its physics. It keeps
   the change in the bound circulation. It sheds that change as discrete
   vortices. It increases each new vortex to its full strength. It
   convects the wake downstream. It adds the induced velocity of the
   wake to a sample of the field. The scene that has the body selects
   how to draw the wake.

   The theorem of Kelvin sets the strength of the shed vortex: the wake
   gets the opposite of the increase in the bound circulation. */

import { addVortex } from './potential-flow.js';

/**
 * options.interval    the seconds between two shed vortices
 * options.ramp        the seconds for a new vortex to get its full
 *                     strength
 * options.max         the maximum number of vortices to keep
 * options.core2       the square of the core radius for the induced
 *                     velocity
 * options.cullRadius2 the square of the distance after which a vortex
 *                     adds nothing
 */
export function createVortexWake(options) {
  const { interval, ramp, max, core2, cullRadius2 } = options;
  let vortices = [];
  let sinceShed = 0;
  let pending = 0;
  let limitX = Infinity;

  return {
    /** Remove all the vortices. Call this function from layout. */
    reset() {
      vortices = [];
      sinceShed = 0;
      pending = 0;
    },

    /** Set the x position after which the module removes a vortex. */
    setLimit(x) {
      limitX = x;
    },

    /**
     * Add the change in the bound circulation to the total. Shed one
     * vortex at the given edge point after the interval. A new vortex
     * starts at zero strength and increases. The induced field then
     * changes continuously.
     */
    shed(dt, gammaChange, edge) {
      pending -= gammaChange;
      sinceShed += dt;
      if (sinceShed < interval) return;
      sinceShed = 0;
      vortices.push({ x: edge.x, y: edge.y, gamma: pending, ramp: 0 });
      pending = 0;
      if (vortices.length > max) vortices.shift();
    },

    /**
     * Move each vortex with the freestream and with the induced velocity
     * that the caller gives through induce(out, x, y). Increase the
     * strength of each new vortex.
     */
    convect(dt, freestream, induce) {
      for (let i = 0; i < vortices.length; i++) {
        const w = vortices[i];
        w.ramp = Math.min(1, w.ramp + dt / ramp);
        const out = { u: freestream, v: 0 };
        induce(out, w.x, w.y);
        w.x += out.u * dt;
        w.y += out.v * dt;
      }
      vortices = vortices.filter((w) => w.x < limitX);
    },

    /**
     * Add the induced velocity of the wake at (x, y) to out. Do not use
     * a vortex that is farther than the cull radius, because it moves
     * the sample less than one pixel.
     */
    addTo(out, x, y) {
      for (let i = 0; i < vortices.length; i++) {
        const wx = x - vortices[i].x;
        const wy = y - vortices[i].y;
        if (wx * wx + wy * wy > cullRadius2) continue;
        addVortex(out, x, y, vortices[i].x, vortices[i].y,
          vortices[i].gamma * vortices[i].ramp, core2);
      }
    },

    /** Go through each vortex, for the drawing. */
    forEach(fn) {
      vortices.forEach(fn);
    },
  };
}
