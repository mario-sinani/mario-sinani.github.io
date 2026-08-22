/* Scene: the drawing of the Pazy wing after a step in the angle of attack.
   Background for "Physics-Informed Data-Driven Modelling of Nonlinear
   Aerodynamic Forces of the Pazy Wing".

   The model is in js/models/pazy-step.js. The scene draws the wing, the
   ghosts of its recent shapes, the arrows of the load, and the inset of the
   vertical force at the tip with the level of each model. */

import { withAlpha } from '../ink.js';
import { createPazyWing, PAZY_ASPECT, OBLIQUE } from '../pazy-wing.js';
import { stageFor, drawDatum } from './stage.js';
import { caseAt } from './schedule.js';
import { createPazyStepModel, SCHEDULE, HOLD, LOG_SECONDS, ALPHA_8 } from '../models/pazy-step.js';

const TWO_PI = Math.PI * 2;
const STATIONS = 48;

const GHOSTS = [0.6, 0.4, 0.2];   // seconds ago
/* The subject rises above the datum, so the datum sits lower by this
   fraction of the height. */
const RISE = 0.10;


export function createPazyStep() {
  const n = STATIONS;
  const wing = createPazyWing(n);
  const model = createPazyStepModel(n);
  const { q, qd, LOAD } = model;

  const psi = new Float64Array(n + 1);
  const theta = new Float64Array(n + 1);   // no twist in this scene
  const vel = new Float64Array(n + 1);
  const inset = { x: 0, y: 0, w: 0, h: 0 };
  let stage = null;
  let span = 300;

  function drawGhosts(ctx, ink) {
    GHOSTS.forEach((ago, k) => {
      const s = model.stateAgo(ago);
      if (!s) return;
      model.slopesInto(psi, s.q);
      wing.ghost(ctx, psi, theta, withAlpha(ink.body, 0.07 + 0.06 * k));
    });
  }

  function drawLoad(ctx, ink) {
    model.slopesInto(psi, q);
    model.velocityInto(vel);
    const unit = LOAD * ALPHA_8;
    wing.arrows(ctx, ink, psi, (i) => (model.load(model.alphaNow, psi[i], vel[i]) / unit) * span * 0.16);
  }

  /* The inset: the vertical force at the tip. The dashed lines are the
     level of the linear model and the level the nonlinear model settles at. */
  function drawInset(ctx, ink) {
    const history = model.history;
    if (inset.w <= 0 || history.length < 2) return;
    const unit = LOAD * ALPHA_8;
    const toX = (when) => inset.x + inset.w * (1 - (model.clock - when) / LOG_SECONDS);
    const toY = (f) => inset.y + inset.h * (1 - (f / unit + 0.25) / 1.4);

    ctx.beginPath();
    ctx.moveTo(inset.x, toY(0));
    ctx.lineTo(inset.x + inset.w, toY(0));
    ctx.moveTo(inset.x, inset.y);
    ctx.lineTo(inset.x, inset.y + inset.h);
    ctx.lineWidth = 1;
    ctx.strokeStyle = ink.faint;
    ctx.stroke();

    const alpha = model.targetAlpha(model.clock);
    const linear = LOAD * alpha;
    const trim = model.settle(alpha).tip;
    ctx.beginPath();
    ctx.setLineDash([3, 3]);
    ctx.moveTo(inset.x, toY(linear));
    ctx.lineTo(inset.x + inset.w, toY(linear));
    ctx.lineWidth = 1;
    ctx.strokeStyle = withAlpha(ink.line, 0.55);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(inset.x, toY(trim));
    ctx.lineTo(inset.x + inset.w, toY(trim));
    ctx.strokeStyle = withAlpha(ink.accent, 0.55);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.beginPath();
    history.forEach((h, i) => {
      const px = toX(h.t);
      const py = toY(h.force);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = ink.body;
    ctx.stroke();

    const last = history[history.length - 1];
    ctx.beginPath();
    ctx.arc(toX(last.t), toY(last.force), 2.6, 0, TWO_PI);
    ctx.fillStyle = ink.accent;
    ctx.fill();
  }

  function paint(ctx, ink) {
    drawDatum(ctx, stage, ink);
    drawGhosts(ctx, ink);
    drawLoad(ctx, ink);
    model.slopesInto(psi, q);
    wing.draw(ctx, ink, psi, theta);
    drawInset(ctx, ink);
  }

  return {
    // A figure with lines. The engine clears it in each frame.
    fade: 1,

    /* The control on the lab page. Each new value is a step input, as in
       the paper. */
    lab: {
      label: 'Angle of attack',
      unit: '°',
      min: 0,
      max: 8,
      step: 0.25,
      value: () => (model.targetAlpha(model.clock) * 180) / Math.PI,
      set(v) { model.hold((v * Math.PI) / 180); },
      release() { model.release(); },
      autoName: 'the steps of the paper',
      /* What the model does at this moment, for the line below the
         control. In Auto the model sets the parameter; in Hold the
         slider holds the value v. */
      status(isAuto, v) {
        if (!isAuto) {
          return 'Held at ' + v + '°. Each new value of the slider is a step input, and the wing '
            + 'answers with a transient. Auto returns to the steps of the paper.';
        }
        const { now, next, left } = caseAt(model.clock, HOLD, SCHEDULE);
        return 'Auto runs the steps of the paper: 1, 2, 4, 7 and 8 degrees, 7 seconds each. '
          + 'Now a step to ' + now + '°; next ' + next + '° in ' + left + ' s.';
      },
    },

    /** A few numbers of the state, for a test. */
    probe() {
      model.slopesInto(psi, q);
      wing.trace(psi);
      return { ...model.probe(), datum: stage.y, span };
    },

    /* Put the model back at its start. The engine calls it before
       it draws a fixed frame after a resize. */
    reset() {
      model.reset();
    },

    layout(w, h, fit = {}) {
      /* A preview shows the top of the box, so the wing sits lower and in
         the middle, and takes the width. */
      const preview = Boolean(fit.preview);
      stage = stageFor(w, h, preview ? 0.30 : (fit.band ?? 0.14) + RISE);
      const scale = fit.scale || 1;
      // The tip rises to half the span, so the room above the datum limits
      // the span.
      const above = stage.y - 18;
      span = preview
        ? Math.min(stage.width * 0.8, above / 0.52)
        : Math.min(stage.width * 0.58 * scale, above / 0.52, 760);
      const run = (span / PAZY_ASPECT) * OBLIQUE.x;
      const rootX = preview ? stage.left + (stage.width - span - run) / 2 : stage.left + stage.width * 0.02;
      wing.layout(rootX, stage.y, span);

      const room = w > 760;
      inset.w = room ? Math.min(stage.width * 0.17, 170) : 0;
      inset.h = inset.w * 0.6;
      inset.x = stage.right - inset.w;
      inset.y = stage.y - inset.h * 0.72;

    },

    frame(ctx, dt, t, ink) {
      model.advance(t);
      paint(ctx, ink);
    },

    still(ctx, ink, t) {
      const at = t || 30;   // 1.5 s into the step to 8 degrees
      /* Start from the trim before the log, so the log and the ghosts have
         a past. */
      const from = Math.max(0, at - LOG_SECONDS - 1.5);
      model.startAtTrim(from);
      while (model.clock < at) model.advance(Math.min(model.clock + 0.25, at));
      paint(ctx, ink);
      return at;
    },
  };
}
