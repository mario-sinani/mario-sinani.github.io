/* Scene: a wing section pitching and plunging, shedding a wake.

   Behind "Data-Driven Parametric Aeroelastic Modeling of the Pazy Wing".

     · the section carries a bound vortex whose strength follows the
       effective incidence, so the flow visibly turns as the wing moves;
     · Kelvin's theorem is respected by shedding the change in that
       circulation off the trailing edge, which is what draws the wake;
     · the oscillation amplitude sweeps slowly, standing in for the sweep
       across trim conditions the model is built over.

   Three things are drawn over the streamlines. The wake vortices are the
   ones the flow field is already using - marked so the street is visible
   as a street rather than only as its effect, sized by strength and split
   by sign. The incidence arc measures the section against the freestream
   it is actually flying into. And the orbit at the right is the pitch
   plotted against the plunge: a closed loop whose area is the work done
   on the wing each cycle, growing and shrinking as the sweep carries the
   section through its trim conditions.

   Speeds and the chord together fix the reduced frequency
   k = omega * chord / (2 * freestream) - the number that decides whether
   this reads as a wing in a tunnel or as noise. */

import { createFlowlines } from '../flowlines.js';
import { withAlpha } from '../ink.js';
import { TWO_PI, addVortex, addDoublet, segmentDistance2, chordDirection } from '../potential-flow.js';
import { stageFor, drawDatum } from './stage.js';

const FREESTREAM = 110;         // px/s
const FLUTTER_HZ = 0.1;
const PITCH_LEAD = 1.9;         // radians by which pitch leads plunge
const PITCH_AMPLITUDE = 0.26;   // radians
const PLUNGE_FRACTION = 0.04;   // of canvas height
const SWEEP_SECONDS = 26;       // period of the slow amplitude sweep
const SHED_INTERVAL = 0.2;      // seconds between shed wake vortices
const MAX_WAKE = 80;
const CORE2 = 210;              // squared vortex core radius
/* The orbit is sampled on a clock rather than per frame, and kept for
   just over one flutter cycle: counting frames would make the loop's
   length depend on the refresh rate, and it would never close. */
const ORBIT_SECONDS = 1.05 / FLUTTER_HZ;
const ORBIT_STEP = 0.05;        // seconds between orbit samples

export function createPitchingSection() {
  const flow = createFlowlines({ lines: 15, accentEvery: 5, march: 34 });
  const section = { x: 0, y: 0, baseY: 0, half: 60, thickness: 7, gain: 0, alpha: 0, gamma: 0 };
  const orbit = { x: 0, y: 0, w: 0, h: 0 };
  let stage = null;
  let wake = [];
  let path = [];
  let width = 0;
  let height = 0;
  let sinceShed = 0;
  let pendingShed = 0;
  let plunge = 0;
  let lastOrbitSample = -99;

  /* Plunge is positive upward, so the section's screen y is its rest
     height minus it, and plunging downward raises the effective incidence
     exactly as a nose-up rotation does. */
  function move(t) {
    const omega = TWO_PI * FLUTTER_HZ;
    const sweep = 0.55 + 0.45 * Math.sin((TWO_PI * t) / SWEEP_SECONDS);
    const plungeAmp = height * PLUNGE_FRACTION * sweep;
    const hRate = plungeAmp * omega * Math.cos(omega * t);

    plunge = plungeAmp * Math.sin(omega * t);
    section.alpha = PITCH_AMPLITUDE * sweep * Math.sin(omega * t + PITCH_LEAD);
    section.y = section.baseY - plunge;
    section.gamma = section.gain * (section.alpha - hRate / FREESTREAM);
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

  function velocity(x, y) {
    const dir = chordDirection(section.alpha);
    if (segmentDistance2(x, y, section.x, section.y, dir.x, dir.y, section.half)
        <= section.thickness * section.thickness) return null;

    const out = { u: FREESTREAM, v: 0 };
    addDoublet(out, x, y, section.x, section.y, section.thickness * 2, FREESTREAM);
    const bound = quarterChord();
    addVortex(out, x, y, bound.x, bound.y, section.gamma, CORE2);
    for (let i = 0; i < wake.length; i++) {
      addVortex(out, x, y, wake[i].x, wake[i].y, wake[i].gamma, CORE2);
    }
    return out;
  }

  /* Kelvin's theorem: whatever the bound circulation gains, the wake takes
     the opposite. The change is banked between sheds so the wake stays a
     countable number of vortices rather than one per frame. */
  function shed(dt, previousGamma) {
    pendingShed -= section.gamma - previousGamma;
    sinceShed += dt;
    if (sinceShed < SHED_INTERVAL) return;
    sinceShed = 0;
    const edge = trailingEdge();
    wake.push({ x: edge.x, y: edge.y, gamma: pendingShed });
    pendingShed = 0;
    if (wake.length > MAX_WAKE) wake.shift();
  }

  function convectWake(dt) {
    const bound = quarterChord();
    for (let i = 0; i < wake.length; i++) {
      const w = wake[i];
      const out = { u: FREESTREAM, v: 0 };
      addVortex(out, w.x, w.y, bound.x, bound.y, section.gamma, CORE2);
      w.x += out.u * dt;
      w.y += out.v * dt;
    }
    wake = wake.filter((w) => w.x < width + 40);
  }

  /* The shed vortices themselves. Radius follows the square root of the
     strength, so area reads as circulation, and the sign picks the colour:
     the street alternates because the bound circulation does. */
  function drawWake(ctx, ink) {
    let strongest = 1;
    for (let i = 0; i < wake.length; i++) strongest = Math.max(strongest, Math.abs(wake[i].gamma));
    for (let i = 0; i < wake.length; i++) {
      const w = wake[i];
      const strength = Math.abs(w.gamma) / strongest;
      const r = 1 + Math.sqrt(strength) * section.thickness * 0.7;
      if (r < 1.5) continue;
      ctx.beginPath();
      ctx.arc(w.x, w.y, r, 0, TWO_PI);
      ctx.lineWidth = 1;
      ctx.strokeStyle = withAlpha(w.gamma > 0 ? ink.accent : ink.body, 0.15 + 0.5 * strength);
      ctx.stroke();
    }
  }

  /* A hairline outline rather than a solid mass: the hero text sits over
     this canvas, and a filled shape behind a paragraph reads as a smudge
     where an outline reads as a drawing. */
  function drawSection(ctx, ink) {
    ctx.beginPath();
    ctx.ellipse(section.x, section.y, section.half, section.thickness, -section.alpha, 0, TWO_PI);
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = ink.body;
    ctx.stroke();
  }

  /* The incidence arc measures the chord against the datum, which is the
     freestream's own line - so it needs no reference of its own. */
  function drawIncidence(ctx, ink) {
    if (Math.abs(section.alpha) < 0.02) return;
    const r = section.half * 0.85;
    ctx.beginPath();
    // Screen y runs downward, so a nose-up section sweeps the arc negative.
    ctx.arc(section.x, section.y, r, Math.min(0, -section.alpha), Math.max(0, -section.alpha));
    ctx.lineWidth = 1.1;
    ctx.strokeStyle = withAlpha(ink.accent, 0.6);
    ctx.stroke();
  }

  /* Pitch against plunge. A flutter cycle is a closed loop here, and the
     area it encloses is the work the flow does on the wing over it. */
  function drawOrbit(ctx, ink) {
    if (orbit.w <= 0 || path.length < 3) return;
    const cx = orbit.x + orbit.w / 2;
    const cy = orbit.y + orbit.h / 2;

    // The datum already carries the horizontal axis through cy.
    ctx.beginPath();
    ctx.moveTo(cx, orbit.y);
    ctx.lineTo(cx, orbit.y + orbit.h);
    ctx.lineWidth = 1;
    ctx.strokeStyle = ink.faint;
    ctx.stroke();

    const spanA = PITCH_AMPLITUDE;
    const spanH = height * PLUNGE_FRACTION;
    ctx.beginPath();
    for (let i = 0; i < path.length; i++) {
      const px = cx + (path[i].a / spanA) * (orbit.w / 2) * 0.9;
      const py = cy - (path[i].h / spanH) * (orbit.h / 2) * 0.9;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.lineWidth = 1;
    ctx.strokeStyle = withAlpha(ink.line, 0.55);
    ctx.stroke();

    const last = path[path.length - 1];
    ctx.beginPath();
    ctx.arc(
      cx + (last.a / spanA) * (orbit.w / 2) * 0.9,
      cy - (last.h / spanH) * (orbit.h / 2) * 0.9,
      2.6, 0, TWO_PI
    );
    ctx.fillStyle = ink.accent;
    ctx.fill();
  }

  return {
    // A drawn figure, redrawn whole each frame: nothing smears or tints.
    fade: 1,

    layout(w, h) {
      width = w;
      height = h;
      const chord = Math.min(w * 0.2, h * 0.34);
      section.half = chord / 2;
      section.thickness = Math.max(chord * 0.055, 4);
      // Thin-aerofoil bound circulation per radian of incidence: pi * c * U.
      section.gain = Math.PI * chord * FREESTREAM;
      stage = stageFor(w, h);
      /* On the stage's left, so the wake streams right along the datum
         toward the orbit that summarises it. */
      section.x = stage.left + stage.width * 0.22;
      section.baseY = stage.y;

      // Dropped entirely when the canvas is too narrow to hold it quietly.
      const room = w > 760;
      orbit.w = room ? Math.min(stage.width * 0.15, 150) : 0;
      orbit.h = orbit.w * 0.78;
      orbit.x = stage.right - orbit.w;
      orbit.y = stage.y - orbit.h / 2;

      wake = [];
      path = [];
      lastOrbitSample = -99;
      flow.layout(w, h);
      move(0);
    },

    frame(ctx, dt, t, ink) {
      const previousGamma = section.gamma;
      move(t);
      shed(dt, previousGamma);
      convectWake(dt);
      if (t - lastOrbitSample >= ORBIT_STEP) {
        lastOrbitSample = t;
        path.push({ a: section.alpha, h: plunge });
        while (path.length > ORBIT_SECONDS / ORBIT_STEP) path.shift();
      }

      flow.draw(ctx, velocity, ink, t);
      drawDatum(ctx, stage, ink);
      drawWake(ctx, ink);
      drawIncidence(ctx, ink);
      drawSection(ctx, ink);
      drawOrbit(ctx, ink);
    },

    still(ctx, ink, t) {
      const at = t || 9;
      move(at);
      // A cycle of the orbit, so the loop is there to see.
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
      flow.draw(ctx, velocity, ink, 0);
      drawDatum(ctx, stage, ink);
      drawIncidence(ctx, ink);
      drawSection(ctx, ink);
      drawOrbit(ctx, ink);
    },
  };
}
