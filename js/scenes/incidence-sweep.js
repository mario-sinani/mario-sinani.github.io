/* Scene: a wing section swept slowly through incidence, with the load it
   carries drawn as it goes.

   Behind "Physics-Informed Data-Driven Modelling of Nonlinear Aerodynamic
   Forces of the Pazy Wing".

   Where the flutter scene oscillates fast and sheds a wake, this one moves
   quasi-steadily: the point is the force, not the unsteadiness.

   The comb of arrows along the chord is the load distribution thin
   aerofoil theory gives - proportional to sqrt((1-x)/x), so it piles up at
   the leading edge and runs out to nothing at the trailing edge - and its
   total is the arrow at the quarter chord, where that resultant acts. The
   inset plots that total against incidence: the straight dashed line is
   what a single linearized model would predict, and the curve bending away
   from it is the nonlinearity this paper is about. */

import { createFlowlines } from '../flowlines.js';
import { withAlpha } from '../ink.js';
import { TWO_PI, addVortex, addDoublet, segmentDistance2, chordDirection } from '../potential-flow.js';
import { stageFor, drawDatum } from './stage.js';

const FREESTREAM = 105;         // px/s
const SWEEP_SECONDS = 17;       // period of the incidence sweep
const ALPHA_MAX = 0.42;         // radians
const STALL_BEND = 0.38;        // how far the lift curve falls below linear
const CORE2 = 240;
const COMB = 13;                // arrows in the load distribution

/** Normalised lift: linear near zero, bending over as incidence grows. */
function liftCoefficient(alpha) {
  const ratio = Math.abs(alpha) / ALPHA_MAX;
  return Math.sin(alpha) * (1 - STALL_BEND * ratio * ratio);
}

/** Thin-aerofoil chordwise loading, strongest at the leading edge. */
function loading(xi) {
  const x = Math.min(Math.max(xi, 0.02), 0.995);
  return Math.sqrt((1 - x) / x);
}

export function createIncidenceSweep() {
  const flow = createFlowlines({ lines: 21, accentEvery: 5, tracers: 28 });
  const section = { x: 0, y: 0, half: 60, thickness: 7, gain: 0, alpha: 0, gamma: 0 };
  const inset = { x: 0, y: 0, w: 0, h: 0 };
  let stage = null;

  function move(t) {
    section.alpha = ALPHA_MAX * Math.sin((TWO_PI * t) / SWEEP_SECONDS);
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

  /* The load along the chord, drawn normal to it. The comb collapses as
     the section passes through zero incidence and flips with it. */
  function drawLoading(ctx, ink) {
    const cl = liftCoefficient(section.alpha) / liftCoefficient(ALPHA_MAX);
    // Eased in with the load itself, so the comb never pops at a threshold.
    const presence = Math.min(1, Math.max(0, (Math.abs(cl) - 0.02) / 0.12));
    if (presence <= 0) return;
    const dir = chordDirection(section.alpha);
    // Normal to the chord, pointing the way positive lift acts.
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
    // The comb belongs to the field, so it takes the field's wash; the
    // resultant it sums to keeps the full accent.
    ctx.strokeStyle = withAlpha(ink.wash, 0.55 * presence);
    ctx.stroke();

    // The curve joining their tips, which is the distribution itself.
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

  /* Kutta-Joukowski: lift is proportional to circulation, and acts normal
     to the stream at the quarter chord. Screen y runs downward, so
     positive lift points up the page. */
  function drawResultant(ctx, ink) {
    const root = quarterChord();
    const span = (section.gamma / section.gain) * section.half * 2.4;
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

  /* The lift curve, the straight line a linearized model would use in its
     place, and a marker at the incidence currently being flown. */
  function drawInset(ctx, ink) {
    if (inset.w <= 0) return;
    const midY = inset.y + inset.h / 2;
    const half = inset.h / 2;
    const peak = liftCoefficient(ALPHA_MAX);
    const toX = (a) => inset.x + inset.w * (0.5 + a / (2 * ALPHA_MAX));
    const toY = (cl) => midY - half * (cl / peak);

    // The datum already carries the horizontal axis through midY.
    ctx.beginPath();
    ctx.moveTo(inset.x + inset.w / 2, inset.y);
    ctx.lineTo(inset.x + inset.w / 2, inset.y + inset.h);
    ctx.lineWidth = 1;
    ctx.strokeStyle = ink.faint;
    ctx.stroke();

    // What a model linearized about zero incidence would predict.
    const slope = 1 / ALPHA_MAX;
    ctx.beginPath();
    ctx.setLineDash([3, 3]);
    ctx.moveTo(toX(-ALPHA_MAX), toY(-slope * ALPHA_MAX * peak));
    ctx.lineTo(toX(ALPHA_MAX), toY(slope * ALPHA_MAX * peak));
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
    // A drawn figure, redrawn whole each frame: nothing smears or tints.
    fade: 1,

    layout(w, h) {
      const chord = Math.min(w * 0.19, h * 0.32);
      section.half = chord / 2;
      section.thickness = Math.max(chord * 0.055, 4);
      section.gain = Math.PI * chord * FREESTREAM;
      stage = stageFor(w, h);
      section.x = stage.left + stage.width * 0.22;
      section.y = stage.y;

      // Right-aligned on the stage, and dropped entirely when the canvas
      // is too narrow to hold it without noise.
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
