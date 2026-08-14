/* Scene: a wing section that pitches and plunges, and sheds a wake.

   Background for "Data-Driven Parametric Aeroelastic Modeling of the
   Pazy Wing".

   The physics:
   - The section carries a bound vortex. Its strength follows the
     effective incidence, so the flow turns as the wing moves.
   - The wake receives the change in bound circulation (Kelvin's
     theorem). The shed vortices draw the vortex street.
   - The oscillation amplitude sweeps slowly. This stands for the sweep
     across trim conditions in the paper.

   Over the streamlines the scene draws: the wake vortices (radius shows
   strength, colour shows sign), the incidence arc against the datum, two
   ghost outlines of the section at earlier times, and the pitch-plunge
   orbit. The area of the orbit loop is the work the flow does on the
   wing in one cycle.

   The speeds and the chord set the reduced frequency
   k = omega * chord / (2 * freestream). This value keeps the motion in
   the flutter range. */

import { createFlowlines } from '../flowlines.js';
import { withAlpha } from '../ink.js';
import { createVortexWake } from '../vortex-wake.js';
import { TWO_PI, addVortex, addDoublet, segmentDistance2, chordDirection } from '../potential-flow.js';
import { stageFor, drawDatum } from './stage.js';

const FREESTREAM = 110;         // px/s
const FLUTTER_HZ = 0.1;
const PITCH_LEAD = 1.9;         // radians: pitch leads plunge by this phase
const PITCH_AMPLITUDE = 0.26;   // radians
const PLUNGE_FRACTION = 0.04;   // fraction of the canvas height
const SWEEP_SECONDS = 26;       // period of the slow amplitude sweep

/* Sample the orbit on a clock, and keep a little more than one flutter
   cycle. A frame-counted buffer would depend on the refresh rate, and the
   loop would not close. */
const ORBIT_SECONDS = 1.05 / FLUTTER_HZ;
const ORBIT_STEP = 0.05;        // seconds between orbit samples
const CORE2 = 210;              // squared vortex core radius

export function createPitchingSection() {
  /* Use a 5px integration step, not 4px. This field also samples a full
     wake, and a hairline stroke hides the coarser polyline. */
  const flow = createFlowlines({ lines: 21, accentEvery: 5, tracers: 28, step: 5 });
  const wake = createVortexWake({
    interval: 0.14,
    ramp: 0.3,
    max: 56,                    // spans the stage; the edge fade hides the cut
    core2: CORE2,
    cullRadius2: 160000,        // past 400px a vortex moves a line less than 1px
  });
  const section = { x: 0, y: 0, baseY: 0, half: 60, thickness: 7, gain: 0, alpha: 0, gamma: 0 };
  const orbit = { x: 0, y: 0, w: 0, h: 0 };
  let stage = null;
  let path = [];
  let width = 0;
  let height = 0;
  let plunge = 0;
  let lastOrbitSample = -99;
  let strongestEma = 1;

  /* Pure function of time, so the ghosts can ask for earlier states.
     Plunge is positive upward. A downward plunge rate raises the
     effective incidence, the same as a nose-up rotation. */
  function kinematics(t) {
    const omega = TWO_PI * FLUTTER_HZ;
    const sweep = 0.55 + 0.45 * Math.sin((TWO_PI * t) / SWEEP_SECONDS);
    const plungeAmp = height * PLUNGE_FRACTION * sweep;
    const h = plungeAmp * Math.sin(omega * t);
    return {
      h,
      alpha: PITCH_AMPLITUDE * sweep * Math.sin(omega * t + PITCH_LEAD),
      y: section.baseY - h,
      hRate: plungeAmp * omega * Math.cos(omega * t),
    };
  }

  function move(t) {
    const k = kinematics(t);
    plunge = k.h;
    section.alpha = k.alpha;
    section.y = k.y;
    section.gamma = section.gain * (k.alpha - k.hRate / FREESTREAM);
  }

  function quarterChord() {
    const dir = chordDirection(section.alpha);
    const offset = -section.half * 0.5;
    return { x: section.x + offset * dir.x, y: section.y + offset * dir.y };
  }

  function trailingEdge() {
    const dir = chordDirection(section.alpha);
    return { x: section.x + section.half * dir.x, y: section.y + section.half * dir.y };
  }

  /* Field sample: freestream + thickness doublet + bound vortex + wake.
     Returns null inside the body. */
  function velocity(x, y) {
    const dir = chordDirection(section.alpha);
    if (segmentDistance2(x, y, section.x, section.y, dir.x, dir.y, section.half)
        <= section.thickness * section.thickness) return null;

    const out = { u: FREESTREAM, v: 0 };
    addDoublet(out, x, y, section.x, section.y, section.thickness * 2, FREESTREAM);
    const bound = quarterChord();
    addVortex(out, x, y, bound.x, bound.y, section.gamma, CORE2);
    wake.addTo(out, x, y);
    return out;
  }

  /* Draw the shed vortices. Radius follows the square root of strength,
     so area shows circulation. Sign selects the colour. The strength
     scale is a slow moving average, so the street does not pulse when one
     strong vortex arrives or leaves. */
  function drawWake(ctx, dt, ink) {
    let strongest = 1;
    wake.forEach((w) => { strongest = Math.max(strongest, Math.abs(w.gamma)); });
    strongestEma += (strongest - strongestEma) * Math.min(1, dt * 2);
    wake.forEach((w) => {
      const strength = Math.min(Math.abs(w.gamma) / strongestEma, 1) * w.ramp;
      const r = 1 + Math.sqrt(strength) * section.thickness * 0.7;
      if (r < 1.2) return;
      // Grow in with the ramp. Fade out near the right edge.
      const fade = w.ramp * Math.min(1, (width + 30 - w.x) / 130);
      ctx.beginPath();
      ctx.arc(w.x, w.y, r, 0, TWO_PI);
      ctx.lineWidth = 1;
      ctx.strokeStyle = withAlpha(w.gamma > 0 ? ink.accent : ink.wash, (0.12 + 0.5 * strength) * fade);
      ctx.stroke();
    });
  }

  /* Draw the section at two earlier times, faded. This strobe shows the
     motion in a single glance, like the beam scene. */
  function drawGhosts(ctx, t, ink) {
    for (const [ago, alpha] of [[0.34, 0.09], [0.17, 0.18]]) {
      const k = kinematics(t - ago);
      ctx.beginPath();
      ctx.ellipse(section.x, k.y, section.half, section.thickness, -k.alpha, 0, TWO_PI);
      ctx.lineWidth = 1;
      ctx.strokeStyle = withAlpha(ink.body, alpha);
      ctx.stroke();
    }
  }

  /* A hairline outline, not a filled shape. The hero text sits over this
     canvas, and an outline stays legible behind it. */
  function drawSection(ctx, ink) {
    ctx.beginPath();
    ctx.ellipse(section.x, section.y, section.half, section.thickness, -section.alpha, 0, TWO_PI);
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = ink.body;
    ctx.stroke();
  }

  /* The incidence arc measures the chord against the datum. It fades in
     with the angle, so it does not appear at a hard threshold. */
  function drawIncidence(ctx, ink) {
    const presence = Math.min(1, Math.max(0, (Math.abs(section.alpha) - 0.015) / 0.05));
    if (presence <= 0) return;
    const r = section.half * 0.85;
    ctx.beginPath();
    // Screen y points down, so a nose-up angle sweeps the arc negative.
    ctx.arc(section.x, section.y, r, Math.min(0, -section.alpha), Math.max(0, -section.alpha));
    ctx.lineWidth = 1.1;
    ctx.strokeStyle = withAlpha(ink.accent, 0.6 * presence);
    ctx.stroke();
  }

  /* The orbit instrument: pitch on x, plunge on y. One flutter cycle is a
     closed loop. The datum carries the horizontal axis. */
  function drawOrbit(ctx, ink) {
    if (orbit.w <= 0 || path.length < 3) return;
    const cx = orbit.x + orbit.w / 2;
    const cy = orbit.y + orbit.h / 2;

    ctx.beginPath();
    ctx.moveTo(cx, orbit.y);
    ctx.lineTo(cx, orbit.y + orbit.h);
    ctx.lineWidth = 1;
    ctx.strokeStyle = ink.faint;
    ctx.stroke();

    const spanA = PITCH_AMPLITUDE;
    const spanH = height * PLUNGE_FRACTION;
    const toPx = (q) => cx + (q.a / spanA) * (orbit.w / 2) * 0.9;
    const toPy = (q) => cy - (q.h / spanH) * (orbit.h / 2) * 0.9;

    ctx.beginPath();
    for (let i = 0; i < path.length; i++) {
      if (i === 0) ctx.moveTo(toPx(path[i]), toPy(path[i]));
      else ctx.lineTo(toPx(path[i]), toPy(path[i]));
    }
    /* The loop is sampled on a clock. The head is the live state, so the
       marker moves every frame. */
    const head = { a: section.alpha, h: plunge };
    ctx.lineTo(toPx(head), toPy(head));
    ctx.lineWidth = 1;
    ctx.strokeStyle = withAlpha(ink.line, 0.55);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(toPx(head), toPy(head), 2.6, 0, TWO_PI);
    ctx.fillStyle = ink.accent;
    ctx.fill();
  }

  return {
    // A drawn figure. The engine clears it fully each frame.
    fade: 1,

    layout(w, h) {
      width = w;
      height = h;
      const chord = Math.min(w * 0.2, h * 0.34);
      section.half = chord / 2;
      section.thickness = Math.max(chord * 0.055, 4);
      // Thin-aerofoil bound circulation per radian: pi * chord * U.
      section.gain = Math.PI * chord * FREESTREAM;
      stage = stageFor(w, h);
      // Left of the stage, so the wake streams right toward the orbit.
      section.x = stage.left + stage.width * 0.22;
      section.baseY = stage.y;

      // Drop the orbit when the canvas is too narrow to hold it.
      const room = w > 760;
      orbit.w = room ? Math.min(stage.width * 0.15, 150) : 0;
      orbit.h = orbit.w * 0.78;
      orbit.x = stage.right - orbit.w;
      orbit.y = stage.y - orbit.h / 2;

      wake.reset();
      wake.setLimit(w + 40);
      path = [];
      lastOrbitSample = -99;
      flow.layout(w, h);
      move(0);
    },

    frame(ctx, dt, t, ink) {
      const previousGamma = section.gamma;
      move(t);
      wake.shed(dt, section.gamma - previousGamma, trailingEdge());
      const bound = quarterChord();
      wake.convect(dt, FREESTREAM, (out, x, y) => {
        addVortex(out, x, y, bound.x, bound.y, section.gamma, CORE2);
      });
      if (t - lastOrbitSample >= ORBIT_STEP) {
        lastOrbitSample = t;
        path.push({ a: section.alpha, h: plunge });
        while (path.length > ORBIT_SECONDS / ORBIT_STEP) path.shift();
      }

      flow.draw(ctx, dt, velocity, ink);
      drawDatum(ctx, stage, ink);
      drawWake(ctx, dt, ink);
      drawIncidence(ctx, ink);
      drawGhosts(ctx, t, ink);
      drawSection(ctx, ink);
      drawOrbit(ctx, ink);
    },

    still(ctx, ink, t) {
      const at = t || 9;
      move(at);
      // Rebuild one orbit cycle, so the loop is visible without motion.
      path = [];
      const steps = Math.round(ORBIT_SECONDS / ORBIT_STEP);
      for (let k = 0; k <= steps; k++) {
        const when = at - k * ORBIT_STEP;
        const omega = TWO_PI * FLUTTER_HZ;
        const sweep = 0.55 + 0.45 * Math.sin((TWO_PI * when) / SWEEP_SECONDS);
        path.unshift({
          a: PITCH_AMPLITUDE * sweep * Math.sin(omega * when + PITCH_LEAD),
          h: height * PLUNGE_FRACTION * sweep * Math.sin(omega * when),
        });
      }
      move(at);
      flow.still(ctx, velocity, ink);
      drawDatum(ctx, stage, ink);
      drawIncidence(ctx, ink);
      drawGhosts(ctx, at, ink);
      drawSection(ctx, ink);
      drawOrbit(ctx, ink);
    },
  };
}
