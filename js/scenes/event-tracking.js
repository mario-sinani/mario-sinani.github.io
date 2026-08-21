/* Scene: a multirotor that tracks a contour, seen from above, and
   makes a new plan only at an event.

   Background for "An Event-Triggered Visual Servoing Predictive Control
   Strategy for the Surveillance of Contour-Based Areas using Multirotor
   Aerial Vehicles".

   The camera looks down. The frame on the ground is what it sees. In
   that frame a network detects the contour and draws its bounding box,
   and the four corners of the box are the features the controller
   drives to their desired positions: the box centred in the frame. The
   craft follows the last plan in an open loop. The plan comes from a
   model that takes the contour ahead as straight, and it predicts the
   state. The craft plans again only when the measured state departs
   from the predicted one by more than a bound that scales with the
   tracking error, or when the horizon ends. This is the triggering
   condition of the paper. The events therefore come close together
   where the coastline turns, because the straight prediction fails
   there, and far apart where it is straight. The paper flew an
   octorotor on the coastline, and the craft here has eight rotors. */

import { withAlpha } from '../ink.js';
import { stageFor, drawDatum } from './stage.js';

const TWO_PI = 6.2832;
const DRIFT = 46;               // px/s the world scrolls beneath the vehicle
const HORIZON = 1.2;            // seconds a plan is valid for: 12 steps of 0.1 s in the paper
/* The triggering condition. The departure of the measured state from
   the predicted one must stay under a floor plus a fraction of the
   tracking error. The floor is a fraction of the canvas height, and the
   standoff is 0.05 of the height. */
const SIGMA = 0.5;
const FLOOR = 0.0025;
/* The noise of the visual tracking, as a fraction of the canvas
   height. It is one of the disturbances the paper names. */
const NOISE = 0.0012;
const TRACK_SECONDS = 9;        // how much flown path is kept, and how much time the plot shows
const CONTOURS = 6;             // depth lines off the shore
const STEP = 6;                 // px between samples along a curve
const ROTORS = 8;               // an octorotor, as on the coastline in the paper
const FRAME_RATIO = 672 / 376;  // the camera of the paper
const DESIRED_BAND = 40 / 376;  // the desired box: 40 pixels of 376 across the frame

export function createEventTracking() {
  const view = { w: 0, h: 0 };
  const shore = { y: 0, a1: 0, a2: 0, k1: 0, k2: 0, spacing: 9 };
  const craft = { x: 0, y: 0, standoff: 0, span: 0 };
  const frame = { w: 0, h: 0 };
  const plot = { x: 0, y: 0, w: 0, h: 0 };
  const plan = { at: -99, v0: 0, base: 0, slope: 0, e0: 0 };
  let stage = null;
  let craftVel = 0;
  let track = [];
  let stamps = [];
  let events = 0;
  let lastTime = 0;
  /* The lab can hold the horizon at one length. The value null means
     that the constant applies. The horizon is the time a plan stays
     valid, so it sets the longest space between two events. */
  let held = null;

  function horizon() {
    return held !== null ? held : HORIZON;
  }

  /** The contour, in world coordinates that move to the left with
      time. */
  function shoreAt(x, t) {
    const s = x + DRIFT * t;
    return shore.y + shore.a1 * Math.sin(shore.k1 * s) + shore.a2 * Math.sin(shore.k2 * s + 1.3);
  }

  /** The correct position of the vehicle: a fixed distance from the
      contour. */
  function target(t) {
    return shoreAt(craft.x, t) - craft.standoff;
  }

  /** The noise of the measurement: small, smooth and deterministic. */
  function noise(t) {
    return NOISE * view.h * (Math.sin(7.3 * t) + 0.6 * Math.sin(11.9 * t + 1));
  }

  /** The model of the controller takes the contour ahead as straight:
      the target moves on at the slope it has at the time of the
      plan. */
  function predictedTarget(t) {
    return plan.base + plan.slope * (t - plan.at);
  }

  /** The position the plan predicts: the offset from the target goes
      to zero along a Hermite arc over the horizon, from the offset and
      the rate at the time of the plan. */
  function predicted(t) {
    const s = Math.min((t - plan.at) / horizon(), 1);
    const s2 = s * s;
    const s3 = s2 * s;
    const offset = (2 * s3 - 3 * s2 + 1) * plan.e0
      + (s3 - 2 * s2 + s) * horizon() * (plan.v0 - plan.slope);
    return predictedTarget(t) + offset;
  }

  function replan(t) {
    plan.at = t;
    plan.base = target(t);
    plan.slope = (target(t) - target(t - 0.1)) / 0.1;
    plan.e0 = craft.y - plan.base;
    // Start the new plan at the velocity of the craft, because an
    // event must bend the path and must not stop it.
    plan.v0 = craftVel;
  }

  function follow(dt, t) {
    const before = craft.y;
    const age = t - plan.at;
    /* The event: the state as measured against the state the plan
       predicted. The state is the offset from the target. The plan
       predicts it with the contour taken as straight; the measurement
       has the real contour, and the noise of the tracking. The bound
       is a floor plus a fraction of the offset the plan still
       expects. */
    const expected = predicted(t);
    const expectedOffset = expected - predictedTarget(t);
    const measuredOffset = craft.y + noise(t) - target(t);
    const departure = Math.abs(measuredOffset - expectedOffset);
    const bound = FLOOR * view.h + SIGMA * Math.abs(expectedOffset);
    if (age > horizon() || departure > bound) {
      replan(t);
      events += 1;
      stamps.push(t);
      while (stamps.length && t - stamps[0] > TRACK_SECONDS) stamps.shift();
    } else {
      /* Between two events the craft is in an open loop. It follows
         the plan in memory. */
      craft.y = expected;
    }
    if (dt > 0) craftVel = (craft.y - before) / dt;
    track.push({ t, y: craft.y, e: craft.y - target(t) });
    while (track.length && t - track[0].t > TRACK_SECONDS) track.shift();
    lastTime = t;
  }

  /** Move the past with the clock, if the clock goes back. */
  function shiftPast(by) {
    track.forEach((p) => { p.t -= by; });
    stamps = stamps.map((s) => s - by);
    plan.at -= by;
    lastTime -= by;
  }

  function traceShore(ctx, t, drop) {
    ctx.beginPath();
    for (let x = -STEP; x <= view.w + STEP; x += STEP) {
      const y = shoreAt(x, t) + drop;
      if (x === -STEP) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
  }

  /* The sea: a wash off the shore, and the depth contours, which are
     copies of the coastline, each one further out and more faint. */
  function drawSea(ctx, t, ink) {
    const deep = CONTOURS * shore.spacing + view.h * 0.1;
    traceShore(ctx, t, 0);
    ctx.lineTo(view.w + STEP, shore.y + shore.a1 + deep);
    ctx.lineTo(-STEP, shore.y + shore.a1 + deep);
    ctx.closePath();
    // The wash fades out with the depth, so the sea has no far edge.
    const wash = ctx.createLinearGradient(0, shore.y - shore.a1, 0, shore.y + shore.a1 + deep);
    wash.addColorStop(0, withAlpha(ink.wash, 0.07));
    wash.addColorStop(1, withAlpha(ink.wash, 0));
    ctx.fillStyle = wash;
    ctx.fill();
    for (let i = CONTOURS; i >= 1; i--) {
      traceShore(ctx, t, i * shore.spacing);
      ctx.lineWidth = 1;
      ctx.strokeStyle = withAlpha(ink.line, 0.26 * (1 - (i - 1) / CONTOURS));
      ctx.stroke();
    }
  }

  function drawShore(ctx, t, ink) {
    traceShore(ctx, t, 0);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = ink.line;
    ctx.stroke();
  }

  /** The path of the flight, with a mark at each event. */
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

    ctx.beginPath();
    for (const at of stamps) {
      const x = craft.x - (t - at) * DRIFT;
      if (x < stage.left) continue;
      let best = track[0];
      for (const p of track) if (Math.abs(p.t - at) < Math.abs(best.t - at)) best = p;
      ctx.moveTo(x + 2.2, best.y);
      ctx.arc(x, best.y, 2.2, 0, TWO_PI);
    }
    ctx.fillStyle = ink.accent;
    ctx.fill();
  }

  /* The rest of the plan in memory: where the controller predicts the
     craft will go. Where the coastline turns, this line leaves the
     shore, and that is what triggers the next plan. */
  function drawPlan(ctx, t, ink) {
    const left = Math.max(horizon() - (t - plan.at), 0.05);
    ctx.beginPath();
    ctx.setLineDash([4, 4]);
    for (let i = 0; i <= 12; i++) {
      const ahead = (i / 12) * left;
      const x = craft.x + ahead * DRIFT;
      const y = predicted(t + ahead);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.lineWidth = 1;
    ctx.strokeStyle = ink.accent;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  /* The frame of the camera on the ground, the contour the network
     detects in it, the bounding box of that contour with its four
     corners, and the desired box in the middle of the frame. */
  function drawCamera(ctx, t, ink) {
    const left = craft.x - frame.w / 2;
    const top = craft.y - frame.h / 2;
    ctx.beginPath();
    ctx.rect(left, top, frame.w, frame.h);
    ctx.lineWidth = 1;
    ctx.strokeStyle = ink.faint;
    ctx.stroke();
    const c = frame.h * 0.12;
    ctx.beginPath();
    for (const [cx, sx] of [[left, 1], [left + frame.w, -1]]) {
      for (const [cy, sy] of [[top, 1], [top + frame.h, -1]]) {
        ctx.moveTo(cx, cy + sy * c);
        ctx.lineTo(cx, cy);
        ctx.lineTo(cx + sx * c, cy);
      }
    }
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = ink.line;
    ctx.stroke();

    // The desired box: a band across the middle of the frame.
    const band = frame.h * DESIRED_BAND;
    ctx.beginPath();
    ctx.setLineDash([3, 3]);
    ctx.rect(left, craft.y - band / 2, frame.w, band);
    ctx.lineWidth = 1;
    ctx.strokeStyle = withAlpha(ink.line, 0.6);
    ctx.stroke();
    ctx.setLineDash([]);

    // The contour in the frame, and its bounding box.
    ctx.save();
    ctx.beginPath();
    ctx.rect(left, top, frame.w, frame.h);
    ctx.clip();
    let lo = Infinity;
    let hi = -Infinity;
    ctx.beginPath();
    for (let x = left; x <= left + frame.w; x += 2) {
      const y = shoreAt(x, t);
      lo = Math.min(lo, y);
      hi = Math.max(hi, y);
      if (x === left) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.lineWidth = 2;
    ctx.strokeStyle = ink.accent;
    ctx.stroke();
    ctx.restore();

    lo = Math.max(lo - 2, top);
    hi = Math.min(hi + 2, top + frame.h);
    ctx.beginPath();
    ctx.rect(left, lo, frame.w, hi - lo);
    ctx.lineWidth = 1;
    ctx.strokeStyle = withAlpha(ink.accent, 0.7);
    ctx.stroke();
    ctx.fillStyle = ink.accent;
    for (const [x, y] of [[left, lo], [left + frame.w, lo], [left, hi], [left + frame.w, hi]]) {
      ctx.fillRect(x - 2, y - 2, 4, 4);
    }
  }

  /** The craft from above: a body plate with the camera under it,
      eight arms with a motor at the end of each, the disc of each
      rotor with its two blades, and a mark for the nose. The blades
      turn with time. */
  function drawCraft(ctx, t, ink) {
    const S = craft.span;
    const reach = S * 0.4;        // the body centre to a motor
    const disc = S * 0.12;        // the radius of a rotor
    const body = S * 0.15;        // the radius of the body plate
    const arms = [];
    for (let k = 0; k < ROTORS; k++) {
      const a = (TWO_PI * (k + 0.5)) / ROTORS;
      arms.push({ a, x: craft.x + Math.cos(a) * reach, y: craft.y + Math.sin(a) * reach });
    }

    // The discs of the rotors, under everything else.
    ctx.beginPath();
    for (const m of arms) {
      ctx.moveTo(m.x + disc, m.y);
      ctx.arc(m.x, m.y, disc, 0, TWO_PI);
    }
    ctx.fillStyle = withAlpha(ink.accent, 0.07);
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = withAlpha(ink.accent, 0.55);
    ctx.stroke();

    // The arms, from the edge of the body to the motors.
    ctx.beginPath();
    for (const m of arms) {
      ctx.moveTo(craft.x + Math.cos(m.a) * body * 0.9, craft.y + Math.sin(m.a) * body * 0.9);
      ctx.lineTo(m.x, m.y);
    }
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = ink.body;
    ctx.stroke();

    // The blades: two for each rotor, at their own angle, turning.
    ctx.beginPath();
    arms.forEach((m, k) => {
      const spin = t * 7 + k * 0.9;
      const bx = Math.cos(spin) * disc * 0.92;
      const by = Math.sin(spin) * disc * 0.92;
      ctx.moveTo(m.x - bx, m.y - by);
      ctx.lineTo(m.x + bx, m.y + by);
    });
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = withAlpha(ink.accent, 0.9);
    ctx.stroke();

    // The motors.
    ctx.beginPath();
    for (const m of arms) {
      ctx.moveTo(m.x + 2.4, m.y);
      ctx.arc(m.x, m.y, 2.4, 0, TWO_PI);
    }
    ctx.fillStyle = ink.body;
    ctx.fill();

    // The body plate, and the camera under its centre.
    ctx.beginPath();
    ctx.arc(craft.x, craft.y, body, 0, TWO_PI);
    ctx.fillStyle = ink.ground;
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = ink.body;
    ctx.stroke();
    ctx.fillStyle = ink.accent;
    ctx.fillRect(craft.x - 2.5, craft.y - 2.5, 5, 5);

    // The nose: the direction of flight.
    ctx.beginPath();
    ctx.moveTo(craft.x + body * 1.55, craft.y);
    ctx.lineTo(craft.x + body * 1.05, craft.y - body * 0.32);
    ctx.lineTo(craft.x + body * 1.05, craft.y + body * 0.32);
    ctx.closePath();
    ctx.fillStyle = ink.accent;
    ctx.fill();
  }

  /* The image error against time, with a mark at each event, in the
     manner of the paper's figures. The chart stands above the coast,
     so it covers no ground. */
  function drawPlot(ctx, t, ink) {
    if (plot.w <= 0 || plot.h <= 0 || track.length < 2) return;
    const midY = plot.y + plot.h / 2;
    const scale = craft.standoff * 0.7;
    const toX = (when) => plot.x + plot.w * (1 - (t - when) / TRACK_SECONDS);
    const toY = (e) => midY + Math.max(-1, Math.min(1, e / scale)) * (plot.h / 2) * 0.9;

    ctx.beginPath();
    ctx.moveTo(plot.x, midY);
    ctx.lineTo(plot.x + plot.w, midY);
    ctx.moveTo(plot.x, plot.y);
    ctx.lineTo(plot.x, plot.y + plot.h);
    ctx.lineWidth = 1;
    ctx.strokeStyle = ink.faint;
    ctx.stroke();

    ctx.beginPath();
    for (let i = 0; i < track.length; i++) {
      const px = toX(track[i].t);
      const py = toY(track[i].e);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = ink.body;
    ctx.stroke();

    ctx.beginPath();
    for (const at of stamps) {
      const px = toX(at);
      if (px < plot.x) continue;
      ctx.moveTo(px, plot.y + plot.h);
      ctx.lineTo(px, plot.y + plot.h + 4);
    }
    ctx.lineWidth = 1.1;
    ctx.strokeStyle = ink.accent;
    ctx.stroke();

    const last = track[track.length - 1];
    ctx.beginPath();
    ctx.arc(toX(last.t), toY(last.e), 2.4, 0, TWO_PI);
    ctx.fillStyle = ink.accent;
    ctx.fill();
  }

  function paint(ctx, t, ink) {
    drawSea(ctx, t, ink);
    drawShore(ctx, t, ink);
    drawDatum(ctx, stage, ink);
    drawTrack(ctx, t, ink);
    drawPlan(ctx, t, ink);
    drawCamera(ctx, t, ink);
    drawCraft(ctx, t, ink);
    drawPlot(ctx, t, ink);
  }

  return {
    fade: 1,   // a drawn figure; the engine clears it each frame

    /* The control of this scene on the lab page. The value is the
       length of the horizon in seconds. A short horizon gives many
       plans, and the dashed line ahead of the craft becomes short. */
    lab: {
      label: 'Plan horizon',
      unit: ' s',
      min: 0.4,
      max: 3,
      step: 0.1,
      value: () => horizon(),
      set(v) { held = v; },
      release() { held = null; },
      auto: {
        name: 'the horizon of the paper, 1.2 seconds',
        status() {
          return 'Auto keeps the horizon of the paper: 1.2 s, which is 12 steps of 0.1 s. '
            + 'The events come from the coastline and the noise alone.';
        },
      },
      hold(v) {
        return 'Horizon held at ' + v + ' s. A short horizon gives many plans, a long one few. Auto returns to 1.2 s.';
      },
    },

    /** A few numbers of the state, for a test. */
    probe() {
      return { events, horizon: horizon(), offset: craft.y - target(lastTime), trackEnd: track.length ? track[track.length - 1].t : null };
    },

    layout(w, h, fit = {}) {
      view.w = w;
      view.h = h;
      /* A preview shows the top of the box in a small window. The craft
         then flies in the middle of it. */
      const preview = Boolean(fit.preview);
      stage = stageFor(w, h, preview ? 0.17 : fit.band);
      craft.standoff = h * 0.05;
      craft.span = Math.min(w * 0.05, 50) * (fit.scale || 1);
      // The datum is the line the craft should fly, a standoff off
      // the coast.
      shore.y = stage.y + craft.standoff;
      shore.a1 = h * 0.022;
      shore.a2 = h * 0.011;
      shore.k1 = TWO_PI / Math.max(w * 0.55, 260);
      shore.k2 = TWO_PI / Math.max(w * 0.21, 110);
      shore.spacing = Math.max(h * 0.0075, 5);
      craft.x = stage.left + stage.width * (preview ? 0.5 : 0.34);
      craft.y = stage.y;
      frame.h = craft.standoff * 2.6;
      frame.w = frame.h * FRAME_RATIO;

      // The chart stands above the path of the craft and the coast,
      // so that it hides no ground. A canvas with too little room
      // above gets no chart.
      const room = w > 760;
      const clear = stage.y - (shore.a1 + shore.a2) - 10;
      plot.w = room ? Math.min(stage.width * 0.17, 170) : 0;
      plot.h = Math.min(plot.w * 0.5, clear - 6);
      if (plot.h < 30) plot.h = 0;
      plot.x = stage.right - plot.w;
      plot.y = clear - plot.h;

      plan.at = -99;
      track = [];
      stamps = [];
      lastTime = 0;
    },

    frame(ctx, dt, t, ink) {
      if (lastTime > t) shiftPast(lastTime - t);
      follow(dt, t);
      paint(ctx, t, ink);
    },

    still(ctx, ink, t) {
      const at = t || 4;
      /* Run the real law over the recent past. The events then show
         the horizon that the visitor set, and not a fixed pattern. */
      track = [];
      stamps = [];
      plan.at = -99;
      craftVel = 0;
      craft.y = target(at - TRACK_SECONDS);
      const dt = 1 / 30;
      for (let when = at - TRACK_SECONDS; when <= at; when += dt) follow(dt, when);
      paint(ctx, at, ink);
      return at;
    },
  };
}
