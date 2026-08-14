/* Scene: a wing section swept slowly through incidence, with the lift it
   generates drawn as it goes.

   Behind "Physics-Informed Data-Driven Modelling of Nonlinear Aerodynamic
   Forces of the Pazy Wing".

   Where the flutter scene oscillates fast and sheds a wake, this one moves
   quasi-steadily: the point is the force, not the unsteadiness. The lift
   curve bends over as incidence grows rather than running straight on,
   which is the nonlinearity a single linearized model cannot carry - and
   the inset traces that curve while a marker rides along it. */

import { createStreaklines } from '../streaklines.js';
import { TWO_PI, addVortex, addDoublet, segmentDistance2, chordDirection } from '../potential-flow.js';

const FREESTREAM = 105;         // px/s
const SWEEP_SECONDS = 17;       // period of the incidence sweep
const ALPHA_MAX = 0.42;         // radians
const STALL_BEND = 0.38;        // how far the lift curve falls below linear
const CORE2 = 240;

/** Normalised lift: linear near zero, bending over as incidence grows. */
function liftCoefficient(alpha) {
  const ratio = Math.abs(alpha) / ALPHA_MAX;
  return Math.sin(alpha) * (1 - STALL_BEND * ratio * ratio);
}

/* Every paper scene sits in this band down from the top of the hero: the
   panel below is vertically centred, so this strip stays clear of the
   words at every viewport height. */
const BAND = 0.14;

export function createIncidenceSweep() {
  const streaks = createStreaklines({ spacing: 7, max: 250, stall: 9, accentEvery: 17 });
  const section = { x: 0, y: 0, half: 60, thickness: 7, gain: 0, alpha: 0, gamma: 0 };
  const inset = { x: 0, y: 0, w: 0, h: 0 };

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

  /* Kutta-Joukowski: lift is proportional to circulation, and acts normal
     to the stream. Drawn from the quarter chord, upward for positive lift
     since screen y runs downward. */
  function drawLift(ctx, ink) {
    const root = quarterChord();
    const span = (section.gamma / section.gain) * section.half * 2.4;
    if (Math.abs(span) < 2) return;
    const tipY = root.y - span;
    const sign = Math.sign(span);
    ctx.beginPath();
    ctx.moveTo(root.x, root.y);
    ctx.lineTo(root.x, tipY);
    ctx.moveTo(root.x - 4, tipY + sign * 6);
    ctx.lineTo(root.x, tipY);
    ctx.lineTo(root.x + 4, tipY + sign * 6);
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = ink.accent;
    ctx.stroke();
  }

  /* The lift curve itself, with a marker at the current incidence. */
  function drawInset(ctx, ink) {
    if (inset.w <= 0) return;
    const midY = inset.y + inset.h / 2;

    ctx.beginPath();
    ctx.moveTo(inset.x, midY);
    ctx.lineTo(inset.x + inset.w, midY);
    ctx.moveTo(inset.x + inset.w / 2, inset.y);
    ctx.lineTo(inset.x + inset.w / 2, inset.y + inset.h);
    ctx.lineWidth = 1;
    ctx.strokeStyle = ink.faint;
    ctx.stroke();

    ctx.beginPath();
    for (let i = 0; i <= 40; i++) {
      const a = -ALPHA_MAX + (2 * ALPHA_MAX * i) / 40;
      const px = inset.x + inset.w * (0.5 + a / (2 * ALPHA_MAX));
      const py = midY - (inset.h / 2) * (liftCoefficient(a) / liftCoefficient(ALPHA_MAX));
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = ink.line;
    ctx.stroke();

    const mx = inset.x + inset.w * (0.5 + section.alpha / (2 * ALPHA_MAX));
    const my = midY - (inset.h / 2) * (liftCoefficient(section.alpha) / liftCoefficient(ALPHA_MAX));
    ctx.beginPath();
    ctx.arc(mx, my, 2.6, 0, TWO_PI);
    ctx.fillStyle = ink.accent;
    ctx.fill();
  }

  return {
    fade: 0.05,

    layout(w, h) {
      const chord = Math.min(w * 0.19, h * 0.32);
      section.half = chord / 2;
      section.thickness = Math.max(chord * 0.055, 4);
      section.gain = Math.PI * chord * FREESTREAM;
      section.x = w * 0.28;
      section.y = h * BAND;

      // Tucked into the far right of the same clear band, and dropped
      // entirely when the canvas is too narrow to hold it without noise.
      const room = w > 760;
      inset.w = room ? Math.min(w * 0.11, 150) : 0;
      inset.h = inset.w * 0.62;
      inset.x = w * 0.8;
      inset.y = h * BAND - inset.h / 2;

      streaks.layout(w, h);
      move(0);
    },

    frame(ctx, dt, t, ink) {
      move(t);
      streaks.draw(ctx, dt, velocity, ink);
      drawSection(ctx, ink);
      drawLift(ctx, ink);
      drawInset(ctx, ink);
    },

    still(ctx, ink, t) {
      move(t || SWEEP_SECONDS * 0.25);
      streaks.still(ctx, velocity, ink, 24);
      drawSection(ctx, ink);
      drawLift(ctx, ink);
      drawInset(ctx, ink);
    },
  };
}
