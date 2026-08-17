/* Scene: event-triggered image-based visual servoing. The camera sees
   the coastline, and the controller moves it back to the correct
   position.

   Background for "Coastline Tracking for UAVs Using Event-Triggered
   Image-Based Visual Servoing Nonlinear Model Predictive Control".

   Image-based servoing closes the loop in the image. The error is the
   distance between the position of a feature on the sensor and its
   correct position. The left panel is the sensor. The crosses are the
   correct positions of the features, the dots are their positions at
   this moment, and the curves behind the dots are their trajectories.
   The camera rolls and it also translates, and the trajectories are
   arcs.

   The scene computes the triggering. One solution gives one velocity
   command, and the craft then keeps that command. A new solution runs
   only when the pose moves a set distance from the last solution point,
   or when the horizon ends. The ticks below the error plot are the
   times of the solutions. They are near to each other while the error
   falls quickly, and far from each other while it falls slowly. The
   dashed line in front of each feature shows where the command in use
   moves that feature. */

import { withAlpha } from '../ink.js';
import { stageFor, drawDatum } from './stage.js';

const TWO_PI = 6.2832;
const FEATURES = 9;
const GAIN = 1.45;              // servo gain on the image error
const HORIZON = 0.9;            // seconds a command stays valid for
const DRIFT_TRIGGER = 0.055;    // pose drift, as a fraction of frame height
const KICK_SECONDS = 7;         // how often the view is knocked off
const KICK_RAMP = 0.6;          // seconds the gust takes to land
const TRAIL_SECONDS = 2.6;
const SAMPLE_STEP = 0.04;       // seconds between trail and plot samples
const PLOT_SECONDS = 8;
const GRID_X = 8;
const GRID_Y = 4;

export function createImageServo() {
  const frame = { x: 0, y: 0, w: 0, h: 0 };
  const plot = { x: 0, y: 0, w: 0, h: 0 };
  const pose = { u: 0, v: 0, roll: 0 };
  const held = { u: 0, v: 0, roll: 0 };
  const atSolve = { u: 0, v: 0, roll: 0 };
  let stage = null;
  let trails = [];
  let errorLog = [];
  let triggers = [];
  let lastSolve = -99;
  let lastSample = -99;
  let nextKick = 1.4;
  let kicks = 0;
  let kickAt = -99;
  const kickFrom = { u: 0, v: 0, roll: 0 };
  const kickTo = { u: 0, v: 0, roll: 0 };

  /** The contour in the coordinates of the sensor: a smooth curve
      across the view. */
  function shoreY(u) {
    return Math.sin(u * 3.1) * 0.17 + Math.sin(u * 6.7 + 0.9) * 0.07;
  }

  function desiredPoint(u) {
    return {
      x: frame.x + u * frame.w,
      y: frame.y + frame.h / 2 + shoreY(u) * frame.h,
    };
  }

  /* Project a point through the pose of the camera. The roll is around
     the centre of the sensor, and a feature moves along an arc. */
  function project(point, at) {
    const cx = frame.x + frame.w / 2;
    const cy = frame.y + frame.h / 2;
    const dx = point.x - cx;
    const dy = point.y - cy;
    const c = Math.cos(at.roll);
    const s = Math.sin(at.roll);
    return {
      x: cx + dx * c - dy * s + at.u,
      y: cy + dx * s + dy * c + at.v,
    };
  }

  function featureU(i) {
    return (i + 0.5) / FEATURES;
  }

  function imagePoint(u, at) {
    return project(desiredPoint(u), at || pose);
  }

  /** The mean distance between the position of a feature and its
      correct position. */
  function errorNorm() {
    let sum = 0;
    for (let i = 0; i < FEATURES; i++) {
      const u = featureU(i);
      const want = desiredPoint(u);
      const have = imagePoint(u);
      sum += Math.hypot(have.x - want.x, have.y - want.y);
    }
    return sum / FEATURES;
  }

  /* One solution gives one velocity command. The next solution runs
     when the pose moves a sufficient distance from the last solution
     point, or when the horizon ends. This is the event. */
  function solve(t) {
    held.u = -GAIN * pose.u;
    held.v = -GAIN * pose.v;
    held.roll = -GAIN * pose.roll;
    atSolve.u = pose.u;
    atSolve.v = pose.v;
    atSolve.roll = pose.roll;
    lastSolve = t;
    triggers.push(t);
    while (triggers.length && t - triggers[0] > PLOT_SECONDS) triggers.shift();
  }

  function drift() {
    return Math.hypot(pose.u - atSolve.u, pose.v - atSolve.v)
      + Math.abs(pose.roll - atSolve.roll) * frame.h * 0.5;
  }

  function step(dt, t) {
    if (t > nextKick) {
      /* The disturbance is a gust, and the pose does not move
         suddenly. A smooth ramp moves the pose to its new value. The
         trails continue, and the movement is then part of the
         trajectory on the screen. */
      kicks += 1;
      kickFrom.u = pose.u;
      kickFrom.v = pose.v;
      kickFrom.roll = pose.roll;
      // The values are deterministic, and the rhythm stays constant.
      kickTo.u = frame.w * 0.16 * Math.sin(kicks * 2.4);
      kickTo.v = frame.h * 0.42 * Math.cos(kicks * 1.1);
      kickTo.roll = 0.2 * Math.sin(kicks * 1.7);
      kickAt = t;
      nextKick = t + KICK_SECONDS;
    }

    if (t - kickAt < KICK_RAMP) {
      const s = Math.min((t - kickAt) / KICK_RAMP, 1);
      const e = s * s * (3 - 2 * s);
      pose.u = kickFrom.u + (kickTo.u - kickFrom.u) * e;
      pose.v = kickFrom.v + (kickTo.v - kickFrom.v) * e;
      pose.roll = kickFrom.roll + (kickTo.roll - kickFrom.roll) * e;
      // The controller calculates a new solution at the end of the
      // gust.
      lastSolve = -99;
    } else {
      if (t - lastSolve > HORIZON || drift() > DRIFT_TRIGGER * frame.h) solve(t);
      // Between two solutions the loop is open, and the command does
      // not change.
      pose.u += held.u * dt;
      pose.v += held.v * dt;
      pose.roll += held.roll * dt;
    }

    if (t - lastSample < SAMPLE_STEP) return;
    lastSample = t;
    for (let i = 0; i < FEATURES; i++) {
      trails[i].push(imagePoint(featureU(i)));
      while (trails[i].length > TRAIL_SECONDS / SAMPLE_STEP) trails[i].shift();
    }
    errorLog.push({ t, e: errorNorm() });
    while (errorLog.length && t - errorLog[0].t > PLOT_SECONDS) errorLog.shift();
  }

  function drawFrame(ctx, ink) {
    // The grid of pixels that gives the scale for the features.
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

    // The marks at the corners make the frame look like a viewfinder.
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

  /* The contour continues past the edges of the sensor, because a roll
     must not move its ends into the view. */
  function traceContour(ctx, at, from = -0.3, to = 1.3) {
    ctx.beginPath();
    const span = to - from;
    for (let i = 0; i <= 128; i++) {
      const u = from + (span * i) / 128;
      const p = at ? imagePoint(u, at) : desiredPoint(u);
      if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    }
  }

  /* Draw the coastline faint outside the sensor. The viewfinder is a
     window on a longer coast, and the craft uses only the part that it
     can see. */
  function drawBeyond(ctx, ink) {
    traceContour(ctx, pose, -2.2, 3.2);
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = withAlpha(ink.line, 0.16);
    ctx.stroke();
  }

  function drawContours(ctx, ink) {
    traceContour(ctx, null);
    ctx.setLineDash([3, 4]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = ink.faint;
    ctx.stroke();
    ctx.setLineDash([]);

    traceContour(ctx, pose);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = ink.body;
    ctx.stroke();
  }

  /** The positions of the features if the command in use continues
      with no change. */
  function drawHorizon(ctx, ink) {
    const ahead = {
      u: pose.u + held.u * HORIZON,
      v: pose.v + held.v * HORIZON,
      roll: pose.roll + held.roll * HORIZON,
    };
    ctx.beginPath();
    for (let i = 0; i < FEATURES; i++) {
      const u = featureU(i);
      const from = imagePoint(u);
      const to = imagePoint(u, ahead);
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
    }
    ctx.setLineDash([2, 3]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = withAlpha(ink.accent, 0.45);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  /** The path of each feature across the sensor. */
  function drawTrails(ctx, ink) {
    for (let i = 0; i < FEATURES; i++) {
      const path = trails[i];
      if (path.length < 2) continue;
      ctx.beginPath();
      for (let k = 0; k < path.length; k++) {
        if (k === 0) ctx.moveTo(path[k].x, path[k].y);
        else ctx.lineTo(path[k].x, path[k].y);
      }
      ctx.lineWidth = 1;
      ctx.strokeStyle = withAlpha(ink.accent, 0.38);
      ctx.stroke();
    }
  }

  function drawFeatures(ctx, ink) {
    const arm = 3.2;
    for (let i = 0; i < FEATURES; i++) {
      const u = featureU(i);
      const want = desiredPoint(u);
      const have = imagePoint(u);

      ctx.beginPath();
      ctx.moveTo(want.x - arm, want.y);
      ctx.lineTo(want.x + arm, want.y);
      ctx.moveTo(want.x, want.y - arm);
      ctx.lineTo(want.x, want.y + arm);
      ctx.lineWidth = 1;
      ctx.strokeStyle = withAlpha(ink.line, 0.7);
      ctx.stroke();

      if (Math.hypot(have.x - want.x, have.y - want.y) > 2) {
        ctx.beginPath();
        ctx.moveTo(have.x, have.y);
        ctx.lineTo(want.x, want.y);
        ctx.lineWidth = 1;
        ctx.strokeStyle = withAlpha(ink.accent, 0.3);
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.arc(have.x, have.y, 2.3, 0, TWO_PI);
      ctx.fillStyle = ink.accent;
      ctx.fill();
    }
  }

  /* The error with time, and the times when the controller calculated
     a new command. */
  function drawPlot(ctx, t, ink) {
    if (plot.w <= 0 || errorLog.length < 2) return;
    const baseY = plot.y + plot.h;
    const scale = frame.h * 0.55;
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

    /* A clock samples the log. The curve ends at the error at this
       moment, and the head moves in each frame. */
    const liveE = errorNorm();
    ctx.beginPath();
    for (let i = 0; i < errorLog.length; i++) {
      const px = toX(errorLog[i].t);
      const py = toY(errorLog[i].e);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.lineTo(toX(t), toY(liveE));
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = ink.body;
    ctx.stroke();

    for (const at of triggers) {
      const px = toX(at);
      // Fade in at the start. Fade out at the left edge of the plot.
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
    drawBeyond(ctx, ink);
    drawFrame(ctx, ink);
    // The sensor is the limit for each item on it.
    ctx.save();
    ctx.beginPath();
    ctx.rect(frame.x, frame.y, frame.w, frame.h);
    ctx.clip();
    drawContours(ctx, ink);
    drawTrails(ctx, ink);
    drawHorizon(ctx, ink);
    drawFeatures(ctx, ink);
    ctx.restore();
    drawPlot(ctx, t, ink);
  }

  function reset() {
    pose.u = 0;
    pose.v = 0;
    pose.roll = 0;
    held.u = 0;
    held.v = 0;
    held.roll = 0;
    lastSolve = -99;
    lastSample = -99;
    kicks = 0;
    kickAt = -99;
    trails = Array.from({ length: FEATURES }, () => []);
    errorLog = [];
    triggers = [];
  }

  return {
    fade: 1,   // a drawn figure; the engine clears it each frame

    layout(w, h) {
      stage = stageFor(w, h);
      frame.w = Math.min(stage.width * 0.52, 620);
      frame.h = Math.min(h * 0.16, frame.w * 0.46);
      frame.x = stage.left;
      // Put the panel above the centre of the band, because the
      // viewfinder is the highest element in these scenes.
      frame.y = stage.y - h * 0.03 - frame.h / 2;

      const room = w > 760;
      plot.w = room ? Math.min(stage.width * 0.15, 170) : 0;
      plot.h = frame.h * 0.62;
      plot.x = stage.right - plot.w;
      plot.y = stage.y - h * 0.03 - plot.h / 2;

      reset();
      nextKick = 1.4;
    },

    frame(ctx, dt, t, ink) {
      step(dt, t);
      paint(ctx, t, ink);
    },

    still(ctx, ink, t) {
      /* Do one sequence again, because the fixed frame must show the
         trajectories and the plot. */
      const at = t || 5;
      reset();
      nextKick = at + 999;
      pose.u = frame.w * 0.14;
      pose.v = frame.h * 0.4;
      pose.roll = 0.17;
      solve(at - 3.2);
      const dt = 0.02;
      for (let k = 1; k <= Math.round(3.2 / dt); k++) step(dt, at - 3.2 + k * dt);
      paint(ctx, at, ink);
    },
  };
}
