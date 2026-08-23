/* Model: the Karman vortex street behind a circular cylinder.

   The scene of the same name draws it. The model sheds one vortex from
   each side in turn, and convects them with the stream and with each
   other. It gives the velocity of the total field at a point, which the
   scene integrates into streamlines. The cylinder itself moves
   across the stream at the shedding frequency, which is vortex-induced
   vibration.

   Two numbers come from the literature: St = f D / U sets the shedding
   frequency, and Karman puts h over a at 0.281. */

import { addVortex, addDoublet } from '../potential-flow.js';

const TWO_PI = 6.2832;
export const FREESTREAM = 42;   // px/s
export const CONVECTION = 0.86;        // vortices travel slower than the stream
export const SPACING = 0.21;    // vortex spacing a, as a fraction of width
export const STAGGER = 0.281;   // Karman's stable ratio h / a
export const STRENGTH = 1.9;    // circulation, in units of U * D
export const CORE = 0.22;       // vortex core radius, in units of D
const MAX_VORTICES = 26;
const VIV_AMPLITUDE = 0.16;     // body travel, in units of D

/* The scene gives the body and the street it laid out, in pixels. The
   model reads them and never writes to them, except for the height of
   the body, which the vibration sets. */
export function createVortexStreetModel(body, street) {
  let vortices = [];
  let width = 0;
  let sinceShed = 0;
  let nextSide = 1;

  /** Add the induced velocity of the wake at a point. */
  function addWake(out, x, y) {
    for (let i = 0; i < vortices.length; i++) {
      const v = vortices[i];
      addVortex(out, x, y, v.x, v.y, v.gamma * v.ramp, street.core2);
    }
  }

  function velocity(x, y) {
    const dx = x - body.x;
    const dy = y - body.y;
    if (dx * dx + dy * dy < body.r * body.r * 1.02) return null;
    const out = { u: FREESTREAM, v: 0 };
    addDoublet(out, x, y, body.x, body.y, body.r, FREESTREAM);
    addWake(out, x, y);
    return out;
  }

  /* One vortex leaves each side in turn. The upper row turns clockwise on
     the screen, the lower row the other way, which gives the wake its
     velocity deficit. */
  function shed(dt) {
    sinceShed += dt;
    if (sinceShed < street.period / 2) return;
    sinceShed = 0;
    vortices.push({
      x: body.x + body.r * 1.5,
      y: body.y + nextSide * street.stagger / 2,
      gamma: nextSide * street.strength,
      ramp: 0,
    });
    nextSide = -nextSide;
    if (vortices.length > MAX_VORTICES) vortices.shift();
  }

  /* Each vortex moves with the stream and with the field of the others.
     Their mutual induction keeps the stagger. */
  function convect(dt) {
    const moved = vortices.map((v) => {
      const out = { u: FREESTREAM * CONVECTION, v: 0 };
      for (let i = 0; i < vortices.length; i++) {
        const other = vortices[i];
        if (other === v) continue;
        addVortex(out, v.x, v.y, other.x, other.y, other.gamma * other.ramp, street.core2);
      }
      return out;
    });
    for (let i = 0; i < vortices.length; i++) {
      vortices[i].ramp = Math.min(1, vortices[i].ramp + dt / (street.period * 0.25));
      vortices[i].x += moved[i].u * dt;
      vortices[i].y += moved[i].v * dt;
    }
    vortices = vortices.filter((v) => v.x < width + street.spacing);
  }

  /* Vortex-induced vibration: the shedding moves the cylinder across the
     stream, at the shedding frequency. */
  function move(t) {
    body.y = body.baseY
      + Math.sin((TWO_PI * t) / street.period) * VIV_AMPLITUDE * body.r * 2;
  }

  return {
    /** The vortices of the wake, for the drawing of their cores. */
    each(fn) { vortices.forEach(fn); },
    get count() { return vortices.length; },
    velocity,
    /* One step, in the order the scene needs: the body moves, then it
       sheds, then the wake convects. */
    advance(dt, t) {
      move(t);
      shed(dt);
      convect(dt);
    },
    /** The width of the box, which sets where a vortex leaves it. */
    setWidth(w) { width = w; },
    reset() {
      vortices = [];
      sinceShed = street.period / 2;
      nextSide = 1;
    },
    /* One street at once, for a fixed frame: an empty wake would show
       nothing of what the scene is about. */
    fillWake(at) {
      vortices = [];
      for (let k = MAX_VORTICES - 1; k >= 0; k--) {
        const side = k % 2 === 0 ? 1 : -1;
        vortices.push({
          x: body.x + body.r * 1.5 + (k * street.spacing) / 2,
          y: body.baseY + (side * street.stagger) / 2,
          gamma: side * street.strength,
          ramp: 1,
        });
      }
      move(at);
    },
  };
}
