/* Scene: the drawing of the beam that moves energy between its modes.
   Background for "Capturing & Bounding Nonlinear Modal Energy Transfer for
   Geometrically Exact Beams using Semidefinite Programming".

   The model is in js/models/beam-modes.js. The scene draws the beam, the
   strobe of its recent shapes, the ticks that move with the axial mode, and
   the bars of the energy with the running average and the bound. The axial
   motion is drawn larger than it is, and the two frequencies are closer
   than in the paper, so the eye can follow both. */

import { withAlpha } from '../ink.js';
import { stageFor, drawDatum } from './stage.js';
import { firstSlope } from '../beam-modes-shape.js';
import { caseAt } from './schedule.js';
import { createBeamModel, axialMode, AMPLITUDES, HOLD, STROBES } from '../models/beam-modes.js';

const AXIAL_SHOW = 6;             // the axial displacement is drawn this many times larger
const SAMPLES = 96;
const TICKS = 10;

export function createBeamModes() {
  const model = createBeamModel();
  const state = model.state;
  const slope = new Float64Array(SAMPLES + 1);
  const axial = new Float64Array(SAMPLES + 1);
  for (let i = 0; i <= SAMPLES; i++) {
    slope[i] = firstSlope(i / SAMPLES);
    axial[i] = axialMode(i / SAMPLES);
  }
  const X = new Float64Array(SAMPLES + 1);
  const Z = new Float64Array(SAMPLES + 1);
  const beam = { x: 0, y: 0, length: 200 };
  const bars = { x: 0, y: 0, w: 0, gap: 0 };
  let stage = null;

  /** The axis of the beam for a bending x1. The beam keeps its length. */
  function traceBeam(x1) {
    X[0] = 0;
    Z[0] = 0;
    const ds = 1 / SAMPLES;
    for (let i = 1; i <= SAMPLES; i++) {
      const a = 0.5 * (slope[i - 1] + slope[i]) * x1;
      X[i] = X[i - 1] + Math.cos(a) * ds;
      Z[i] = Z[i - 1] + Math.sin(a) * ds;
    }
  }

  function toScreen(i) {
    return { x: beam.x + X[i] * beam.length, y: beam.y - Z[i] * beam.length };
  }

  function pathBeam(ctx, x1) {
    traceBeam(x1);
    ctx.beginPath();
    for (let i = 0; i <= SAMPLES; i++) {
      const p = toScreen(i);
      if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    }
  }

  function drawStrobe(ctx, ink) {
    model.strobe.forEach((s, k) => {
      pathBeam(ctx, s.x1);
      ctx.lineWidth = 1;
      ctx.strokeStyle = withAlpha(ink.line, (0.42 * (k + 1)) / STROBES);
      ctx.stroke();
    });
  }

  function drawBeam(ctx, ink) {
    pathBeam(ctx, state.x1);
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = ink.body;
    ctx.stroke();

    /* The ticks move with the axial mode, each at its station plus the
       axial displacement, drawn larger than it is. */
    traceBeam(state.x1);
    ctx.beginPath();
    for (let k = 1; k <= TICKS; k++) {
      const xi = k / TICKS;
      const shifted = Math.min(Math.max(xi + state.x2 * axial[Math.round(xi * SAMPLES)] * AXIAL_SHOW, 0), 1);
      const i = shifted * SAMPLES;
      const i0 = Math.floor(i);
      const i1 = Math.min(i0 + 1, SAMPLES);
      const f = i - i0;
      const px = beam.x + (X[i0] + (X[i1] - X[i0]) * f) * beam.length;
      const py = beam.y - (Z[i0] + (Z[i1] - Z[i0]) * f) * beam.length;
      const a = slope[i0] * state.x1;
      const nx = -Math.sin(a) * 4;
      const ny = -Math.cos(a) * 4;
      ctx.moveTo(px - nx, py - ny);
      ctx.lineTo(px + nx, py + ny);
    }
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = ink.accent;
    ctx.stroke();

    // The clamp: a short vertical line with hatch lines.
    const reach = beam.length * 0.07;
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

  /* The bars: the share of each mode now, the running average as a mark,
     and the bound on the bending as a dashed line. */
  function drawEnergy(ctx, ink) {
    if (bars.w <= 0) return;
    const e = model.energies();
    const mean = e.mean;
    const rows = [
      { share: e.share, mean, style: ink.accent },
      { share: 1 - e.share, mean: 1 - mean, style: ink.body },
    ];
    rows.forEach((row, i) => {
      const y = bars.y + i * bars.gap;
      ctx.beginPath();
      ctx.moveTo(bars.x, y);
      ctx.lineTo(bars.x + bars.w, y);
      ctx.lineWidth = 1;
      ctx.strokeStyle = ink.faint;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(bars.x, y);
      ctx.lineTo(bars.x + bars.w * row.share, y);
      ctx.lineWidth = 3.2;
      ctx.strokeStyle = row.style;
      ctx.stroke();

      // The running average.
      const mx = bars.x + bars.w * row.mean;
      ctx.beginPath();
      ctx.moveTo(mx, y - 5);
      ctx.lineTo(mx, y + 5);
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = row.style;
      ctx.stroke();
    });

    // The bound on the average of the bending.
    const bx = bars.x + bars.w * model.bound;
    ctx.beginPath();
    ctx.setLineDash([3, 3]);
    ctx.moveTo(bx, bars.y - bars.gap * 0.6);
    ctx.lineTo(bx, bars.y + bars.gap * 0.6);
    ctx.lineWidth = 1;
    ctx.strokeStyle = ink.line;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function paint(ctx, ink) {
    drawDatum(ctx, stage, ink);
    drawStrobe(ctx, ink);
    drawBeam(ctx, ink);
    drawEnergy(ctx, ink);
  }

  return {
    fade: 1,

    /* The control on the lab page: the amplitude, which sets how nonlinear
       the beam is. */
    lab: {
      label: 'Amplitude',
      unit: '%',
      min: 5,
      max: 40,
      step: 1,
      value: () => model.amplitude * 100,
      set(v) { model.hold(v / 100); },
      release() { model.release(); },
      autoName: 'four amplitudes in turn',
      /* What the model does at this moment, for the line below the
         control. In Auto the model sets the parameter; in Hold the
         slider holds the value v. */
      status(isAuto, v) {
        if (!isAuto) {
          return 'Amplitude held at ' + v + ' per cent. The run and its averages restart at each new value. '
            + 'Auto returns to the four amplitudes.';
        }
        const { next, left } = caseAt(model.clock, HOLD, AMPLITUDES);
        return 'Auto runs four amplitudes in turn, 14 seconds each, and restarts the run at each one. '
          + 'Now ' + Math.round(model.amplitude * 100) + ' per cent of the length; next ' + Math.round(next * 100) + ' per cent in ' + left + ' s.';
      },
    },

    /** A few numbers of the state, for a test. */
    probe: model.probe,

    /* Put the model back at its start. The engine calls it before
       it draws a fixed frame after a resize. */
    reset() {
      model.reset(0);
    },

    layout(w, h, fit = {}) {
      /* A preview shows the top of the box, so the beam sits lower and in
         the middle, and takes the width. */
      const preview = Boolean(fit.preview);
      stage = stageFor(w, h, fit.band ?? (preview ? 0.19 : undefined));
      beam.length = preview
        ? Math.min(stage.width * 0.86, (stage.y - 10) / 0.42)
        : Math.min(stage.width * 0.58, 660, (stage.y - 16) / 0.42);
      beam.x = preview ? stage.left + (stage.width - beam.length) / 2 : stage.left;
      beam.y = stage.y;

      const room = w > 700 && !preview;
      bars.w = room ? Math.min(stage.width * 0.15, 170) : 0;
      bars.x = stage.right - bars.w;
      bars.gap = Math.max(h * 0.028, 12);
      bars.y = stage.y - bars.gap * 0.5;
    },

    frame(ctx, dt, t, ink) {
      model.advance(t);
      paint(ctx, ink);
    },

    still(ctx, ink, t) {
      const at = t || 46;   // 4 s into the largest amplitude
      const since = model.heldValue() !== null ? Math.min(at, 8) : at % HOLD;
      model.reset(at - since);
      while (model.clock < at) model.advance(Math.min(model.clock + 0.25, at));
      paint(ctx, ink);
      return at;
    },
  };
}
