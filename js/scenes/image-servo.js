/* Scene: event-triggered image-based visual servoing - the coastline as
   the camera sees it, driven back onto where it belongs.

   Behind "Coastline Tracking for UAVs Using Event-Triggered Image-Based
   Visual Servoing Nonlinear Model Predictive Control".

   Image-based servoing closes the loop in the image itself: the error is
   the gap between where the features sit on the sensor and where they
   should sit, and the controller works on that directly rather than on any
   reconstructed position. So the left panel is the sensor. The crosses are
   the desired feature positions, the dots are where the features actually
   are, and the curves behind them are the path each has taken across the
   image - the trajectory plot this method is always shown with. Because
   the camera rolls as well as translates, those paths are arcs rather than
   straight runs.

   The triggering is the other half of the title, and it is real here. One
   solve fixes one velocity command, which is then held; a new one is only
   computed once the pose has drifted a set distance from where it was
   solved, or the horizon expires. That is why the ticks under the error
   plot crowd together while the error is steep and thin out as it flattens
   - the whole point of triggering on events rather than on a clock. The
   short dashed continuation ahead of each feature is where the command
   currently being held would carry it. */

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

  /** The contour in sensor coordinates: a gentle meander across the view. */
  function shoreY(u) {
    return Math.sin(u * 3.1) * 0.17 + Math.sin(u * 6.7 + 0.9) * 0.07;
  }

  function desiredPoint(u) {
    return {
      x: frame.x + u * frame.w,
      y: frame.y + frame.h / 2 + shoreY(u) * frame.h,
    };
  }

  /* Where a point actually lands, given the camera's pose. Roll is about
     the centre of the sensor, so features sweep arcs rather than sliding
     straight - which is what makes the trajectory plot worth drawing. */
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

  /** Mean distance between where the features are and where they belong. */
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

  /* One solve fixes one velocity command. Nothing is recomputed until the
     pose has drifted far enough from where it was solved, or the horizon
     runs out - and that is the event, rather than a fixed control period. */
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
      /* The knock-off is a gust, not a teleport: the pose is carried to
         its displaced value over a short eased ramp, and the trails are
         left running so the excursion itself is drawn - being knocked
         off is part of the trajectory, not a scene change. */
      kicks += 1;
      kickFrom.u = pose.u;
      kickFrom.v = pose.v;
      kickFrom.roll = pose.roll;
      // Deterministic rather than random, so the rhythm stays calm.
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
      // The controller solves the moment the gust lets go.
      lastSolve = -99;
    } else {
      if (t - lastSolve > HORIZON || drift() > DRIFT_TRIGGER * frame.h) solve(t);
      // Held open loop between solves: the command does not change.
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
    // The pixel grid the features are measured against.
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

    // Corner marks, so it reads as a viewfinder rather than a box.
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

  /* The contour runs past the edges of the sensor, so rolling the camera
     never pulls its ends into view. */
  function traceContour(ctx, at, from = -0.3, to = 1.3) {
    ctx.beginPath();
    const span = to - from;
    for (let i = 0; i <= 128; i++) {
      const u = from + (span * i) / 128;
      const p = at ? imagePoint(u, at) : desiredPoint(u);
      if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    }
  }

  /* The coastline carries on past the sensor in both directions. Drawing
     it makes the viewfinder read as a window onto something longer, which
     is what it is - the vehicle only ever servos on the part it can see. */
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

  /** Where the held command would carry the features if nothing changed. */
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

  /** Each feature's path across the sensor. */
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

  /* The error being driven out, and the instants at which a new command
     was actually computed. */
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

    /* The log is sampled on a clock, but the curve ends at the live
       error, so the head moves every frame. */
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
      // Born fading in, and gone fading out at the plot's left edge.
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
    // Everything that lives on the sensor is bounded by it.
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
    fade: 1,   // a drawn scene rather than a trailing one: no ghosting

    layout(w, h) {
      stage = stageFor(w, h);
      frame.w = Math.min(stage.width * 0.52, 620);
      frame.h = Math.min(h * 0.16, frame.w * 0.46);
      frame.x = stage.left;
      // Sat a little above the band's centre: the viewfinder is the
      // tallest thing any of these scenes draws.
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
      /* Replay a settling episode, so the trajectories and the plot are
         there to read rather than empty. */
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
