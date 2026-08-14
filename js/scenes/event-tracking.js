/* Scene: a multirotor tracking a contour, replanning only when it has to.

   Behind "An Event-Triggered Visual Servoing Predictive Control Strategy
   for the Surveillance of Contour-Based Areas using Multirotor Aerial
   Vehicles".

   The triggering is real rather than staged: the vehicle follows the last
   plan open loop, and a new optimal control problem is solved only when
   the tracking error crosses a threshold or the horizon runs out. That is
   why the ticks along the rail fall unevenly - they bunch up where the
   coastline turns and thin out where it runs straight, which is exactly
   the saving the scheme is after.

   The ground is drawn the way a chart draws it: offset copies of the
   coastline standing in for depth contours, which also gives the eye
   something to read the vehicle's motion against. */

import { withAlpha } from '../ink.js';
import { stageFor, drawDatum } from './stage.js';

const TWO_PI = 6.2832;
const DRIFT = 46;               // px/s the world scrolls beneath the vehicle
const HORIZON = 1.5;            // seconds a plan is valid for
const ERROR_TRIGGER = 0.055;    // fraction of canvas height
const MAX_TICKS = 42;
const TRACK_SECONDS = 9;        // how much flown path is kept
const CONTOURS = 6;             // depth lines below the shore
const STEP = 6;                 // px between samples along a curve

export function createEventTracking() {
  const view = { w: 0, h: 0 };
  const shore = { y: 0, a1: 0, a2: 0, k1: 0, k2: 0, spacing: 9 };
  const craft = { x: 0, y: 0, standoff: 0, span: 0 };
  const plan = { from: 0, to: 0, at: -99 };
  let stage = null;
  let ticks = [];
  let track = [];

  /** The contour, in world coordinates that scroll leftward over time. */
  function shoreAt(x, t) {
    const s = x + DRIFT * t;
    return shore.y + shore.a1 * Math.sin(shore.k1 * s) + shore.a2 * Math.sin(shore.k2 * s + 1.3);
  }

  /** Where the vehicle should sit: a fixed standoff above the contour. */
  function target(t) {
    return shoreAt(craft.x, t) - craft.standoff;
  }

  function replan(t) {
    plan.from = craft.y;
    // Aim at where the contour will have moved to by the end of the horizon.
    plan.to = target(t + HORIZON);
    plan.at = t;
  }

  function follow(t) {
    const age = t - plan.at;
    const error = Math.abs(craft.y - target(t));
    if (age > HORIZON || error > ERROR_TRIGGER * view.h) {
      replan(t);
      ticks.push(t);
      if (ticks.length > MAX_TICKS) ticks.shift();
    } else {
      // Open loop between triggers: no feedback, just the stored trajectory.
      const s = Math.min(age / HORIZON, 1);
      craft.y = plan.from + (plan.to - plan.from) * (s * s * (3 - 2 * s));
    }
    track.push({ t, y: craft.y });
    while (track.length && t - track[0].t > TRACK_SECONDS) track.shift();
  }

  function traceShore(ctx, t, drop) {
    ctx.beginPath();
    for (let x = -STEP; x <= view.w + STEP; x += STEP) {
      const y = shoreAt(x, t) + drop;
      if (x === -STEP) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
  }

  /* Depth contours: the same coastline offset downward, fading as it goes,
     so the land side has the texture of a chart rather than being blank. */
  function drawContours(ctx, t, ink) {
    for (let i = CONTOURS; i >= 1; i--) {
      traceShore(ctx, t, i * shore.spacing);
      ctx.lineWidth = 1;
      ctx.strokeStyle = withAlpha(ink.line, 0.3 * (1 - (i - 1) / CONTOURS));
      ctx.stroke();
    }
  }

  function drawShore(ctx, t, ink) {
    traceShore(ctx, t, 0);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = ink.line;
    ctx.stroke();
  }

  /* The camera footprint, and the stretch of coastline currently inside
     it: what the controller actually has to work with. */
  function drawFootprint(ctx, t, ink) {
    const spread = craft.standoff * 0.8;
    ctx.beginPath();
    ctx.moveTo(craft.x, craft.y);
    ctx.lineTo(craft.x - spread, shoreAt(craft.x - spread, t));
    ctx.lineTo(craft.x + spread, shoreAt(craft.x + spread, t));
    ctx.closePath();
    ctx.fillStyle = withAlpha(ink.accent, 0.07);
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = ink.faint;
    ctx.stroke();

    ctx.beginPath();
    for (let x = craft.x - spread; x <= craft.x + spread; x += 3) {
      const y = shoreAt(x, t);
      if (x === craft.x - spread) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.lineWidth = 2;
    ctx.strokeStyle = ink.accent;
    ctx.stroke();
  }

  /** Where the vehicle has actually been, scrolling away behind it. */
  function drawTrack(ctx, t, ink) {
    if (track.length < 2) return;
    ctx.beginPath();
    for (let i = 0; i < track.length; i++) {
      const x = craft.x - (t - track[i].t) * DRIFT;
      if (i === 0) ctx.moveTo(x, track[i].y); else ctx.lineTo(x, track[i].y);
    }
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = withAlpha(ink.body, 0.45);
    ctx.stroke();
  }

  function drawPlan(ctx, t, ink) {
    ctx.beginPath();
    ctx.setLineDash([4, 4]);
    for (let i = 0; i <= 12; i++) {
      const ahead = (i / 12) * HORIZON;
      const x = craft.x + ahead * DRIFT;
      const y = target(t + ahead);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.lineWidth = 1;
    ctx.strokeStyle = ink.accent;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawCraft(ctx, ink) {
    const arm = craft.span / 2;
    ctx.beginPath();
    ctx.moveTo(craft.x - arm, craft.y);
    ctx.lineTo(craft.x + arm, craft.y);
    ctx.moveTo(craft.x, craft.y);
    ctx.lineTo(craft.x, craft.y + 4);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = ink.body;
    ctx.stroke();
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(craft.x + side * arm, craft.y - 1, 4.6, 1.6, 0, 0, TWO_PI);
      ctx.lineWidth = 1.3;
      ctx.strokeStyle = ink.accent;
      ctx.stroke();
    }
  }

  /* Every solve leaves a mark on the rail, and the marks scroll away with
     the world, so the uneven spacing of the triggers is visible. */
  function drawTicks(ctx, t, ink) {
    const railY = shore.y + shore.a1 + CONTOURS * shore.spacing + view.h * 0.022;
    // The rail spans the text column below, not the whole viewport.
    ctx.beginPath();
    ctx.moveTo(stage.left, railY);
    ctx.lineTo(stage.right, railY);
    ctx.lineWidth = 1;
    ctx.strokeStyle = ink.faint;
    ctx.stroke();

    ctx.beginPath();
    for (const at of ticks) {
      const x = craft.x - (t - at) * DRIFT;
      if (x < stage.left) continue;
      ctx.moveTo(x, railY - 4);
      ctx.lineTo(x, railY + 4);
    }
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = ink.accent;
    ctx.stroke();
  }

  return {
    fade: 1,   // a drawn scene rather than a trailing one: no ghosting

    layout(w, h) {
      view.w = w;
      view.h = h;
      stage = stageFor(w, h);
      shore.y = stage.y - h * 0.03;
      shore.a1 = h * 0.022;
      shore.a2 = h * 0.011;
      shore.k1 = TWO_PI / Math.max(w * 0.55, 260);
      shore.k2 = TWO_PI / Math.max(w * 0.21, 110);
      shore.spacing = Math.max(h * 0.0075, 5);
      craft.x = stage.left + stage.width * 0.34;
      craft.standoff = h * 0.05;
      craft.span = Math.min(w * 0.035, 34);
      craft.y = shore.y - craft.standoff;
      plan.at = -99;
      ticks = [];
      track = [];
    },

    frame(ctx, dt, t, ink) {
      follow(t);
      drawContours(ctx, t, ink);
      drawShore(ctx, t, ink);
      drawFootprint(ctx, t, ink);
      drawTrack(ctx, t, ink);
      drawPlan(ctx, t, ink);
      drawCraft(ctx, ink);
      drawTicks(ctx, t, ink);
    },

    still(ctx, ink, t) {
      const at = t || 4;
      craft.y = target(at);
      ticks = [at - 2.4, at - 1.5, at - 1.1, at - 0.4];
      track = [];
      for (let s = TRACK_SECONDS; s >= 0; s -= 0.1) track.push({ t: at - s, y: target(at - s) });
      drawContours(ctx, at, ink);
      drawShore(ctx, at, ink);
      drawFootprint(ctx, at, ink);
      drawTrack(ctx, at, ink);
      drawPlan(ctx, at, ink);
      drawCraft(ctx, ink);
      drawTicks(ctx, at, ink);
    },
  };
}
