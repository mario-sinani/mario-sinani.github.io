/* Scene: the drawing of the coast as the camera sees it, with a new
   solution only at an event. Background for "Coastline Tracking for UAVs
   Using Event-Triggered Image-Based Visual Servoing Nonlinear Model
   Predictive Control".

   The model is in js/models/image-servo.js. The scene draws the frame of
   the camera as a viewfinder, the coast with the sea below it, the box of
   the detection with its four corners, the desired band in the middle, the
   line from each corner to its desired position and to the one the last
   solution predicts, and the chart of the error.

   The thesis has the coast along the vertical axis; the scene turns the
   picture, so the coast runs across the frame as in the view from above. */

import { withAlpha } from '../ink.js';
import { stageFor, drawDatum } from './stage.js';
import { createImageServoModel, DESIRED_BAND, HORIZON, ALONG, NOISE, PLOT_SECONDS, SAMPLES } from '../models/image-servo.js';

const TWO_PI = 6.2832;
const FRAME_RATIO = 720 / 480;  // the camera of the thesis
const GRID_X = 6;
const GRID_Y = 4;

export function createImageServo() {
  const frame = { x: 0, y: 0, w: 0, h: 0 };
  const plot = { x: 0, y: 0, w: 0, h: 0 };
  const coast = { a1: 0, a2: 0, k1: 0, k2: 0 };
  const model = createImageServoModel(frame, coast);
  let stage = null;

  /* One solution gives one velocity command: a proportional law on the
     lateral position of the box and on the tilt, where the thesis solves
     its optimal control problem. */
  function drawFrame(ctx, ink) {
    ctx.beginPath();
    for (let i = 1; i < GRID_X; i++) {
      const x = frame.x + (i / GRID_X) * frame.w;
      ctx.moveTo(x, frame.y);
      ctx.lineTo(x, frame.y + frame.h);
    }
    for (let i = 1; i < GRID_Y; i++) {
      const y = frame.y + (i / GRID_Y) * frame.h;
      ctx.moveTo(frame.x, y);
      ctx.lineTo(frame.x + frame.w, y);
    }
    ctx.lineWidth = 1;
    ctx.strokeStyle = withAlpha(ink.line, 0.09);
    ctx.stroke();

    ctx.beginPath();
    ctx.rect(frame.x, frame.y, frame.w, frame.h);
    ctx.lineWidth = 1;
    ctx.strokeStyle = ink.faint;
    ctx.stroke();

    // The marks at the corners make the frame a viewfinder.
    const c = Math.min(frame.w, frame.h) * 0.09;
    ctx.beginPath();
    for (const [cx, sx] of [[frame.x, 1], [frame.x + frame.w, -1]]) {
      for (const [cy, sy] of [[frame.y, 1], [frame.y + frame.h, -1]]) {
        ctx.moveTo(cx, cy + sy * c);
        ctx.lineTo(cx, cy);
        ctx.lineTo(cx + sx * c, cy);
      }
    }
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = ink.line;
    ctx.stroke();
  }

  /* The coast, the sea below it, and the faint coast beyond the frame: the
     viewfinder is a window on a longer coast. */
  function drawCoast(ctx, d, ink) {
    ctx.beginPath();
    d.pts.forEach((p, i) => { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = withAlpha(ink.line, 0.16);
    ctx.stroke();

    ctx.save();
    ctx.beginPath();
    ctx.rect(frame.x, frame.y, frame.w, frame.h);
    ctx.clip();
    // The sea: a wash from the coast to the bottom of the frame.
    ctx.beginPath();
    d.pts.forEach((p, i) => { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
    const last = d.pts[d.pts.length - 1];
    ctx.lineTo(last.x, frame.y + frame.h + 40);
    ctx.lineTo(d.pts[0].x, frame.y + frame.h + 40);
    ctx.closePath();
    ctx.fillStyle = withAlpha(ink.wash, 0.07);
    ctx.fill();

    ctx.beginPath();
    d.pts.forEach((p, i) => { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = ink.body;
    ctx.stroke();
    ctx.restore();
  }

  /* The desired box in the middle, with a cross at each corner. */
  function drawDesired(ctx, ink) {
    const want = model.desired();
    ctx.beginPath();
    ctx.setLineDash([3, 3]);
    ctx.rect(want[0].x, want[0].y, want[1].x - want[0].x, want[2].y - want[0].y);
    ctx.lineWidth = 1;
    ctx.strokeStyle = withAlpha(ink.line, 0.7);
    ctx.stroke();
    ctx.setLineDash([]);
    const arm = 3.2;
    ctx.beginPath();
    for (const p of want) {
      ctx.moveTo(p.x - arm, p.y);
      ctx.lineTo(p.x + arm, p.y);
      ctx.moveTo(p.x, p.y - arm);
      ctx.lineTo(p.x, p.y + arm);
    }
    ctx.lineWidth = 1;
    ctx.strokeStyle = withAlpha(ink.line, 0.8);
    ctx.stroke();
  }

  /* The box of the detection and its corners as the tracking reports them,
     the line from each corner to its desired position, and where the last
     solution predicts it at the end of the horizon. */
  function drawFeatures(ctx, t, ink) {
    const have = model.measured(t);
    const want = model.desired();
    const ahead = model.predicted(model.lastSolve + HORIZON);

    ctx.beginPath();
    ctx.rect(have[0].x, have[0].y, have[1].x - have[0].x, have[2].y - have[0].y);
    ctx.lineWidth = 1;
    ctx.strokeStyle = withAlpha(ink.accent, 0.6);
    ctx.stroke();

    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      if (Math.hypot(have[i].x - want[i].x, have[i].y - want[i].y) > 2) {
        ctx.moveTo(have[i].x, have[i].y);
        ctx.lineTo(want[i].x, want[i].y);
      }
    }
    ctx.lineWidth = 1;
    ctx.strokeStyle = withAlpha(ink.accent, 0.3);
    ctx.stroke();

    ctx.beginPath();
    ctx.setLineDash([2, 3]);
    for (let i = 0; i < 4; i++) {
      ctx.moveTo(have[i].x, have[i].y);
      ctx.lineTo(ahead[i].x, ahead[i].y);
    }
    ctx.lineWidth = 1;
    ctx.strokeStyle = withAlpha(ink.accent, 0.45);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = ink.accent;
    for (const p of have) ctx.fillRect(p.x - 2.5, p.y - 2.5, 5, 5);
  }

  /* The error with time, and a mark at each solution. */
  function drawPlot(ctx, t, ink) {
    const { errorLog, triggers } = model;
    if (plot.w <= 0 || errorLog.count < 2) return;
    const baseY = plot.y + plot.h;
    const scale = frame.h * 0.3;
    const toX = (when) => plot.x + plot.w * (1 - (t - when) / PLOT_SECONDS);
    const toY = (e) => baseY - Math.min(e / scale, 1) * plot.h;

    ctx.beginPath();
    ctx.moveTo(plot.x, baseY);
    ctx.lineTo(plot.x + plot.w, baseY);
    ctx.moveTo(plot.x, plot.y);
    ctx.lineTo(plot.x, baseY);
    ctx.lineWidth = 1;
    ctx.strokeStyle = ink.faint;
    ctx.stroke();

    const liveE = model.errorNorm(t);
    ctx.beginPath();
    errorLog.each((p, i) => {
      if (i === 0) ctx.moveTo(toX(p.t), toY(p.e)); else ctx.lineTo(toX(p.t), toY(p.e));
    });
    ctx.lineTo(toX(t), toY(liveE));
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = ink.body;
    ctx.stroke();

    triggers.each((at) => {
      const px = toX(at);
      const presence = Math.min(1, (t - at) / 0.3, (px - plot.x) / 14);
      if (presence <= 0) return;
      ctx.beginPath();
      ctx.moveTo(px, baseY);
      ctx.lineTo(px, baseY + 4);
      ctx.lineWidth = 1.1;
      ctx.strokeStyle = withAlpha(ink.accent, presence);
      ctx.stroke();
    });

    ctx.beginPath();
    ctx.arc(toX(t), toY(liveE), 2.4, 0, TWO_PI);
    ctx.fillStyle = ink.accent;
    ctx.fill();
  }

  function paint(ctx, t, ink) {
    const d = model.detect();
    drawCoast(ctx, d, ink);
    drawFrame(ctx, ink);
    ctx.save();
    ctx.beginPath();
    ctx.rect(frame.x - 1, frame.y - 1, frame.w + 2, frame.h + 2);
    ctx.clip();
    drawDesired(ctx, ink);
    drawFeatures(ctx, t, ink);
    ctx.restore();
    drawPlot(ctx, t, ink);
  }

  return {
    fade: 1,   // a drawn figure; the engine clears it each frame

    /* The control on the lab page: the noise of the visual tracking, the
       disturbance the thesis names. */
    lab: {
      label: 'Tracking noise',
      unit: ' px',
      min: 0,
      max: 4,
      step: 0.25,
      value: () => model.noiseLevel(),
      set(v) { model.hold(v); },
      release() { model.release(); },
      autoName: 'a small noise in the tracking',
      /* What the model does at this moment, for the line below the
         control. In Auto the model sets the parameter; in Hold the
         slider holds the value v. */
      status(isAuto, v) {
        if (!isAuto) {
          return 'Noise held at ' + v + ' px. With no noise the events come from the coast, the gusts and the horizon alone. '
            + 'With more noise the tracking departs from the prediction more often, and the solutions come closer together.';
        }
        return 'Auto keeps a noise of ' + NOISE + ' px in the tracking. The events come from the bends of the coast, '
          + 'the gusts, the noise and the horizon of 0.6 s, which is 6 steps of 0.1 s in the thesis.';
      },
    },

    /** A few numbers of the state, for a test. */
    probe: model.probe,

    /* Put the model back at its start. The engine calls it before it
       draws a fixed frame after a resize. */
    reset() {
      model.reset();
    },

    layout(w, h, fit = {}) {
      /* A preview shows the top of the box, so the frame sits in the middle
         of it. */
      const preview = Boolean(fit.preview);
      stage = stageFor(w, h, preview ? 0.5 * (184 / 480) : fit.band);
      const room = w > 760;
      // The frame keeps the ratio of the camera. The room above the datum
      // and the width of the stage limit it, and most of it stands above
      // the datum, so on a hero it stays clear of the text.
      const widthLimit = room ? stage.width * 0.5 : stage.width * 0.56;
      frame.h = Math.min(h * 0.42, (stage.y - 12) / 0.62, widthLimit / FRAME_RATIO);
      frame.w = frame.h * FRAME_RATIO;
      frame.x = preview ? stage.left + (stage.width - frame.w) / 2 : stage.left;
      frame.y = stage.y - frame.h * 0.62;

      plot.w = room ? Math.min(stage.width * 0.17, 170) : 0;
      plot.h = frame.h * 0.62;
      plot.x = stage.right - plot.w;
      plot.y = frame.y + (frame.h - plot.h) / 2;

      // The coast bends on two scales, gently, in the pixels of the image.
      coast.a1 = frame.h * 0.1;
      coast.a2 = frame.h * 0.03;
      coast.k1 = TWO_PI / (frame.w * 2.5);
      coast.k2 = TWO_PI / (frame.w * 1.1);

    },

    frame(ctx, dt, t, ink) {
      if (model.lastTime > t) model.shiftPast(model.lastTime - t);
      model.step(dt, t);
      paint(ctx, t, ink);
    },

    still(ctx, ink, t) {
      /* Run one sequence again, so the fixed frame shows the features and
         the plot with a past. */
      const at = t || 5;
      const seconds = 3.2;
      model.startPast(at, seconds);
      const dt = 0.02;
      for (let k = 1; k <= Math.round(seconds / dt); k++) model.step(dt, at - seconds + k * dt);
      paint(ctx, at, ink);
      return at;
    },
  };
}
