/* Scene: a wing section with a hinged outboard piece, free to rotate about
   the hinge while the inboard part holds its incidence.

   Behind "Absolute Nodal Coordinate Formulation for Nonlinear Multibody
   Modeling of Flared Hinged Wings".

   Two bodies joined by a revolute joint is the smallest multibody system
   that still behaves like the real thing: the hinge angle is a degree of
   freedom of its own, so the outboard piece chases the local flow instead
   of following the wing, and each carries its own bound circulation. The
   beat between two nearby frequencies stands for the coupling between the
   wing's motion and the hinge's.

   Over the flow, the drawing says what a multibody sketch says. The dashed
   line through the joint is the hinge axis, set at its flare angle rather
   than square to the chord - which is what makes the fold change the
   outboard incidence at all. The arc is the current hinge angle, measured
   from the inboard piece and not from the ground. And the trace at the
   right is that one angle over time: the whole state of the joint, which
   is what a multibody solver is actually integrating. */

import { createStreaklines } from '../streaklines.js';
import { withAlpha } from '../ink.js';
import { TWO_PI, addVortex, addDoublet, segmentDistance2, chordDirection } from '../potential-flow.js';

const FREESTREAM = 100;         // px/s
const WING_HZ = 0.075;
const HINGE_HZ = 0.115;         // deliberately close, so the two beat
const WING_INCIDENCE = 0.16;    // radians
const HINGE_TRAVEL = 0.5;       // radians of fold, peak to zero
const FLARE = 0.55;             // radians the hinge axis is swept back by
const CORE2 = 240;
/* Sampled on a clock rather than per frame, and kept for just over one
   beat of the hinge, so the trace does not depend on the refresh rate. */
const TRACE_SECONDS = 1.05 / HINGE_HZ;
const TRACE_STEP = 0.05;

/* Every paper scene sits in this band down from the top of the hero: the
   panel below is vertically centred, so this strip stays clear of the
   words at every viewport height. */
const BAND = 0.14;

export function createHingedWingtip() {
  const streaks = createStreaklines({ spacing: 7, max: 250, stall: 9, accentEvery: 17 });
  const inboard = { x: 0, y: 0, half: 40, thickness: 6, gain: 0, alpha: 0, gamma: 0 };
  const outboard = { x: 0, y: 0, half: 26, thickness: 5, gain: 0, alpha: 0, gamma: 0 };
  const hinge = { x: 0, y: 0, fold: 0 };
  const trace = { x: 0, y: 0, w: 0, h: 0 };
  let history = [];
  let lastSample = -99;

  function move(t) {
    inboard.alpha = WING_INCIDENCE * Math.sin(TWO_PI * WING_HZ * t);

    // The hinge is a free degree of freedom: its angle is measured from the
    // inboard piece, not from the flow, so the outboard incidence is the
    // sum of the two.
    hinge.fold = HINGE_TRAVEL * Math.sin(TWO_PI * HINGE_HZ * t);
    outboard.alpha = inboard.alpha + hinge.fold;

    const dirIn = chordDirection(inboard.alpha);
    hinge.x = inboard.x + inboard.half * dirIn.x;
    hinge.y = inboard.y + inboard.half * dirIn.y;

    const dirOut = chordDirection(outboard.alpha);
    outboard.x = hinge.x + outboard.half * dirOut.x;
    outboard.y = hinge.y + outboard.half * dirOut.y;

    inboard.gamma = inboard.gain * Math.sin(inboard.alpha);
    outboard.gamma = outboard.gain * Math.sin(outboard.alpha);
  }

  function quarterOf(part) {
    const dir = chordDirection(part.alpha);
    const offset = -part.half * 0.5;
    return { x: part.x + offset * dir.x, y: part.y + offset * dir.y };
  }

  function inside(part, x, y) {
    const dir = chordDirection(part.alpha);
    return segmentDistance2(x, y, part.x, part.y, dir.x, dir.y, part.half)
      <= part.thickness * part.thickness;
  }

  function velocity(x, y) {
    if (inside(inboard, x, y) || inside(outboard, x, y)) return null;
    const out = { u: FREESTREAM, v: 0 };
    addDoublet(out, x, y, inboard.x, inboard.y, inboard.thickness * 2, FREESTREAM);
    const a = quarterOf(inboard);
    const b = quarterOf(outboard);
    addVortex(out, x, y, a.x, a.y, inboard.gamma, CORE2);
    addVortex(out, x, y, b.x, b.y, outboard.gamma, CORE2);
    return out;
  }

  function drawPart(ctx, part, ink) {
    ctx.beginPath();
    ctx.ellipse(part.x, part.y, part.half, part.thickness, -part.alpha, 0, TWO_PI);
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = ink.body;
    ctx.stroke();
  }

  /** The axis the outboard piece turns about, swept back by its flare. */
  function drawAxis(ctx, ink) {
    const reach = inboard.half * 1.1;
    const ax = Math.cos(-FLARE - inboard.alpha);
    const ay = Math.sin(-FLARE - inboard.alpha);
    ctx.beginPath();
    ctx.setLineDash([3, 4]);
    ctx.moveTo(hinge.x - ax * reach, hinge.y - ay * reach);
    ctx.lineTo(hinge.x + ax * reach, hinge.y + ay * reach);
    ctx.lineWidth = 1;
    ctx.strokeStyle = ink.faint;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  /** The joint, and the angle currently held across it. */
  function drawHinge(ctx, ink) {
    if (Math.abs(hinge.fold) > 0.02) {
      const r = outboard.half * 0.8;
      const from = -inboard.alpha;
      const to = -outboard.alpha;
      ctx.beginPath();
      ctx.arc(hinge.x, hinge.y, r, Math.min(from, to), Math.max(from, to));
      ctx.lineWidth = 1.1;
      ctx.strokeStyle = withAlpha(ink.accent, 0.6);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(hinge.x, hinge.y, 3.4, 0, TWO_PI);
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = ink.accent;
    ctx.stroke();
  }

  /** The hinge angle over time: the joint's whole state, scrolling away. */
  function drawTrace(ctx, ink) {
    if (trace.w <= 0 || history.length < 3) return;
    const steps = Math.round(TRACE_SECONDS / TRACE_STEP);
    const midY = trace.y + trace.h / 2;

    ctx.beginPath();
    ctx.moveTo(trace.x, midY);
    ctx.lineTo(trace.x + trace.w, midY);
    ctx.lineWidth = 1;
    ctx.strokeStyle = ink.faint;
    ctx.stroke();

    ctx.beginPath();
    for (let i = 0; i < history.length; i++) {
      const px = trace.x + (i / (steps - 1)) * trace.w;
      const py = midY - (history[i] / HINGE_TRAVEL) * (trace.h / 2) * 0.9;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.lineWidth = 1.1;
    ctx.strokeStyle = withAlpha(ink.line, 0.7);
    ctx.stroke();

    const lastX = trace.x + ((history.length - 1) / (steps - 1)) * trace.w;
    const lastY = midY - (history[history.length - 1] / HINGE_TRAVEL) * (trace.h / 2) * 0.9;
    ctx.beginPath();
    ctx.arc(lastX, lastY, 2.6, 0, TWO_PI);
    ctx.fillStyle = ink.accent;
    ctx.fill();
  }

  return {
    fade: 0.05,

    layout(w, h) {
      const chord = Math.min(w * 0.2, h * 0.34);
      inboard.half = chord * 0.32;
      inboard.thickness = Math.max(chord * 0.05, 4);
      inboard.gain = Math.PI * inboard.half * 2 * FREESTREAM;
      outboard.half = chord * 0.2;
      outboard.thickness = Math.max(chord * 0.042, 3.5);
      outboard.gain = Math.PI * outboard.half * 2 * FREESTREAM;
      inboard.x = w * 0.26;
      inboard.y = h * BAND;

      const room = w > 760;
      trace.w = room ? Math.min(w * 0.13, 175) : 0;
      trace.h = Math.max(h * 0.055, 34);
      trace.x = w * 0.78;
      trace.y = h * BAND - trace.h / 2;

      history = [];
      lastSample = -99;
      streaks.layout(w, h);
      move(0);
    },

    frame(ctx, dt, t, ink) {
      move(t);
      if (t - lastSample >= TRACE_STEP) {
        lastSample = t;
        history.push(hinge.fold);
        while (history.length > TRACE_SECONDS / TRACE_STEP) history.shift();
      }

      streaks.draw(ctx, dt, velocity, ink);
      drawAxis(ctx, ink);
      drawPart(ctx, inboard, ink);
      drawPart(ctx, outboard, ink);
      drawHinge(ctx, ink);
      drawTrace(ctx, ink);
    },

    still(ctx, ink, t) {
      const at = t || 3.4;
      move(at);
      history = [];
      const steps = Math.round(TRACE_SECONDS / TRACE_STEP);
      for (let k = steps - 1; k >= 0; k--) {
        history.push(HINGE_TRAVEL * Math.sin(TWO_PI * HINGE_HZ * (at - k * TRACE_STEP)));
      }
      streaks.still(ctx, velocity, ink, 24);
      drawAxis(ctx, ink);
      drawPart(ctx, inboard, ink);
      drawPart(ctx, outboard, ink);
      drawHinge(ctx, ink);
      drawTrace(ctx, ink);
    },
  };
}
