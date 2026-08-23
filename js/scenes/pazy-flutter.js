/* Scene: the drawing of the Pazy wing at its trim, and of the growth or the
   decay of a perturbation. Background for "Data-Driven Parametric
   Aeroelastic Modeling of the Pazy Wing".

   The model is in js/models/pazy-flutter.js. The scene draws the wing, the
   faint fan of the trims of the range (Fig. 2), the strobe of its recent
   shapes, the trace of the tip velocity (Fig. 7 and Fig. 10), and the chart
   of the growth rate against the angle (Fig. 6) with the flutter band. */

import { withAlpha } from '../ink.js';
import { createPazyWing, PAZY_ASPECT, OBLIQUE } from '../pazy-wing.js';
import { stageFor, drawDatum } from './stage.js';
import { ROOTS, slope as modeSlope } from '../beam-modes-shape.js';
import { caseAt } from './schedule.js';
import { timeToX, drawAxes, drawLine, drawHead } from './chart.js';
import { createPazyFlutterModel, trimTip, inBand, growthAt, GROWTH,
  CASES, HOLD, STROBES, LOG_SECONDS, FLUTTER_BAND, ALPHA_MIN, ALPHA_MAX, LIMIT_SPEED } from '../models/pazy-flutter.js';

const TWO_PI = Math.PI * 2;
const STATIONS = 48;
const TIP_RAW = [2.0, -2.0];


const TWIST_GAIN = 2.2;           // radians of tip twist per span fraction of the second mode, a quarter cycle behind
const FAN = [1, 2, 3, 4, 5, 6, 7, 8];
/* The subject rises above the datum, so the datum sits lower by this
   fraction of the height. */
const RISE = 0.10;




export function createPazyFlutter() {
  const n = STATIONS;
  const wing = createPazyWing(n);
  const model = createPazyFlutterModel((ROOTS[1] * ROOTS[1]) / (ROOTS[0] * ROOTS[0]));
  const slope = [new Float64Array(n + 1), new Float64Array(n + 1)];
  for (let m = 0; m < 2; m++) {
    for (let i = 0; i <= n; i++) slope[m][i] = modeSlope(m, i / n) / TIP_RAW[m];
  }
  const psi = new Float64Array(n + 1);
  const theta = new Float64Array(n + 1);
  const flat = new Float64Array(n + 1);
  const inset = { x: 0, y: 0, w: 0, h: 0 };
  const trace = { x: 0, y: 0, w: 0, h: 0 };
  let stage = null;
  let span = 300;

  /* The trace: the velocity of the tip. The scale is the velocity of the
     limit cycle, so the growth fills the box and the decay empties it. */
  function drawTrace(ctx, ink) {
    const history = model.history;
    if (trace.h <= 0 || history.count < 2) return;
    const midY = trace.y + trace.h / 2;
    const scale = LIMIT_SPEED * 1.15;
    const toX = timeToX(trace, LOG_SECONDS, model.clock);
    const toY = (v) => midY - Math.max(-1, Math.min(1, v / scale)) * (trace.h / 2) * 0.92;

    drawAxes(ctx, ink, trace, midY);

    drawLine(ctx, history, {
      x: (h) => toX(h.t),
      y: (h) => toY(h.v),
      width: 1.2,
      style: ink.body,
    });

    const last = history.last;
    drawHead(ctx, ink.accent, toX(last.t), toY(last.v));
  }

  function slopesFrom(a, b) {
    for (let i = 0; i <= n; i++) psi[i] = a * slope[0][i] + b * slope[1][i];
  }

  /* The twist follows the rate of the second mode: in the coupled mode the
     torsion is a quarter cycle behind the bending. The shape is the first
     torsion mode. */
  function twistFrom() {
    const tip = (TWIST_GAIN * model.q2d) / model.omega2;
    for (let i = 0; i <= n; i++) theta[i] = tip * Math.sin((Math.PI / 2) * (i / n));
  }

  function drawFan(ctx, ink) {
    for (const a of FAN) {
      slopesFrom(trimTip(a), 0);
      wing.axis(ctx, psi, withAlpha(ink.line, 0.22));
    }
  }

  function drawStrobe(ctx, ink) {
    model.strobe.each((s, k) => {
      slopesFrom(s.q1, s.q2);
      wing.axis(ctx, psi, withAlpha(ink.body, (0.05 + 0.2 * (k + 1)) / STROBES));
    });
  }

  /* The inset: the growth rate against the angle, the zero line, the band
     and the marker. */
  function drawInset(ctx, ink) {
    if (inset.w <= 0) return;
    const lo = -8;
    const hi = 3;
    const toX = (a) => inset.x + inset.w * ((a - ALPHA_MIN) / (ALPHA_MAX - ALPHA_MIN));
    const toY = (g) => inset.y + inset.h * (1 - (g - lo) / (hi - lo));

    ctx.fillStyle = withAlpha(ink.accent, 0.08);
    ctx.fillRect(toX(FLUTTER_BAND[0]), inset.y, toX(FLUTTER_BAND[1]) - toX(FLUTTER_BAND[0]), inset.h);

    ctx.beginPath();
    ctx.setLineDash([3, 3]);
    ctx.moveTo(inset.x, toY(0));
    ctx.lineTo(inset.x + inset.w, toY(0));
    ctx.lineWidth = 1;
    ctx.strokeStyle = withAlpha(ink.line, 0.55);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.beginPath();
    ctx.moveTo(inset.x, inset.y);
    ctx.lineTo(inset.x, inset.y + inset.h);
    ctx.lineTo(inset.x + inset.w, inset.y + inset.h);
    ctx.strokeStyle = ink.faint;
    ctx.stroke();

    drawLine(ctx, GROWTH, {
      x: ([a]) => toX(a),
      y: ([, g]) => toY(g),
      width: 1.3,
      style: ink.body,
    });

    const mx = toX(model.alpha);
    const my = toY(growthAt(model.alpha));
    ctx.beginPath();
    ctx.moveTo(mx, inset.y + inset.h);
    ctx.lineTo(mx, my);
    ctx.lineWidth = 1;
    ctx.strokeStyle = withAlpha(ink.accent, 0.4);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(mx, my, 2.8, 0, TWO_PI);
    ctx.fillStyle = ink.accent;
    ctx.fill();
  }

  function paint(ctx, ink) {
    drawDatum(ctx, stage, ink);
    drawFan(ctx, ink);
    drawStrobe(ctx, ink);
    slopesFrom(model.q1, model.q2);
    twistFrom();
    wing.draw(ctx, ink, psi, theta);
    drawTrace(ctx, ink);
    drawInset(ctx, ink);
  }

  return {
    fade: 1,

    /* The control on the lab page. A new angle is a new trim with the
       perturbation of the paper. */
    lab: {
      label: 'Angle of attack',
      unit: '°',
      min: ALPHA_MIN,
      max: ALPHA_MAX,
      step: 0.25,
      value: () => model.alpha,
      set(v) { model.hold(v); },
      release() { model.release(); },
      autoName: 'the four cases of the paper',
      /* What the model does at this moment, for the line below the
         control. In Auto the model sets the parameter; in Hold the
         slider holds the value v. */
      status(isAuto, v) {
        if (!isAuto) {
          return 'Held at ' + v + '°, ' + (inBand(v) ? 'inside' : 'outside') + ' the flutter band of 3° to 4.6°. '
            + 'A new angle is a new trim with the perturbation of one degree. Auto returns to the four cases.';
        }
        const { next, left } = caseAt(model.clock, HOLD, CASES);
        return 'Auto runs the four cases of the paper, 11 seconds each. Now ' + model.alpha + '°, '
          + (inBand(model.alpha) ? 'inside the flutter band: the perturbation grows' : 'outside the band: the perturbation decays')
          + '; next ' + next + '° in ' + left + ' s.';
      },
    },

    /** A few numbers of the state, for a test. */
    probe: model.probe,

    /* Put the model back at its start. The engine calls it before
       it draws a fixed frame after a resize. */
    reset() {
      for (let i = 0; i <= n; i++) flat[i] = 0;
      model.reset(0);
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
      // The trace stands above the chart, and goes if there is no room.
      trace.w = inset.w;
      trace.h = inset.h * 0.85;
      trace.x = inset.x;
      trace.y = inset.y - trace.h - 14;
      if (trace.y < 6) trace.h = 0;

    },

    frame(ctx, dt, t, ink) {
      model.advance(t);
      paint(ctx, ink);
    },

    still(ctx, ink, t) {
      const at = t || 19;   // 8 s into the case at 4 degrees, inside the band
      /* Run from the last perturbation to this time, so the strobe shows
         the growth or the decay. */
      const since = model.heldValue() !== null ? Math.min(at, 6) : at % HOLD;
      model.reset(at - since);
      while (model.clock < at) model.advance(Math.min(model.clock + 0.25, at));
      paint(ctx, ink);
      return at;
    },
  };
}
