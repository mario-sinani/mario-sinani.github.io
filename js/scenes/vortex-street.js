/* Scene: the Karman vortex street behind a cylinder, one of the two fields
   of the hero.

   The module sheds one vortex from each side in turn, convects them with
   the stream and with each other, and integrates the streamlines through
   the total field in each frame. The wave in the lines comes from the
   vortices, and is not a fixed oscillation.

   Two numbers come from the literature: St = f D / U sets the shedding
   frequency, and Karman puts h over a at 0.281. The street is shorter than
   a real one, to fit the canvas, but it keeps the ratio. The cylinder also
   moves at the shedding frequency, which is vortex-induced vibration. */

import { createFlowlines } from '../flowlines.js';
import { withAlpha } from '../ink.js';
import { addVortex, addDoublet, TWO_PI } from '../potential-flow.js';

const FREESTREAM = 42;          // px/s
const CONVECTION = 0.86;        // vortices travel slower than the stream
const SPACING = 0.21;           // vortex spacing a, as a fraction of width
const STAGGER = 0.281;          // Karman's stable ratio h / a
const STRENGTH = 1.9;           // circulation, in units of U * D
const CORE = 0.22;              // vortex core radius, in units of D
const MAX_VORTICES = 26;
const VIV_AMPLITUDE = 0.16;     // body travel, in units of D

export function createVortexStreet() {
  const flow = createFlowlines({ lines: 30, accentEvery: 6, step: 4, tracers: 0 });
  const body = { x: 0, y: 0, baseY: 0, r: 60 };
  const street = { spacing: 300, stagger: 84, period: 8, strength: 3000, core2: 2000 };
  let vortices = [];
  let width = 0;
  let height = 0;
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
    for (let i = 0; i < vortices.length; i++) {
      const v = vortices[i];
      const fade = v.ramp * Math.min(1, (width + 40 - v.x) / 150);
      if (fade <= 0) continue;
      ctx.beginPath();
      ctx.arc(v.x, v.y, body.r * 0.2, 0, TWO_PI);
      ctx.lineWidth = 1;
      ctx.strokeStyle = withAlpha(v.gamma > 0 ? ink.accent : ink.wash, 0.42 * fade);
      ctx.stroke();
    }
  }

  return {
    // A figure with lines. The engine clears it in each frame.
    fade: 1,

    layout(w, h) {
      width = w;
      height = h;
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

      vortices = [];
      sinceShed = street.period / 2;
      nextSide = 1;
      flow.layout(w, h);
    },

    frame(ctx, dt, t, ink) {
      move(t);
      shed(dt);
      convect(dt);
      flow.draw(ctx, dt, velocity, ink);
      drawCores(ctx, ink);
      drawBody(ctx, ink);
    },

    still(ctx, ink, t) {
      /* Make one street first, or the fixed frame shows an empty wake. */
      const at = t || 0;
      vortices = [];
      for (let k = MAX_VORTICES - 1; k >= 0; k--) {
        const side = k % 2 === 0 ? 1 : -1;
        vortices.push({
          x: body.x + body.r * 1.5 + k * street.spacing / 2,
          y: body.baseY + side * street.stagger / 2,
          gamma: side * street.strength,
          ramp: 1,
        });
      }
      move(at);
      flow.still(ctx, velocity, ink);
      drawCores(ctx, ink);
      drawBody(ctx, ink);
      return at;
    },
  };
}
