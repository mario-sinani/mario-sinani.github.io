/* Scene: a multirotor tracking a contour, replanning only when it has to.

   Behind "An Event-Triggered Visual Servoing Predictive Control Strategy
   for the Surveillance of Contour-Based Areas using Multirotor Aerial
   Vehicles".

   The triggering is real rather than staged: the vehicle follows the last
   plan open loop, and a new optimal control problem is solved only when
   the tracking error crosses a threshold or the horizon runs out. That is
   why the ticks along the rail fall unevenly - they bunch up where the
   coastline turns and thin out where it runs straight, which is exactly
   the saving the scheme is after. */

const TWO_PI = 6.2832;
const DRIFT = 46;               // px/s the world scrolls beneath the vehicle
const HORIZON = 1.5;            // seconds a plan is valid for
const ERROR_TRIGGER = 0.055;    // fraction of canvas height
const MAX_TICKS = 42;

/* Every paper scene sits in this band down from the top of the hero: the
   panel below is vertically centred, so this strip stays clear of the
   words at every viewport height. */
const BAND = 0.14;

export function createEventTracking() {
  const view = { w: 0, h: 0 };
  const shore = { y: 0, a1: 0, a2: 0, k1: 0, k2: 0 };
  const craft = { x: 0, y: 0, standoff: 0, span: 0 };
  const plan = { from: 0, to: 0, at: -99 };
  let ticks = [];

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
      return;
    }
    // Open loop between triggers: no feedback, just the stored trajectory.
    const s = Math.min(age / HORIZON, 1);
    craft.y = plan.from + (plan.to - plan.from) * (s * s * (3 - 2 * s));
  }

  function drawShore(ctx, t, ink) {
    ctx.beginPath();
    for (let x = -10; x <= view.w + 10; x += 6) {
      const y = shoreAt(x, t);
      if (x === -10) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = ink.line;
    ctx.stroke();
  }

  /* The camera footprint: what the downward-looking lens can see of the
     contour from where the vehicle currently is. */
  function drawFootprint(ctx, t, ink) {
    const spread = craft.standoff * 0.75;
    ctx.beginPath();
    ctx.moveTo(craft.x, craft.y);
    ctx.lineTo(craft.x - spread, shoreAt(craft.x - spread, t));
    ctx.moveTo(craft.x, craft.y);
    ctx.lineTo(craft.x + spread, shoreAt(craft.x + spread, t));
    ctx.lineWidth = 1;
    ctx.strokeStyle = ink.faint;
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
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = ink.body;
    ctx.stroke();
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(craft.x + side * arm, craft.y, 2.8, 0, TWO_PI);
      ctx.lineWidth = 1.3;
      ctx.strokeStyle = ink.accent;
      ctx.stroke();
    }
  }

  /* Every solve leaves a mark on the rail, and the marks scroll away with
     the world, so the uneven spacing of the triggers is visible. */
  function drawTicks(ctx, t, ink) {
    const railY = shore.y + shore.a1 + shore.a2 + view.h * 0.032;
    ctx.beginPath();
    ctx.moveTo(0, railY);
    ctx.lineTo(view.w, railY);
    ctx.lineWidth = 1;
    ctx.strokeStyle = ink.faint;
    ctx.stroke();

    ctx.beginPath();
    for (const at of ticks) {
      const x = craft.x - (t - at) * DRIFT;
      if (x < -5) continue;
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
      shore.y = h * (BAND + 0.01);
      shore.a1 = h * 0.028;
      shore.a2 = h * 0.014;
      shore.k1 = TWO_PI / Math.max(w * 0.55, 260);
      shore.k2 = TWO_PI / Math.max(w * 0.21, 110);
      craft.x = w * 0.34;
      craft.standoff = h * 0.062;
      craft.span = Math.min(w * 0.035, 34);
      craft.y = shore.y - craft.standoff;
      plan.at = -99;
      ticks = [];
    },

    frame(ctx, dt, t, ink) {
      follow(t);
      drawShore(ctx, t, ink);
      drawFootprint(ctx, t, ink);
      drawPlan(ctx, t, ink);
      drawCraft(ctx, ink);
      drawTicks(ctx, t, ink);
    },

    still(ctx, ink, t) {
      const at = t || 4;
      craft.y = target(at);
      ticks = [at - 2.4, at - 1.5, at - 1.1, at - 0.4];
      drawShore(ctx, at, ink);
      drawFootprint(ctx, at, ink);
      drawPlan(ctx, at, ink);
      drawCraft(ctx, ink);
      drawTicks(ctx, at, ink);
    },
  };
}
