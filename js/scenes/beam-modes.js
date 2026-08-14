/* Scene: a clamped-free beam in its first three modes, with energy
   that moves between them and a bound over the total.

   Background for "Capturing & Bounding Nonlinear Modal Energy Transfer
   for Geometrically Exact Beams using Semidefinite Programming".

   The mode shapes are the clamped-free eigenfunctions, with the roots
   of cos(bL)cosh(bL) = -1. The frequencies keep their true ratios, so
   the third mode blurs while the first still swings.

   The scene draws three layers. The strobe is the beam at recent
   instants, so the motion shape is visible at once. The envelope is the
   largest deflection the current modal energies allow, with all modes
   in phase. The bars are the energy share per mode, measured against
   the bound from the paper's semidefinite program. */

import { withAlpha } from '../ink.js';
import { stageFor, drawDatum } from './stage.js';

const TWO_PI = 6.2832;

// Roots of cos(bL)cosh(bL) = -1. Each mode's frequency scales with
// the square of its root.
const ROOTS = [1.8751, 4.6941, 7.8548];
const SLOSH_SECONDS = 14;       // period of the energy exchange
const BASE_HZ = 0.09;           // first mode; the rest follow the ratios
const SAMPLES = 96;
const STROBES = 14;             // recent instants drawn behind the beam
const STROBE_STEP = 0.085;      // seconds between them

function sigmaFor(bL) {
  return (Math.cosh(bL) + Math.cos(bL)) / (Math.sinh(bL) + Math.sin(bL));
}

/** Clamped-free mode shape, normalised so its largest value is one. */
function modeShape(bL, sigma, xi) {
  const b = bL * xi;
  const raw = Math.cosh(b) - Math.cos(b) - sigma * (Math.sinh(b) - Math.sin(b));
  const tip = Math.cosh(bL) - Math.cos(bL) - sigma * (Math.sinh(bL) - Math.sin(bL));
  return raw / tip;
}

export function createBeamModes() {
  const modes = ROOTS.map((bL, i) => {
    const sigma = sigmaFor(bL);
    return {
      bL,
      sigma,
      omega: TWO_PI * BASE_HZ * ((bL * bL) / (ROOTS[0] * ROOTS[0])),
      // Higher modes carry the same energy in less displacement.
      reach: 1 / (i + 1) ** 1.6,
      energy: 0,
    };
  });

  // The mode shapes are constant. Evaluate them once per layout.
  const shape = modes.map(() => new Float32Array(SAMPLES + 1));
  const beam = { x: 0, y: 0, length: 200, amplitude: 30 };
  const bars = { x: 0, y: 0, w: 0, gap: 0 };
  let stage = null;

  function tabulate() {
    for (let m = 0; m < modes.length; m++) {
      for (let i = 0; i <= SAMPLES; i++) {
        shape[m][i] = modeShape(modes[m].bL, modes[m].sigma, i / SAMPLES);
      }
    }
  }

  /* Move energy between the modes. Normalise the three shares each
     frame, so the total is constant. */
  function slosh(t) {
    const phase = (TWO_PI * t) / SLOSH_SECONDS;
    let sum = 0;
    for (let i = 0; i < modes.length; i++) {
      const raw = 0.35 + 0.3 * Math.sin(phase + i * 2.1) + 0.2 / (i + 1);
      modes[i].energy = Math.max(raw, 0.02);
      sum += modes[i].energy;
    }
    for (let i = 0; i < modes.length; i++) modes[i].energy /= sum;
  }

  function deflection(i, t) {
    let w = 0;
    for (let m = 0; m < modes.length; m++) {
      const mode = modes[m];
      w += Math.sqrt(mode.energy) * mode.reach * shape[m][i] * Math.sin(mode.omega * t);
    }
    return w;
  }

  /** Largest deflection these energies allow, every mode in phase. */
  function envelope(i) {
    let w = 0;
    for (let m = 0; m < modes.length; m++) {
      w += Math.sqrt(modes[m].energy) * modes[m].reach * Math.abs(shape[m][i]);
    }
    return w;
  }

  function traceBeam(ctx, t) {
    ctx.beginPath();
    for (let i = 0; i <= SAMPLES; i++) {
      const x = beam.x + (i / SAMPLES) * beam.length;
      const y = beam.y + deflection(i, t) * beam.amplitude;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
  }

  function drawStrobe(ctx, t, ink) {
    for (let s = STROBES; s >= 1; s--) {
      traceBeam(ctx, t - s * STROBE_STEP);
      ctx.lineWidth = 1;
      ctx.strokeStyle = withAlpha(ink.line, (0.42 * (STROBES - s + 1)) / STROBES);
      ctx.stroke();
    }
  }

  function drawEnvelope(ctx, ink) {
    for (const side of [1, -1]) {
      ctx.beginPath();
      for (let i = 0; i <= SAMPLES; i++) {
        const x = beam.x + (i / SAMPLES) * beam.length;
        const y = beam.y + side * envelope(i) * beam.amplitude;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.setLineDash([2, 4]);
      ctx.lineWidth = 1;
      ctx.strokeStyle = ink.faint;
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  function drawBeam(ctx, t, ink) {
    traceBeam(ctx, t);
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = ink.body;
    ctx.stroke();

    // The clamp: a short upright with hatching to mark the fixed end.
    const reach = beam.amplitude * 0.72;
    ctx.beginPath();
    ctx.moveTo(beam.x, beam.y - reach);
    ctx.lineTo(beam.x, beam.y + reach);
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = ink.accent;
    ctx.stroke();

    ctx.beginPath();
    for (let i = -3; i <= 3; i++) {
      const y = beam.y + (i / 3) * reach;
      ctx.moveTo(beam.x, y);
      ctx.lineTo(beam.x - 7, y + 5);
    }
    ctx.lineWidth = 1;
    ctx.strokeStyle = ink.faint;
    ctx.stroke();
  }

  function drawEnergy(ctx, ink) {
    if (bars.w <= 0) return;
    for (let i = 0; i < modes.length; i++) {
      const y = bars.y + i * bars.gap;
      ctx.beginPath();
      ctx.moveTo(bars.x, y);
      ctx.lineTo(bars.x + bars.w, y);
      ctx.lineWidth = 1;
      ctx.strokeStyle = ink.faint;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(bars.x, y);
      ctx.lineTo(bars.x + bars.w * modes[i].energy, y);
      ctx.lineWidth = 3.2;
      ctx.strokeStyle = i === 0 ? ink.accent : ink.body;
      ctx.stroke();
    }

    // The bound: the line the shares are measured against.
    const boundX = bars.x + bars.w * 0.62;
    ctx.beginPath();
    ctx.setLineDash([3, 3]);
    ctx.moveTo(boundX, bars.y - bars.gap * 0.6);
    ctx.lineTo(boundX, bars.y + bars.gap * (modes.length - 0.4));
    ctx.lineWidth = 1;
    ctx.strokeStyle = ink.line;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  return {
    // The strobe carries the history. The engine clears the canvas
    // each frame.
    fade: 1,

    layout(w, h) {
      stage = stageFor(w, h);
      beam.x = stage.left;
      beam.length = Math.min(stage.width * 0.58, 660);
      beam.y = stage.y;
      beam.amplitude = Math.min(h * 0.085, 62);

      const room = w > 700;
      bars.w = room ? Math.min(stage.width * 0.15, 170) : 0;
      bars.x = stage.right - bars.w;
      bars.gap = Math.max(h * 0.028, 12);
      bars.y = stage.y - bars.gap;
      tabulate();
    },

    frame(ctx, dt, t, ink) {
      slosh(t);
      // The datum is the beam at rest, extended to the bars.
      drawDatum(ctx, stage, ink);
      drawEnvelope(ctx, ink);
      drawStrobe(ctx, t, ink);
      drawBeam(ctx, t, ink);
      drawEnergy(ctx, ink);
    },

    still(ctx, ink, t) {
      const at = t || 2.6;
      slosh(at);
      drawDatum(ctx, stage, ink);
      drawEnvelope(ctx, ink);
      drawStrobe(ctx, at, ink);
      drawBeam(ctx, at, ink);
      drawEnergy(ctx, ink);
    },
  };
}
