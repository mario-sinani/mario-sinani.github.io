/* Scene: a wing section that moves slowly through a range of
   incidence. The scene draws the load during the motion.

   Background for "Physics-Informed Data-Driven Modelling of Nonlinear
   Aerodynamic Forces of the Pazy Wing".

   The motion is quasi-steady, because the subject is the force and not
   the unsteadiness. The comb of arrows on the chord is the thin-aerofoil
   load, proportional to sqrt((1-x)/x), and the arrow at the quarter
   chord is the resultant. In the inset, the distance from the dashed
   linear prediction to the curve is the nonlinearity the paper
   models. */

import { createFlowlines } from '../flowlines.js';
import { withAlpha } from '../ink.js';
import { TWO_PI, addVortex, addDoublet, segmentDistance2, chordDirection } from '../potential-flow.js';
import { stageFor, drawDatum } from './stage.js';

const FREESTREAM = 105;         // px/s
const SWEEP_SECONDS = 17;       // period of the incidence sweep
const ALPHA_MAX = 0.42;         // radians
const CORE2 = 240;
const COMB = 13;                // arrows in the load distribution

/* The lift curve comes from the Kirchhoff model, which is the model
   that unsteady aerodynamics uses for a section with trailing-edge
   separation:

     Cl = 2*pi * sin(alpha) * ((1 + sqrt(f)) / 2)^2

   f is the point on the chord where the flow leaves the surface. It is
   1 for flow that stays on the section, and it falls to almost 0 in
   deep stall. ALPHA_1 is the angle of static stall, where f = 0.7. S1
   and S2 set how fast f falls on each side of that angle. */
const CL_ALPHA = 2 * Math.PI;   // lift curve slope per radian
const ALPHA_1 = 0.24;           // radians; static stall
const S1 = 0.06;
const S2 = 0.045;

/** The separation point, from 1 on the section to 0.04 in deep stall. */
function separation(alpha) {
  const a = Math.abs(alpha);
  return a <= ALPHA_1
    ? 1 - 0.3 * Math.exp((a - ALPHA_1) / S1)
    : 0.04 + 0.66 * Math.exp((ALPHA_1 - a) / S2);
}

/** The lift coefficient of the section. */
function liftCoefficient(alpha) {
  const q = (1 + Math.sqrt(separation(alpha))) / 2;
  return CL_ALPHA * Math.sin(alpha) * q * q;
}

/** The lift with no separation: the straight line the paper models the
    departure from. */
function linearLift(alpha) {
  return CL_ALPHA * Math.sin(alpha);
}

/* The largest lift the section makes, and the largest lift the straight
   line gives in the range. The drawings use them as their scales. */
const CL_PEAK = (() => {
  let best = 0;
  for (let i = 0; i <= 400; i++) best = Math.max(best, liftCoefficient((i / 400) * ALPHA_MAX));
  return best;
})();
const CL_LINEAR_MAX = linearLift(ALPHA_MAX);

/** The load along the chord from thin-aerofoil theory. It is largest
    at the leading edge. */
function loading(xi) {
  const x = Math.min(Math.max(xi, 0.02), 0.995);
  return Math.sqrt((1 - x) / x);
}

export function createIncidenceSweep() {
  const flow = createFlowlines({ lines: 21, accentEvery: 5, tracers: 28 });
  const section = { x: 0, y: 0, half: 60, thickness: 7, gain: 0, alpha: 0, gamma: 0 };
  const inset = { x: 0, y: 0, w: 0, h: 0 };
  let stage = null;
  /* The lab can hold the incidence at one value. The value null means
     that the sweep runs. */
  let held = null;

  function move(t) {
    section.alpha = held !== null ? held
      : ALPHA_MAX * Math.sin((TWO_PI * t) / SWEEP_SECONDS);
    section.gamma = section.gain * liftCoefficient(section.alpha);
  }

  function quarterChord() {
    const dir = chordDirection(section.alpha);
    const offset = -section.half * 0.5;
    return { x: section.x + offset * dir.x, y: section.y + offset * dir.y };
  }

  function velocity(x, y) {
    const dir = chordDirection(section.alpha);
    if (segmentDistance2(x, y, section.x, section.y, dir.x, dir.y, section.half)
        <= section.thickness * section.thickness) return null;
    const out = { u: FREESTREAM, v: 0 };
    addDoublet(out, x, y, section.x, section.y, section.thickness * 2, FREESTREAM);
    const bound = quarterChord();
    addVortex(out, x, y, bound.x, bound.y, section.gamma, CORE2);
    return out;
  }

  function drawSection(ctx, ink) {
    ctx.beginPath();
    ctx.ellipse(section.x, section.y, section.half, section.thickness, -section.alpha, 0, TWO_PI);
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = ink.body;
    ctx.stroke();
  }

  /* Draw the load along the chord, normal to the chord. The comb goes
     to zero at zero incidence, and it changes side with the sign. */
  function drawLoading(ctx, ink) {
    const cl = liftCoefficient(section.alpha) / CL_PEAK;
    // Fade in with the load, because the comb must not appear
    // suddenly at a threshold.
    const presence = Math.min(1, Math.max(0, (Math.abs(cl) - 0.02) / 0.12));
    if (presence <= 0) return;
    const dir = chordDirection(section.alpha);
    // Normal to the chord, in the direction of a positive lift.
    const nx = dir.y;
    const ny = -dir.x;
    const scale = section.half * 0.95 * cl;

    ctx.beginPath();
    for (let i = 0; i < COMB; i++) {
      const xi = (i + 0.5) / COMB;
      const along = (xi - 0.5) * 2 * section.half;
      const bx = section.x + along * dir.x;
      const by = section.y + along * dir.y;
      const len = loading(xi) * scale * 0.42;
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + nx * len, by + ny * len);
    }
    ctx.lineWidth = 1;
    // The comb is an element of the field, and it uses the wash. The
    // resultant keeps the full accent.
    ctx.strokeStyle = withAlpha(ink.wash, 0.55 * presence);
    ctx.stroke();

    // The curve through the ends of the arrows: the distribution.
    ctx.beginPath();
    for (let i = 0; i <= COMB; i++) {
      const xi = i / COMB;
      const along = (xi - 0.5) * 2 * section.half;
      const len = loading(xi) * scale * 0.42;
      const px = section.x + along * dir.x + nx * len;
      const py = section.y + along * dir.y + ny * len;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.lineWidth = 1;
    ctx.strokeStyle = withAlpha(ink.wash, 0.85 * presence);
    ctx.stroke();
  }

  /* The Kutta-Joukowski theorem: the lift is proportional to the
     circulation, and it acts at the quarter chord. The screen y axis
     points down, and a positive lift points up the page. */
  function drawResultant(ctx, ink) {
    const root = quarterChord();
    const span = (liftCoefficient(section.alpha) / CL_PEAK) * section.half * 2.2;
    const presence = Math.min(1, Math.max(0, (Math.abs(span) - 1) / 9));
    if (presence <= 0) return;
    const tipY = root.y - span;
    const sign = Math.sign(span);
    ctx.beginPath();
    ctx.moveTo(root.x, root.y);
    ctx.lineTo(root.x, tipY);
    ctx.moveTo(root.x - 4, tipY + sign * 6);
    ctx.lineTo(root.x, tipY);
    ctx.lineTo(root.x + 4, tipY + sign * 6);
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = withAlpha(ink.accent, 0.85 * presence);
    ctx.stroke();
  }

  /* The inset: the lift curve, the linear line, and a marker at the
     incidence at this moment. */
  function drawInset(ctx, ink) {
    if (inset.w <= 0) return;
    const midY = inset.y + inset.h / 2;
    const half = inset.h / 2;
    /* Both curves use one scale: the largest lift the straight line
       gives in the range. The true curve then sits well below that
       line, and the gap is the nonlinearity the paper models. */
    const toX = (a) => inset.x + inset.w * (0.5 + a / (2 * ALPHA_MAX));
    const toY = (cl) => midY - half * 0.94 * (cl / CL_LINEAR_MAX);

    // The datum has the horizontal axis through midY.
    ctx.beginPath();
    ctx.moveTo(inset.x + inset.w / 2, inset.y);
    ctx.lineTo(inset.x + inset.w / 2, inset.y + inset.h);
    ctx.lineWidth = 1;
    ctx.strokeStyle = ink.faint;
    ctx.stroke();

    // The lift with no separation: a straight line through zero.
    ctx.beginPath();
    ctx.setLineDash([3, 3]);
    ctx.moveTo(toX(-ALPHA_MAX), toY(-CL_LINEAR_MAX));
    ctx.lineTo(toX(ALPHA_MAX), toY(CL_LINEAR_MAX));
    ctx.lineWidth = 1;
    ctx.strokeStyle = withAlpha(ink.line, 0.5);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.beginPath();
    for (let i = 0; i <= 48; i++) {
      const a = -ALPHA_MAX + (2 * ALPHA_MAX * i) / 48;
      const px = toX(a);
      const py = toY(liftCoefficient(a));
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = ink.body;
    ctx.stroke();

    const mx = toX(section.alpha);
    const my = toY(liftCoefficient(section.alpha));
    ctx.beginPath();
    ctx.moveTo(mx, midY);
    ctx.lineTo(mx, my);
    ctx.lineWidth = 1;
    ctx.strokeStyle = withAlpha(ink.accent, 0.4);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(mx, my, 2.8, 0, TWO_PI);
    ctx.fillStyle = ink.accent;
    ctx.fill();
  }

  return {
    // A figure with lines. The engine clears it completely in each
    // frame.
    fade: 1,

    /* The control of this scene on the lab page. */
    lab: {
      label: 'Angle of attack',
      unit: '\u00b0',
      min: -24,
      max: 24,
      step: 0.5,
      value: () => (section.alpha * 180) / Math.PI,
      set(v) { held = (v * Math.PI) / 180; },
      release() { held = null; },
    },

    layout(w, h) {
      const chord = Math.min(w * 0.19, h * 0.32);
      section.half = chord / 2;
      section.thickness = Math.max(chord * 0.055, 4);
      // Kutta-Joukowski: Gamma = 0.5 * Cl * U * chord.
      section.gain = 0.5 * chord * FREESTREAM;
      stage = stageFor(w, h);
      section.x = stage.left + stage.width * 0.22;
      section.y = stage.y;

      // The inset is on the right of the stage. The scene removes it
      // if the canvas is too narrow.
      const room = w > 760;
      inset.w = room ? Math.min(stage.width * 0.15, 150) : 0;
      inset.h = inset.w * 0.62;
      inset.x = stage.right - inset.w;
      inset.y = stage.y - inset.h / 2;

      flow.layout(w, h);
      move(0);
    },

    frame(ctx, dt, t, ink) {
      move(t);
      flow.draw(ctx, dt, velocity, ink);
      drawDatum(ctx, stage, ink);
      drawLoading(ctx, ink);
      drawSection(ctx, ink);
      drawResultant(ctx, ink);
      drawInset(ctx, ink);
    },

    still(ctx, ink, t) {
      move(t || SWEEP_SECONDS * 0.2);
      flow.still(ctx, velocity, ink);
      drawDatum(ctx, stage, ink);
      drawLoading(ctx, ink);
      drawSection(ctx, ink);
      drawResultant(ctx, ink);
      drawInset(ctx, ink);
    },
  };
}
