/* Vortex wake: the vortices a lifting body sheds from its trailing edge.

   This module owns the wake state and its physics. It banks the change in
   bound circulation, sheds that change as discrete vortices, ramps each
   new vortex to full strength, convects the wake downstream, and adds the
   wake's induced velocity to a field sample. The scene that owns the body
   decides how to draw the wake.

   Kelvin's theorem sets the shed strength: the wake receives the opposite
   of what the bound circulation gains. */

import { addVortex } from './potential-flow.js';

/**
 * options.interval    seconds between shed vortices
 * options.ramp        seconds a new vortex takes to reach full strength
 * options.max         maximum number of vortices kept
 * options.core2       squared core radius for the induced velocity
 * options.cullRadius2 squared distance beyond which a vortex adds nothing
 */
export function createVortexWake(options) {
  const { interval, ramp, max, core2, cullRadius2 } = options;
  let vortices = [];
  let sinceShed = 0;
  let pending = 0;
  let limitX = Infinity;

  return {
    /** Empty the wake. Call from layout. */
    reset() {
      vortices = [];
      sinceShed = 0;
      pending = 0;
    },

    /** Set the x position past which a vortex is removed. */
    setLimit(x) {
      limitX = x;
    },

    /**
     * Bank the change in bound circulation. Shed one vortex at the given
     * edge point when the shed interval has passed. A new vortex starts
     * at zero effective strength and ramps in, so the induced field
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
     * Move each vortex with the freestream plus the induced velocity the
     * caller supplies through induce(out, x, y). Advance each ramp.
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
     * Add the wake's induced velocity at (x, y) to out. Skip vortices
     * beyond the cull radius: their contribution is below one pixel.
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

    /** Visit each vortex, for drawing. */
    forEach(fn) {
      vortices.forEach(fn);
    },
  };
}
