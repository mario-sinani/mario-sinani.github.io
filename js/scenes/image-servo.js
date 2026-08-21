/* Scene: the coast as the camera sees it, and a new solution only at an
   event. Background for "Coastline Tracking for UAVs Using Event-Triggered
   Image-Based Visual Servoing Nonlinear Model Predictive Control".

   A network detects the coastline in the image and gives its bounding box,
   and the four corners are the features. Their desired positions are the
   corners of a narrow box across the middle, and they slide along the
   frame, so the craft moves along the coast. The thesis has the coast along
   the vertical axis; the scene turns the picture, so the coast runs across
   the frame as in the view from above.

   Between two solutions the camera keeps the last velocity in an open loop.
   It solves again when the measured features depart from the predicted ones
   by more than a bound that scales with the error, or when the horizon of
   six steps ends. The control is the noise of the tracking, which the
   thesis names as the disturbance. The scene solves no optimal control
   problem: a proportional law stands in for it. */

import { withAlpha } from '../ink.js';
import { stageFor, drawDatum } from './stage.js';

const TWO_PI = 6.2832;
const FRAME_RATIO = 720 / 480;  // the camera of the thesis
const DESIRED_BAND = 40 / 480;  // the desired box: 40 pixels of the 480 across the coast
const HORIZON = 0.6;            // seconds a solution stays valid for: 6 steps of 0.1 s in the thesis
const ALONG = 40;               // px/s the desired features slide along the frame
const GAIN_U = 1.6;             // 1/s on the lateral error
const GAIN_ROLL = 1.4;          // 1/s on the tilt
/* The triggering condition: the departure of the measured features from the
   predicted ones stays under a floor in pixels plus a fraction of the image
   error. */
const SIGMA = 0.25;
const FLOOR = 2.5;
const NOISE = 1.5;              // pixels of noise in the visual tracking, unless the lab holds it
const KICK_SECONDS = 9;         // how often a gust moves the craft
const KICK_RAMP = 0.7;          // seconds the gust takes to land
const PLOT_SECONDS = 8;
const SAMPLE_STEP = 0.04;
const GRID_X = 6;
const GRID_Y = 4;
const SAMPLES = 64;             // points of the coast along the frame

export function createImageServo() {
  const frame = { x: 0, y: 0, w: 0, h: 0 };
  const plot = { x: 0, y: 0, w: 0, h: 0 };
  const coast = { a1: 0, a2: 0, k1: 0, k2: 0 };
  /* The pose of the camera: the lateral offset from the coast, the roll,
     and the position along the coast, in pixels. */
  const pose = { u: 0, roll: 0, s: 0 };
  const held = { u: 0, roll: 0 };
  const atSolve = { u: 0, roll: 0, s: 0, corners: [] };
  const kickFrom = { u: 0, roll: 0 };
  const kickTo = { u: 0, roll: 0 };
  let stage = null;
  let errorLog = [];
  let triggers = [];
  let events = 0;
  let lastSolve = -99;
  let lastSample = -99;
  let nextKick = 2;
  let kicks = 0;
  let kickAt = -99;
  let lastTime = 0;
  /* The lab can hold the noise. null uses the constant. */
  let heldNoise = null;

  function noiseLevel() {
    return heldNoise !== null ? heldNoise : NOISE;
  }

  /** The lateral position of the coast at a point along it. */
  function coastAt(s) {
    return coast.a1 * Math.sin(coast.k1 * s) + coast.a2 * Math.sin(coast.k2 * s + 1.3);
  }

  function centre() {
    return { x: frame.x + frame.w / 2, y: frame.y + frame.h / 2 };
  }

  /** A point of the coast in the image, through the pose. The coast runs
      across the frame, the lateral offset is down it, and the roll turns
      the image about its centre. */
  function project(s, at) {
    const c = centre();
    const along = s - at.s;
    const lateral = coastAt(s) - at.u;
    const cr = Math.cos(at.roll);
    const sr = Math.sin(at.roll);
    return { x: c.x + along * cr - lateral * sr, y: c.y + along * sr + lateral * cr };
  }

  /** The coast in the frame: its points, and the box of the detection, with
      the lateral position and the tilt. */
  function detect(at) {
    const pts = [];
    let vMin = Infinity;
    let vMax = -Infinity;
    let vLeft = 0;
    let vRight = 0;
    const left = frame.x;
    const right = frame.x + frame.w;
    for (let i = 0; i <= SAMPLES; i++) {
      const s = at.s + (i / SAMPLES - 0.5) * frame.w * 1.6;
      const p = project(s, at);
      pts.push(p);
      if (p.x >= left && p.x <= right) {
        vMin = Math.min(vMin, p.y);
        vMax = Math.max(vMax, p.y);
      }
    }
    // The lateral position at each edge of the frame.
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      if ((a.x - left) * (b.x - left) <= 0 && a.x !== b.x) vLeft = a.y + ((left - a.x) * (b.y - a.y)) / (b.x - a.x);
      if ((a.x - right) * (b.x - right) <= 0 && a.x !== b.x) vRight = a.y + ((right - a.x) * (b.y - a.y)) / (b.x - a.x);
    }
    if (!Number.isFinite(vMin)) { vMin = centre().y; vMax = centre().y; }
    vMin = Math.max(vMin, frame.y);
    vMax = Math.min(vMax, frame.y + frame.h);
    return {
      pts,
      corners: [{ x: left, y: vMin }, { x: right, y: vMin }, { x: left, y: vMax }, { x: right, y: vMax }],
      boxV: (vMin + vMax) / 2,
      tilt: Math.atan2(vRight - vLeft, frame.w),
    };
  }

  /** The desired features: the corners of the band across the middle. */
  function desired() {
    const c = centre();
    const half = (frame.h * DESIRED_BAND) / 2;
    return [
      { x: frame.x, y: c.y - half }, { x: frame.x + frame.w, y: c.y - half },
      { x: frame.x, y: c.y + half }, { x: frame.x + frame.w, y: c.y + half },
    ];
  }

  /** The noise of the tracking on one corner: small, smooth and
      deterministic. */
  function jitter(i, t) {
    const n = noiseLevel();
    return { x: n * Math.sin(9.7 * t + i * 1.7), y: n * Math.sin(12.3 * t + i * 2.3) };
  }

  function measured(t) {
    return detect(pose).corners.map((p, i) => {
      const j = jitter(i, t);
      return { x: p.x + j.x, y: p.y + j.y };
    });
  }

  /** The mean distance between the features and their desired positions. */
  function errorNorm(t) {
    const want = desired();
    const have = measured(t);
    let sum = 0;
    for (let i = 0; i < 4; i++) sum += Math.hypot(have[i].x - want[i].x, have[i].y - want[i].y);
    return sum / 4;
  }

  /** The features as the last solution predicts them: the features it
      measured, moved by its own command since then. The lateral velocity
      moves all four down or up, and the roll moves the left corners against
      the right. The model knows nothing of the coast ahead, so a bend takes
      the real features off this prediction. */
  function predicted(t) {
    const dt = t - lastSolve;
    const cx = centre().x;
    return atSolve.corners.map((p) => ({
      x: p.x,
      y: p.y - held.u * dt + (p.x > cx ? 1 : -1) * held.roll * dt * (frame.w / 2),
    }));
  }

  function departure(t) {
    if (!atSolve.corners.length) return Infinity;
    const have = measured(t);
    const guess = predicted(t);
    let sum = 0;
    for (let i = 0; i < 4; i++) sum += Math.hypot(have[i].x - guess[i].x, have[i].y - guess[i].y);
    return sum / 4;
  }

  /* One solution gives one velocity command: a proportional law on the
     lateral position of the box and on the tilt, where the thesis solves
     its optimal control problem. */
  function solve(t) {
    const d = detect(pose);
    const c = centre();
    held.u = GAIN_U * (d.boxV - c.y);
    // A positive roll turns the right of the image down, and adds to a
    // positive tilt. The command turns the other way.
    held.roll = -GAIN_ROLL * d.tilt;
    atSolve.u = pose.u;
    atSolve.roll = pose.roll;
    atSolve.s = pose.s;
    atSolve.corners = measured(t);
    lastSolve = t;
    events += 1;
    triggers.push(t);
    while (triggers.length && t - triggers[0] > PLOT_SECONDS) triggers.shift();
  }

  function step(dt, t) {
    if (t > nextKick) {
      /* The gust moves the pose on a smooth ramp, and not suddenly. The
         values are deterministic, and the rhythm is constant. */
      kicks += 1;
      kickFrom.u = 0;
      kickFrom.roll = 0;
      kickTo.u = frame.h * 0.12 * Math.sin(kicks * 2.4);
      kickTo.roll = 0.16 * Math.sin(kicks * 1.7);
      kickAt = t;
      nextKick = t + KICK_SECONDS;
    }

    /* The event: the measured features against the predicted ones, with a
       bound that scales with the image error. The horizon is the other
       event. */
    if (t - lastSolve > HORIZON || departure(t) > FLOOR + SIGMA * errorNorm(t)) solve(t);

    // Between two solutions the loop is open and the command holds. The
    // craft moves along the coast at the set rate, and the gust moves it as
    // well.
    pose.u += held.u * dt;
    pose.roll += held.roll * dt;
    pose.s += ALONG * dt;
    if (t - kickAt < KICK_RAMP) {
      const s0 = Math.max(Math.min((t - dt - kickAt) / KICK_RAMP, 1), 0);
      const s1 = Math.min((t - kickAt) / KICK_RAMP, 1);
      const e0 = s0 * s0 * (3 - 2 * s0);
      const e1 = s1 * s1 * (3 - 2 * s1);
      pose.u += (kickTo.u - kickFrom.u) * (e1 - e0);
      pose.roll += (kickTo.roll - kickFrom.roll) * (e1 - e0);
    }

    lastTime = t;
    if (t - lastSample < SAMPLE_STEP) return;
    lastSample = t;
    errorLog.push({ t, e: errorNorm(t) });
    while (errorLog.length && t - errorLog[0].t > PLOT_SECONDS) errorLog.shift();
  }

  /** Move the past with the clock, if the clock goes back. */
  function shiftPast(by) {
    errorLog.forEach((p) => { p.t -= by; });
    triggers = triggers.map((x) => x - by);
    lastSolve -= by;
    lastSample -= by;
    kickAt -= by;
    nextKick -= by;
    lastTime -= by;
  }

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
    const want = desired();
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
    const have = measured(t);
    const want = desired();
    const ahead = predicted(lastSolve + HORIZON);

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
    if (plot.w <= 0 || errorLog.length < 2) return;
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

    const liveE = errorNorm(t);
    ctx.beginPath();
    errorLog.forEach((p, i) => {
      if (i === 0) ctx.moveTo(toX(p.t), toY(p.e)); else ctx.lineTo(toX(p.t), toY(p.e));
    });
    ctx.lineTo(toX(t), toY(liveE));
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = ink.body;
    ctx.stroke();

    for (const at of triggers) {
      const px = toX(at);
      const presence = Math.min(1, (t - at) / 0.3, (px - plot.x) / 14);
      if (presence <= 0) continue;
      ctx.beginPath();
      ctx.moveTo(px, baseY);
      ctx.lineTo(px, baseY + 4);
      ctx.lineWidth = 1.1;
      ctx.strokeStyle = withAlpha(ink.accent, presence);
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(toX(t), toY(liveE), 2.4, 0, TWO_PI);
    ctx.fillStyle = ink.accent;
    ctx.fill();
  }

  function paint(ctx, t, ink) {
    const d = detect(pose);
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

  function reset() {
    pose.u = 0;
    pose.roll = 0;
    pose.s = 0;
    held.u = 0;
    held.roll = 0;
    lastSolve = -99;
    lastSample = -99;
    kicks = 0;
    kickAt = -99;
    nextKick = 2;
    errorLog = [];
    triggers = [];
    lastTime = 0;
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
      value: () => noiseLevel(),
      set(v) { heldNoise = v; },
      release() { heldNoise = null; },
      auto: {
        name: 'a small noise in the tracking',
        status() {
          return 'Auto keeps a noise of ' + NOISE + ' px in the tracking. The events come from the bends of the coast, '
            + 'the gusts, the noise and the horizon of 0.6 s, which is 6 steps of 0.1 s in the thesis.';
        },
      },
      hold(v) {
        return 'Noise held at ' + v + ' px. With no noise the events come from the coast, the gusts and the horizon alone. '
          + 'With more noise the tracking departs from the prediction more often, and the solutions come closer together.';
      },
    },

    /** A few numbers of the state, for a test. */
    probe() {
      return { events, noise: noiseLevel(), error: errorNorm(lastTime), along: pose.s };
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

      reset();
    },

    frame(ctx, dt, t, ink) {
      if (lastTime > t) shiftPast(lastTime - t);
      step(dt, t);
      paint(ctx, t, ink);
    },

    still(ctx, ink, t) {
      /* Run one sequence again, so the fixed frame shows the features and
         the plot with a past. */
      const at = t || 5;
      reset();
      pose.u = frame.h * 0.1;
      pose.roll = 0.12;
      nextKick = at - 3.2 + 1.5;
      const dt = 0.02;
      lastSample = at - 3.2 - 1;
      for (let k = 1; k <= Math.round(3.2 / dt); k++) step(dt, at - 3.2 + k * dt);
      paint(ctx, at, ink);
      return at;
    },
  };
}
