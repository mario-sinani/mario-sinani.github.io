/* Scene: a wing section pitching and plunging, shedding a wake.

   Behind "Data-Driven Parametric Aeroelastic Modeling of the Pazy Wing".

     · the section carries a bound vortex whose strength follows the
       effective incidence, so the flow visibly turns as the wing moves;
     · Kelvin's theorem is respected by shedding the change in that
       circulation off the trailing edge, which is what draws the wake;
     · the oscillation amplitude sweeps slowly, standing in for the sweep
       across trim conditions the model is built over.

   Speeds and the chord together fix the reduced frequency
   k = omega * chord / (2 * freestream) - the number that decides whether
   this reads as a wing in a tunnel or as noise. */

import { createStreaklines } from '../streaklines.js';
import { TWO_PI, addVortex, addDoublet, segmentDistance2, chordDirection } from '../potential-flow.js';

const FREESTREAM = 110;         // px/s
const FLUTTER_HZ = 0.1;
const PITCH_LEAD = 1.9;         // radians by which pitch leads plunge
const PITCH_AMPLITUDE = 0.26;   // radians
const PLUNGE_FRACTION = 0.04;   // of canvas height
const SWEEP_SECONDS = 26;       // period of the slow amplitude sweep
const SHED_INTERVAL = 0.1;      // seconds between shed wake vortices
const MAX_WAKE = 80;
const CORE2 = 210;              // squared vortex core radius

/* Every paper scene sits in this band down from the top of the hero: the
   panel below is vertically centred, so this strip stays clear of the
   words at every viewport height. */
const BAND = 0.14;

export function createPitchingSection() {
  const streaks = createStreaklines({ spacing: 7, max: 260, stall: 9, accentEvery: 17 });
  const section = { x: 0, y: 0, baseY: 0, half: 60, thickness: 7, gain: 0, alpha: 0, gamma: 0 };
  let wake = [];
  let width = 0;
  let height = 0;
  let sinceShed = 0;
  let pendingShed = 0;

  /* Plunge is positive upward, so the section's screen y is its rest
     height minus it, and plunging downward raises the effective incidence
     exactly as a nose-up rotation does. */
  function move(t) {
    const omega = TWO_PI * FLUTTER_HZ;
    const sweep = 0.55 + 0.45 * Math.sin((TWO_PI * t) / SWEEP_SECONDS);
    const plungeAmp = height * PLUNGE_FRACTION * sweep;
    const hRate = plungeAmp * omega * Math.cos(omega * t);

    section.alpha = PITCH_AMPLITUDE * sweep * Math.sin(omega * t + PITCH_LEAD);
    section.y = section.baseY - plungeAmp * Math.sin(omega * t);
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

  return {
    fade: 0.05,

    layout(w, h) {
      width = w;
      height = h;
      const chord = Math.min(w * 0.2, h * 0.34);
      section.half = chord / 2;
      section.thickness = Math.max(chord * 0.055, 4);
      // Thin-aerofoil bound circulation per radian of incidence: pi * c * U.
      section.gain = Math.PI * chord * FREESTREAM;
      /* High and to the left: the hero panel is vertically centred, so this
         band above it is clear, and the wake then streams right across the
         full width instead of running straight off the near edge. */
      section.x = w * 0.3;
      section.baseY = h * BAND;
      wake = [];
      streaks.layout(w, h);
      move(0);
    },

    frame(ctx, dt, t, ink) {
      const previousGamma = section.gamma;
      move(t);
      shed(dt, previousGamma);
      convectWake(dt);
      streaks.draw(ctx, dt, velocity, ink);
      drawSection(ctx, ink);
    },

    still(ctx, ink, t) {
      move(t || 9);
      streaks.still(ctx, velocity, ink, 24);
      drawSection(ctx, ink);
    },
  };
}
