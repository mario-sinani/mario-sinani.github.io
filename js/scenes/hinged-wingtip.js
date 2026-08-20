/* Scene: a wing section with a hinged outboard piece. The hinge is
   free, and the inboard part keeps its incidence.

   Background for "Absolute Nodal Coordinate Formulation for Nonlinear
   Multibody Modeling of Flared Hinged Wings".

   Two bodies and one revolute joint make the smallest multibody system.
   The hinge angle is its own degree of freedom: the scene integrates it,
   and it is not a prescribed motion. The wing sweeps through incidence,
   the flow turns the tip, and the tip finds its own angle.

   Over the flow: the hinge axis at its flare angle, the arc of the hinge
   angle, and the trace of that angle, which is the joint state a solver
   integrates. The flare is the reason a fold changes the outboard
   incidence. */

import { createFlowlines } from '../flowlines.js';
import { withAlpha } from '../ink.js';
import { TWO_PI, addVortex, addDoublet, segmentDistance2, chordDirection } from '../potential-flow.js';
import { stageFor, drawDatum } from './stage.js';

const FREESTREAM = 100;         // px/s
const WING_HZ = 0.075;
const WING_INCIDENCE = 0.16;    // radians
const HINGE_TRAVEL = 0.5;       // radians; the stops of the joint
const FLARE = 0.55;             // radians the hinge axis is swept back by

/* The hinge is free. It carries no prescribed motion: the flow turns
   the tip, and the tip finds its own angle.

   A fold turns the tip about the hinge axis. Only the part of that turn
   across the flow changes the incidence of the tip, and that part is
   sin(FLARE) of the fold. A fold up therefore takes incidence off the
   tip, which takes lift off it, which is the reason a flared hinge
   relieves the load of a gust. With no flare a fold is a pure flap, the
   incidence does not change, and nothing stops the fold: the tip goes
   to its stop and stays there.

   The angle of the joint follows

     d2/dt2 + 2*Z*W*(d/dt) + (LOAD*sin(FLARE) + SPRING)*fold
       = LOAD * (incidence of the wing)

   The stiffness of the joint is the sum of a small structural spring
   and the term from the flow. The flow term grows with the flare, so
   more flare gives a smaller fold and a faster answer. */
const HINGE_LOAD = 1.6;         // 1/s^2 per radian of incidence
const HINGE_SPRING = 0.35;      // 1/s^2 from the structure alone
const HINGE_DAMPING = 0.15;     // fraction of critical
const CORE2 = 240;
/* Sample the trace with a clock, and keep a little more than one beat
   of the hinge. The trace then does not change with the refresh
   rate. */
const TRACE_SECONDS = 14;       // seconds of joint angle kept on the trace
const TRACE_STEP = 0.05;

export function createHingedWingtip() {
  const flow = createFlowlines({ lines: 21, accentEvery: 5, tracers: 28 });
  const inboard = { x: 0, y: 0, half: 40, thickness: 6, gain: 0, alpha: 0, gamma: 0 };
  const outboard = { x: 0, y: 0, half: 26, thickness: 5, gain: 0, alpha: 0, gamma: 0 };
  const hinge = { x: 0, y: 0, fold: 0 };
  const trace = { x: 0, y: 0, w: 0, h: 0 };
  let stage = null;
  let history = [];
  let lastSample = -99;
  /* The lab can hold the flare at one angle. The value null means that
     the constant applies. */
  let held = null;
  /* The state of the joint: the angle and its rate. */
  let fold = 0;
  let foldRate = 0;
  let clock = 0;

  function flare() {
    return held !== null ? held : FLARE;
  }

  function wingIncidence(when) {
    return WING_INCIDENCE * Math.sin(TWO_PI * WING_HZ * when);
  }

  /** Step the joint forward by dt. The flow acts on the incidence that
      is left on the tip after the fold takes its part away. */
  function stepHinge(dt, when) {
    const coupling = Math.sin(flare());
    const stiffness = HINGE_LOAD * coupling + HINGE_SPRING;
    const damping = 2 * HINGE_DAMPING * Math.sqrt(Math.max(stiffness, 1e-6));
    const accel = HINGE_LOAD * wingIncidence(when) - stiffness * fold - damping * foldRate;
    foldRate += accel * dt;
    fold += foldRate * dt;
    // The stops of the joint. A stop takes the rate away.
    if (fold > HINGE_TRAVEL) { fold = HINGE_TRAVEL; if (foldRate > 0) foldRate = 0; }
    if (fold < -HINGE_TRAVEL) { fold = -HINGE_TRAVEL; if (foldRate < 0) foldRate = 0; }
  }

  /** Run the joint from rest up to a time, for a fixed frame. */
  function settle(until) {
    fold = 0; foldRate = 0;
    const dt = 1 / 60;
    for (let when = until - 40; when <= until; when += dt) stepHinge(dt, when);
    clock = until;
  }

  function move(t) {
    inboard.alpha = wingIncidence(t);

    /* The fold takes incidence off the tip. The part it takes is
       sin(flare) of the fold. */
    hinge.fold = fold;
    outboard.alpha = inboard.alpha - hinge.fold * Math.sin(flare());

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

  /** The fold that the joint had a time ago, from the trace in memory.
      The strobe reads it, because the fold is a state and not a
      formula. */
  function foldAgo(ago) {
    if (!history.length) return fold;
    const back = Math.round(ago / TRACE_STEP);
    const i = history.length - 1 - back;
    return i >= 0 ? history[i] : history[0];
  }

  /* Draw the outboard piece at two earlier times, more faint, at the
     hinge position of those times. This strobe shows the fold. */
  function drawGhosts(ctx, t, ink) {
    for (const [ago, alpha] of [[0.5, 0.09], [0.25, 0.18]]) {
      const when = t - ago;
      const ia = wingIncidence(when);
      const oa = ia - foldAgo(ago) * Math.sin(flare());
      const dirIn = chordDirection(ia);
      const hx = inboard.x + inboard.half * dirIn.x;
      const hy = inboard.y + inboard.half * dirIn.y;
      const dirOut = chordDirection(oa);
      ctx.beginPath();
      ctx.ellipse(
        hx + outboard.half * dirOut.x, hy + outboard.half * dirOut.y,
        outboard.half, outboard.thickness, -oa, 0, TWO_PI
      );
      ctx.lineWidth = 1;
      ctx.strokeStyle = withAlpha(ink.body, alpha);
      ctx.stroke();
    }
  }

  function drawPart(ctx, part, ink) {
    ctx.beginPath();
    ctx.ellipse(part.x, part.y, part.half, part.thickness, -part.alpha, 0, TWO_PI);
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = ink.body;
    ctx.stroke();
  }

  /** The axis that the outboard piece turns around. The flare moves
      the axis back. */
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

  /** The joint, and the angle across it at this moment. */
  function drawHinge(ctx, ink) {
    // Fade in with the fold, because the arc must not appear suddenly
    // at a threshold.
    const presence = Math.min(1, Math.max(0, (Math.abs(hinge.fold) - 0.015) / 0.06));
    if (presence > 0) {
      const r = outboard.half * 0.8;
      const from = -inboard.alpha;
      const to = -outboard.alpha;
      ctx.beginPath();
      ctx.arc(hinge.x, hinge.y, r, Math.min(from, to), Math.max(from, to));
      ctx.lineWidth = 1.1;
      ctx.strokeStyle = withAlpha(ink.accent, 0.6 * presence);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(hinge.x, hinge.y, 3.4, 0, TWO_PI);
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = ink.accent;
    ctx.stroke();
  }

  /** The hinge angle with time: the state of the joint. It moves to
      the left. */
  function drawTrace(ctx, ink) {
    if (trace.w <= 0 || history.length < 3) return;
    const steps = Math.round(TRACE_SECONDS / TRACE_STEP);
    const midY = trace.y + trace.h / 2;

    // The datum has the zero line through midY.
    ctx.beginPath();
    for (let i = 0; i < history.length; i++) {
      const px = trace.x + (i / (steps - 1)) * trace.w;
      const py = midY - (history[i] / HINGE_TRAVEL) * (trace.h / 2) * 0.9;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    /* A clock samples the trace. The head is the fold at this moment,
       and the marker moves in each frame. */
    const headX = trace.x + (history.length / (steps - 1)) * trace.w;
    const headY = midY - (hinge.fold / HINGE_TRAVEL) * (trace.h / 2) * 0.9;
    ctx.lineTo(Math.min(headX, trace.x + trace.w), headY);
    ctx.lineWidth = 1.1;
    ctx.strokeStyle = withAlpha(ink.line, 0.7);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(Math.min(headX, trace.x + trace.w), headY, 2.6, 0, TWO_PI);
    ctx.fillStyle = ink.accent;
    ctx.fill();
  }

  return {
    // A figure with lines. The engine clears it completely in each
    // frame.
    fade: 1,

    /* The control of this scene on the lab page. The flare is the
       angle the designer chooses, and it sets how much load the joint
       takes off the tip. */
    lab: {
      label: 'Hinge flare',
      unit: '\u00b0',
      min: 0,
      max: 45,
      step: 1,
      value: () => (flare() * 180) / Math.PI,
      set(v) { held = (v * Math.PI) / 180; },
      release() { held = null; },
    },

    layout(w, h) {
      const chord = Math.min(w * 0.2, h * 0.34);
      inboard.half = chord * 0.32;
      inboard.thickness = Math.max(chord * 0.05, 4);
      inboard.gain = Math.PI * inboard.half * 2 * FREESTREAM;
      outboard.half = chord * 0.2;
      outboard.thickness = Math.max(chord * 0.042, 3.5);
      outboard.gain = Math.PI * outboard.half * 2 * FREESTREAM;
      stage = stageFor(w, h);
      inboard.x = stage.left + stage.width * 0.2;
      inboard.y = stage.y;

      const room = w > 760;
      trace.w = room ? Math.min(stage.width * 0.15, 170) : 0;
      trace.h = Math.max(h * 0.055, 34);
      trace.x = stage.right - trace.w;
      trace.y = stage.y - trace.h / 2;

      history = [];
      lastSample = -99;
      fold = 0;
      foldRate = 0;
      clock = 0;
      flow.layout(w, h);
      move(0);
    },

    frame(ctx, dt, t, ink) {
      /* Step the joint with a fixed step, so the answer does not
         change with the refresh rate of the screen. */
      const step = 1 / 120;
      let left = Math.min(Math.max(t - clock, 0), 0.25);
      while (left > 0) {
        const h = Math.min(step, left);
        stepHinge(h, clock + h);
        clock += h;
        left -= h;
      }
      move(t);
      if (t - lastSample >= TRACE_STEP) {
        lastSample = t;
        history.push(hinge.fold);
        while (history.length > TRACE_SECONDS / TRACE_STEP) history.shift();
      }

      flow.draw(ctx, dt, velocity, ink);
      drawDatum(ctx, stage, ink);
      drawAxis(ctx, ink);
      drawGhosts(ctx, t, ink);
      drawPart(ctx, inboard, ink);
      drawPart(ctx, outboard, ink);
      drawHinge(ctx, ink);
      drawTrace(ctx, ink);
    },

    still(ctx, ink, t) {
      const at = t || 20;
      /* Run the joint from rest, and keep the recent angles, so the
         trace and the strobe have a past to read. */
      fold = 0; foldRate = 0;
      history = [];
      const dt = 1 / 120;
      const from = at - 40;
      let next = at - TRACE_SECONDS;
      for (let when = from; when <= at; when += dt) {
        stepHinge(dt, when);
        if (when >= next) { history.push(fold); next += TRACE_STEP; }
      }
      while (history.length > TRACE_SECONDS / TRACE_STEP) history.shift();
      clock = at;
      move(at);
      flow.still(ctx, velocity, ink);
      drawDatum(ctx, stage, ink);
      drawAxis(ctx, ink);
      drawGhosts(ctx, at, ink);
      drawPart(ctx, inboard, ink);
      drawPart(ctx, outboard, ink);
      drawHinge(ctx, ink);
      drawTrace(ctx, ink);
    },
  };
}
