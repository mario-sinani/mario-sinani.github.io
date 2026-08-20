/* Scene: a wing section that pitches and plunges, and sheds a wake.

   Background for "Data-Driven Parametric Aeroelastic Modeling of the
   Pazy Wing".

   The section has a bound vortex whose strength follows the effective
   incidence, so the flow turns while the wing moves. The wake gets the
   change in the bound circulation (the theorem of Kelvin), and the shed
   vortices make the street. The amplitude of the motion changes slowly,
   which shows how the wake and the work in one cycle grow with it.

   Over the streamlines: the wake vortices, the incidence arc, two faint
   outlines at earlier times, and the pitch-plunge orbit, whose loop area
   is the work the flow does in one cycle. The reduced frequency
   k = omega * chord / (2 * U) stays at K_TARGET on a canvas of any
   size, because layout() sets U from the chord. The motion is then in
   the flutter range on every screen. */

import { createFlowlines } from '../flowlines.js';
import { withAlpha } from '../ink.js';
import { createVortexWake } from '../vortex-wake.js';
import { PAZY_RATIO, traceAerofoil, isInsideAerofoil } from '../aerofoil.js';
import { TWO_PI, addVortex, addDoublet, chordDirection } from '../potential-flow.js';
import { stageFor, drawDatum } from './stage.js';

/* The reduced frequency k = omega * chord / (2 * U) sets the strength
   of the unsteady wake. It must not change with the size of the canvas,
   so the speed of the stream comes from the chord and this value. The
   frequency stays the same, and the motion keeps its tempo on every
   screen. */
const K_TARGET = 0.38;          // reduced frequency, in the flutter range

/* Theodorsen's function C(k) gives the circulatory lift of a section
   that moves in its own wake. It makes the lift smaller than the
   quasi-steady value, and it makes the lift late. At k = 0.38 the
   value from the approximation of Jones is 0.657 at an angle of
   -16.1 degrees, and that angle is a delay of 0.448 s at this
   frequency. The wake is the reason for both. */
const THEODORSEN_GAIN = 0.6568;
const THEODORSEN_LAG = 0.4479;  // seconds
const FLUTTER_HZ = 0.1;
const PITCH_LEAD = 1.9;         // radians: pitch leads plunge by this phase
const PITCH_AMPLITUDE = 0.26;   // radians
const PLUNGE_FRACTION = 0.04;   // fraction of the canvas height
const SWEEP_SECONDS = 26;       // period of the slow amplitude sweep

/* Sample the orbit with a clock, and keep a little more than one
   flutter cycle. A buffer with a count of frames changes with the
   refresh rate, and the loop then does not close. */
const ORBIT_SECONDS = 1.05 / FLUTTER_HZ;
const ORBIT_STEP = 0.05;        // seconds between orbit samples
const CORE2 = 210;              // squared vortex core radius

/* The doublet shows the volume that the section displaces. Its radius
   is a fraction of the half chord and not a fraction of the thickness.
   The outline can then change with no change to the flow field. */
const DOUBLET_RATIO = 0.22;
/* The radius of a wake marker, as a fraction of the thickness of the
   section. */
const WAKE_MARKER = 0.42;

export function createPitchingSection() {
  /* Use an integration step of 5px and not 4px. This field also
     samples a full wake, and a thin stroke hides the larger
     segments. */
  const flow = createFlowlines({ lines: 21, accentEvery: 5, tracers: 28, step: 5 });
  const wake = createVortexWake({
    interval: 0.14,
    ramp: 0.3,
    max: 56,                    // spans the stage; the edge fade hides the cut
    core2: CORE2,
    cullRadius2: 160000,        // past 400px a vortex moves a line less than 1px
  });
  const section = {
    x: 0, y: 0, baseY: 0, half: 60, thickness: 7,
    ratio: PAZY_RATIO, gain: 0, alpha: 0, gamma: 0,
  };
  const orbit = { x: 0, y: 0, w: 0, h: 0 };
  let stage = null;
  let path = [];
  let width = 0;
  let height = 0;
  let plunge = 0;
  /* px/s. layout() sets it from the chord, so that k stays at
     K_TARGET on a canvas of any size. */
  let stream = 110;
  let lastOrbitSample = -99;
  let strongestEma = 1;
  /* The lab can hold the amplitude at one fraction of the full pitch.
     The value null means that the slow sweep runs. */
  let held = null;
  let sweepNow = 0.55;

  /* The function uses only the time, and the faint outlines can ask
     for an earlier state. A plunge up is positive. A plunge rate down
     increases the effective incidence, the same as a rotation
     nose-up. */
  function kinematics(t) {
    const omega = TWO_PI * FLUTTER_HZ;
    const sweep = held !== null ? held
      : 0.55 + 0.45 * Math.sin((TWO_PI * t) / SWEEP_SECONDS);
    const plungeAmp = height * PLUNGE_FRACTION * sweep;
    const h = plungeAmp * Math.sin(omega * t);
    return {
      h,
      alpha: PITCH_AMPLITUDE * sweep * Math.sin(omega * t + PITCH_LEAD),
      y: section.baseY - h,
      hRate: plungeAmp * omega * Math.cos(omega * t),
      aRate: PITCH_AMPLITUDE * sweep * omega * Math.cos(omega * t + PITCH_LEAD),
    };
  }

  /* The incidence the flow sees at the three-quarter chord: the pitch,
     the plunge rate, and the pitch rate over the arm from the pitch
     axis at the middle of the chord to that point. */
  function effectiveIncidence(k) {
    return k.alpha - k.hRate / stream + (section.half / 2) * k.aRate / stream;
  }

  function move(t) {
    const k = kinematics(t);
    /* Keep the amplitude of this instant, because the readout of the
       lab reads it. kinematics() also runs at other times in a frame,
       so it must not write this. */
    sweepNow = held !== null ? held
      : 0.55 + 0.45 * Math.sin((TWO_PI * t) / SWEEP_SECONDS);
    plunge = k.h;
    section.alpha = k.alpha;
    section.y = k.y;
    /* The bound circulation follows the wake, not the motion of this
       instant. Take the incidence from the delay of C(k), and make it
       smaller by the gain of C(k). */
    const lagged = kinematics(t - THEODORSEN_LAG);
    section.gamma = section.gain * THEODORSEN_GAIN * effectiveIncidence(lagged);
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

  /* A sample of the field: the freestream, the thickness doublet, the
     bound vortex and the wake. The function gives null in the body. */
  function velocity(x, y) {
    if (isInsideAerofoil(section, x, y)) return null;

    const out = { u: stream, v: 0 };
    addDoublet(out, x, y, section.x, section.y, section.half * DOUBLET_RATIO, stream);
    const bound = quarterChord();
    addVortex(out, x, y, bound.x, bound.y, section.gamma, CORE2);
    wake.addTo(out, x, y);
    return out;
  }

  /* Draw the shed vortices. The radius is proportional to the square
     root of the strength, and the area shows the circulation. The sign
     selects the colour. The scale of the strength is a slow mean value.
     The street then does not change its size when one strong vortex
     comes or goes. */
  function drawWake(ctx, dt, ink) {
    let strongest = 1;
    wake.forEach((w) => { strongest = Math.max(strongest, Math.abs(w.gamma)); });
    strongestEma += (strongest - strongestEma) * Math.min(1, dt * 2);
    wake.forEach((w) => {
      const strength = Math.min(Math.abs(w.gamma) / strongestEma, 1) * w.ramp;
      const r = 1 + Math.sqrt(strength) * section.thickness * WAKE_MARKER;
      if (r < 1.2) return;
      // Increase the size with the ramp. Fade out near the right
      // edge.
      const fade = w.ramp * Math.min(1, (width + 30 - w.x) / 130);
      ctx.beginPath();
      ctx.arc(w.x, w.y, r, 0, TWO_PI);
      ctx.lineWidth = 1;
      ctx.strokeStyle = withAlpha(w.gamma > 0 ? ink.accent : ink.wash, (0.12 + 0.5 * strength) * fade);
      ctx.stroke();
    });
  }

  /* Draw the section at two earlier times, more faint. This strobe
     shows the motion in one view, like the beam scene. */
  function drawGhosts(ctx, t, ink) {
    for (const [ago, alpha] of [[0.34, 0.09], [0.17, 0.18]]) {
      const k = kinematics(t - ago);
      traceAerofoil(ctx, { ...section, y: k.y, alpha: k.alpha });
      ctx.lineWidth = 1;
      ctx.strokeStyle = withAlpha(ink.body, alpha);
      ctx.stroke();
    }
  }

  /* A thin outline, and not a filled shape. The text of the hero is
     above this canvas, and an outline behind the text stays easy to
     read. */
  function drawSection(ctx, ink) {
    traceAerofoil(ctx, section);
    ctx.lineWidth = 1.3;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = ink.body;
    ctx.stroke();
  }

  /* The incidence arc gives the angle from the datum to the chord. It
     fades in with the angle, because it must not appear suddenly at a
     threshold. */
  function drawIncidence(ctx, ink) {
    const presence = Math.min(1, Math.max(0, (Math.abs(section.alpha) - 0.015) / 0.05));
    if (presence <= 0) return;
    const r = section.half * 0.85;
    ctx.beginPath();
    // The screen y axis points down, and a nose-up angle makes the
    // arc negative.
    ctx.arc(section.x, section.y, r, Math.min(0, -section.alpha), Math.max(0, -section.alpha));
    ctx.lineWidth = 1.1;
    ctx.strokeStyle = withAlpha(ink.accent, 0.6 * presence);
    ctx.stroke();
  }

  /* The orbit instrument: the pitch on x and the plunge on y. One
     flutter cycle is a closed loop. The datum is the horizontal
     axis. */
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
    /* A clock samples the loop. The head is the state at this moment,
       and the marker moves in each frame. */
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
    // A figure with lines. The engine clears it completely in each
    // frame.
    fade: 1,

    /* The control of this scene on the lab page. The value is the
       pitch amplitude in degrees, from zero to the full sweep. */
    lab: {
      label: 'Pitch amplitude',
      unit: '\u00b0',
      min: 0,
      max: 15,
      step: 0.25,
      value: () => (PITCH_AMPLITUDE * sweepNow * 180) / Math.PI,
      set(v) {
        const full = (PITCH_AMPLITUDE * 180) / Math.PI;
        held = Math.min(Math.max(v / full, 0), 1);
      },
      release() { held = null; },
    },

    layout(w, h) {
      width = w;
      height = h;
      const chord = Math.min(w * 0.2, h * 0.34);
      section.half = chord / 2;
      // NACA 0018: the largest half-thickness is 0.09 of the chord.
      section.thickness = Math.max(chord * section.ratio / 2, 4);
      // Thin-aerofoil bound circulation per radian: pi * chord * U.
      // The stream that holds the reduced frequency at K_TARGET.
      stream = (TWO_PI * FLUTTER_HZ) * chord / (2 * K_TARGET);
      section.gain = Math.PI * chord * stream;
      stage = stageFor(w, h);
      // On the left of the stage, because the wake must move to the
      // right, to the orbit.
      section.x = stage.left + stage.width * 0.22;
      section.baseY = stage.y;

      // Remove the orbit if the canvas is too narrow for it.
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
      wake.convect(dt, stream, (out, x, y) => {
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
      // Make one cycle of the orbit again, because the loop must be
      // visible with no motion.
      path = [];
      const steps = Math.round(ORBIT_SECONDS / ORBIT_STEP);
      for (let k = 0; k <= steps; k++) {
        const when = at - k * ORBIT_STEP;
        const omega = TWO_PI * FLUTTER_HZ;
        const sweep = held !== null ? held
          : 0.55 + 0.45 * Math.sin((TWO_PI * when) / SWEEP_SECONDS);
        path.unshift({
          a: PITCH_AMPLITUDE * sweep * Math.sin(omega * when + PITCH_LEAD),
          h: height * PLUNGE_FRACTION * sweep * Math.sin(omega * when),
        });
      }
      /* Build the wake again. The street is the subject of the scene,
         and a visitor who asks for no motion must see it too. Shed and
         convect over the recent past, with the same steps the loop
         uses. */
      wake.reset();
      const dt = 0.05;
      const from = at - ORBIT_SECONDS * 2;
      move(from);
      for (let when = from; when <= at; when += dt) {
        const before = section.gamma;
        move(when);
        wake.shed(dt, section.gamma - before, trailingEdge());
        const bound = quarterChord();
        wake.convect(dt, stream, (out, x, y) => {
          addVortex(out, x, y, bound.x, bound.y, section.gamma, CORE2);
        });
      }

      move(at);
      flow.still(ctx, velocity, ink);
      drawDatum(ctx, stage, ink);
      drawWake(ctx, dt, ink);
      drawIncidence(ctx, ink);
      drawGhosts(ctx, at, ink);
      drawSection(ctx, ink);
      drawOrbit(ctx, ink);
    },
  };
}
