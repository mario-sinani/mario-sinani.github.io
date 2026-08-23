/* Scene: the drawing of a multirotor that tracks a contour from above, and
   plans again only at an event. Background for "An Event-Triggered Visual
   Servoing Predictive Control Strategy for the Surveillance of
   Contour-Based Areas using Multirotor Aerial Vehicles".

   The model is in js/models/event-tracking.js. The scene draws the sea and
   the coastline, the flown path with a mark at each event, the rest of the
   plan in memory, the frame of the camera with the detected box, the craft
   with its eight rotors, and the chart of the image error. */

import { withAlpha } from '../ink.js';
import { stageForFit, drawDatum } from './stage.js';
import { timeToX, drawAxes, drawLine, drawHead } from './chart.js';
import { crestsAt, ripple, CRESTS } from './swell.js';
import { createEventTrackingModel, DRIFT,
  TRACK_SECONDS } from '../models/event-tracking.js';

const TWO_PI = 6.2832;
const WAVE_SECONDS = 9;         // seconds for a crest to reach the shore
const STEP = 6;                 // px between samples along a curve
const ROTORS = 8;               // an octorotor, as on the coastline in the paper
const ROTOR_REACH = 0.4;        // the body centre to a motor, in spans
const ROTOR_DISC = 0.12;       // the radius of a rotor, in spans
const BODY_PLATE = 0.15;       // the radius of the body plate, in spans
const ARM_START = 0.9;         // where an arm leaves the plate, in plates
const BLADE_SPAN = 0.92;       // the half length of a blade, in discs
const BLADE_RATE = 7;          // radians a second
const BLADE_STAGGER = 0.9;     // radians between one rotor and the next
const MOTOR_DOT = 2.4;         // px
const CAMERA_SIDE = 5;         // px
const NOSE_AHEAD = 1.55;       // the tip of the nose, in plates
const NOSE_BACK = 1.05;        // its base, in plates
const NOSE_HALF = 0.32;        // its half width, in plates
const FRAME_RATIO = 672 / 376;  // the camera of the paper
const DESIRED_BAND = 40 / 376;  // the desired box: 40 pixels of 376 across the frame

export function createEventTracking() {
  const view = { w: 0, h: 0 };
  const shore = { y: 0, a1: 0, a2: 0, k1: 0, k2: 0, spacing: 9 };
  const craft = { x: 0, standoff: 0, span: 0 };
  const frame = { w: 0, h: 0 };
  const plot = { x: 0, y: 0, w: 0, h: 0 };
  /* The station of the craft along the coast comes from the layout; where
     it flies across the coast comes from the model. */
  const model = createEventTrackingModel(view, shore, craft);
  let stage = null;

  function traceShore(ctx, t, drop) {
    ctx.beginPath();
    for (let x = -STEP; x <= view.w + STEP; x += STEP) {
      const y = model.shoreAt(x, t) + drop;
      if (x === -STEP) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
  }

  /* The sea: a wash off the shore, and the depth contours, each one further
     out and more faint. */
  function drawSea(ctx, t, ink) {
    const deep = CRESTS * shore.spacing + view.h * 0.1;
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
    /* The swell comes in from the deep water: a crest starts straight,
       turns to the shape of the coast as it shoals, slows, and fades as it
       breaks. */
    const reach = CRESTS * shore.spacing;
    const wavelength = Math.max(view.w * 0.6, 320);
    for (const crest of crestsAt(t, WAVE_SECONDS, reach)) {
      if (crest.fade <= 0.02) continue;
      ctx.beginPath();
      for (let x = -STEP; x <= view.w + STEP; x += STEP) {
        const shape = model.shoreAt(x, t);
        const straight = shore.y;
        const y = shape + (straight - shape) * crest.deep
          + crest.drop + ripple(crest, x, t, reach, wavelength);
        if (x === -STEP) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.lineWidth = 1;
      ctx.strokeStyle = withAlpha(ink.line, 0.3 * crest.fade);
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
    const { track, stamps } = model;
    if (track.count < 2) return;
    ctx.beginPath();
    track.each((p, i) => {
      const x = craft.x - (t - p.t) * DRIFT;
      if (i === 0) ctx.moveTo(x, p.y); else ctx.lineTo(x, p.y);
    });
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = withAlpha(ink.body, 0.45);
    ctx.stroke();

    ctx.beginPath();
    stamps.each((at) => {
      const x = craft.x - (t - at) * DRIFT;
      if (x < stage.left) return;
      const best = track.nearest(at);
      ctx.moveTo(x + 2.2, best.y);
      ctx.arc(x, best.y, 2.2, 0, TWO_PI);
    });
    ctx.fillStyle = ink.accent;
    ctx.fill();
  }

  /* The rest of the plan in memory. Where the coastline turns, this line
     leaves the shore, and that triggers the next plan. */
  function drawPlan(ctx, t, ink) {
    const left = model.planLeft(t);
    ctx.beginPath();
    ctx.setLineDash([4, 4]);
    for (let i = 0; i <= 12; i++) {
      const ahead = (i / 12) * left;
      const x = craft.x + ahead * DRIFT;
      const y = model.predicted(t + ahead);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.lineWidth = 1;
    ctx.strokeStyle = ink.accent;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  /* The frame of the camera on the ground, with the marks of a
     viewfinder at its corners. */
  function drawFrame(ctx, ink, left, top) {
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
  }

  /** The desired box: a band across the middle of the frame. */
  function drawDesired(ctx, ink, left) {
    const band = frame.h * DESIRED_BAND;
    ctx.beginPath();
    ctx.setLineDash([3, 3]);
    ctx.rect(left, model.y - band / 2, frame.w, band);
    ctx.lineWidth = 1;
    ctx.strokeStyle = withAlpha(ink.line, 0.6);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  /** The contour the network sees, its bounding box, and the four corners
      that are the features. */
  function drawDetection(ctx, t, ink, left, top) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(left, top, frame.w, frame.h);
    ctx.clip();
    let lo = Infinity;
    let hi = -Infinity;
    ctx.beginPath();
    for (let x = left; x <= left + frame.w; x += 2) {
      const y = model.shoreAt(x, t);
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

  /* What the camera sees: the frame, the desired box, and the detection. */
  function drawCamera(ctx, t, ink) {
    const left = craft.x - frame.w / 2;
    const top = model.y - frame.h / 2;
    drawFrame(ctx, ink, left, top);
    drawDesired(ctx, ink, left);
    drawDetection(ctx, t, ink, left, top);
  }

  /** The craft from above: a body plate with the camera under it, eight
      arms with a motor at each end, a disc and two blades for each rotor,
      and a mark for the nose. */
  /* The eight arms of the craft, with a motor at the end of each. */
  function armsOf() {
    const arms = [];
    for (let k = 0; k < ROTORS; k++) {
      const a = (TWO_PI * (k + 0.5)) / ROTORS;
      arms.push({
        a,
        x: craft.x + Math.cos(a) * craft.span * ROTOR_REACH,
        y: model.y + Math.sin(a) * craft.span * ROTOR_REACH,
      });
    }
    return arms;
  }

  /** The disc of each rotor, under everything else. */
  function drawDiscs(ctx, ink, arms, disc) {
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
  }

  /** The arms, from the plate to the motors, and the motors themselves. */
  function drawArms(ctx, ink, arms, body) {
    ctx.beginPath();
    for (const m of arms) {
      ctx.moveTo(craft.x + Math.cos(m.a) * body * ARM_START, model.y + Math.sin(m.a) * body * ARM_START);
      ctx.lineTo(m.x, m.y);
    }
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = ink.body;
    ctx.stroke();
  }

  /** Two blades for each rotor, turning at their own angle. */
  function drawBlades(ctx, t, ink, arms, disc) {
    ctx.beginPath();
    arms.forEach((m, k) => {
      const spin = t * BLADE_RATE + k * BLADE_STAGGER;
      const bx = Math.cos(spin) * disc * BLADE_SPAN;
      const by = Math.sin(spin) * disc * BLADE_SPAN;
      ctx.moveTo(m.x - bx, m.y - by);
      ctx.lineTo(m.x + bx, m.y + by);
    });
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = withAlpha(ink.accent, 0.9);
    ctx.stroke();
  }

  function drawMotors(ctx, ink, arms) {
    ctx.beginPath();
    for (const m of arms) {
      ctx.moveTo(m.x + MOTOR_DOT, m.y);
      ctx.arc(m.x, m.y, MOTOR_DOT, 0, TWO_PI);
    }
    ctx.fillStyle = ink.body;
    ctx.fill();
  }

  /** The body plate with the camera under it, and the nose ahead. */
  function drawBody(ctx, ink, body) {
    ctx.beginPath();
    ctx.arc(craft.x, model.y, body, 0, TWO_PI);
    ctx.fillStyle = ink.ground;
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = ink.body;
    ctx.stroke();
    ctx.fillStyle = ink.accent;
    ctx.fillRect(craft.x - CAMERA_SIDE / 2, model.y - CAMERA_SIDE / 2, CAMERA_SIDE, CAMERA_SIDE);

    ctx.beginPath();
    ctx.moveTo(craft.x + body * NOSE_AHEAD, model.y);
    ctx.lineTo(craft.x + body * NOSE_BACK, model.y - body * NOSE_HALF);
    ctx.lineTo(craft.x + body * NOSE_BACK, model.y + body * NOSE_HALF);
    ctx.closePath();
    ctx.fillStyle = ink.accent;
    ctx.fill();
  }

  /** The craft from above: the discs, the arms, the blades, the motors,
      the plate with its camera, and the nose. */
  function drawCraft(ctx, t, ink) {
    const arms = armsOf();
    const disc = craft.span * ROTOR_DISC;
    const body = craft.span * BODY_PLATE;
    drawDiscs(ctx, ink, arms, disc);
    drawArms(ctx, ink, arms, body);
    drawBlades(ctx, t, ink, arms, disc);
    drawMotors(ctx, ink, arms);
    drawBody(ctx, ink, body);
  }

  /* The image error against time, with a mark at each event, as in the
     figures of the paper. The chart stands above the coast, so it covers no
     ground. */
  function drawPlot(ctx, t, ink) {
    const { track, stamps } = model;
    if (plot.w <= 0 || plot.h <= 0 || track.count < 2) return;
    const midY = plot.y + plot.h / 2;
    const scale = craft.standoff * 0.7;
    const toX = timeToX(plot, TRACK_SECONDS, t);
    const toY = (e) => midY + Math.max(-1, Math.min(1, e / scale)) * (plot.h / 2) * 0.9;

    drawAxes(ctx, ink, plot, midY);

    drawLine(ctx, track, {
      x: (p) => toX(p.t),
      y: (p) => toY(p.e),
      width: 1.3,
      style: ink.body,
    });

    ctx.beginPath();
    stamps.each((at) => {
      const px = toX(at);
      if (px < plot.x) return;
      ctx.moveTo(px, plot.y + plot.h);
      ctx.lineTo(px, plot.y + plot.h + 4);
    });
    ctx.lineWidth = 1.1;
    ctx.strokeStyle = ink.accent;
    ctx.stroke();

    const last = track.last;
    drawHead(ctx, ink.accent, toX(last.t), toY(last.e), 2.4);
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

    /* The control on the lab page: the horizon in seconds. A short horizon
       gives many plans, and the dashed line ahead becomes short. */
    lab: {
      label: 'Plan horizon',
      unit: ' s',
      min: 0.4,
      max: 3,
      step: 0.1,
      value: () => model.horizon(),
      set(v) { model.hold(v); },
      release() { model.release(); },
      autoName: 'the horizon of the paper, 1.2 seconds',
      /* What the model does at this moment, for the line below the
         control. In Auto the model sets the parameter; in Hold the
         slider holds the value v. */
      status(isAuto, v) {
        if (!isAuto) {
          return 'Horizon held at ' + v + ' s. A short horizon gives many plans, a long one few. Auto returns to 1.2 s.';
        }
        return 'Auto keeps the horizon of the paper: 1.2 s, which is 12 steps of 0.1 s. '
          + 'The events come from the coastline and the noise alone.';
      },
    },

    /** A few numbers of the state, for a test. */
    probe: model.probe,

    /* Put the model back at its start. The engine calls it before
       it draws a fixed frame after a resize. */
    reset() {
      model.reset();
    },

    layout(w, h, fit = {}) {
      view.w = w;
      view.h = h;
      const preview = Boolean(fit.preview);
      stage = stageForFit(w, h, fit, { preview: 0.17 });
      craft.standoff = h * 0.05;
      craft.span = Math.min(w * 0.05, 50) * (fit.scale || 1);
      // The datum is the line the craft must fly, a standoff off the coast.
      shore.y = stage.y + craft.standoff;
      shore.a1 = h * 0.022;
      shore.a2 = h * 0.011;
      shore.k1 = TWO_PI / Math.max(w * 0.55, 260);
      shore.k2 = TWO_PI / Math.max(w * 0.21, 110);
      // The crests of the swell stand this far apart, so the sea reads as
      // water and not as a band of lines at the shore.
      shore.spacing = Math.max(h * 0.022, 12);
      craft.x = stage.left + stage.width * (preview ? 0.5 : 0.34);
      model.placeAt(stage.y);
      frame.h = craft.standoff * 2.6;
      frame.w = frame.h * FRAME_RATIO;

      // The chart stands above the path and the coast, so it hides no
      // ground. A canvas with too little room above gets no chart.
      const room = w > 760;
      const clear = stage.y - (shore.a1 + shore.a2) - 10;
      plot.w = room ? Math.min(stage.width * 0.17, 170) : 0;
      plot.h = Math.min(plot.w * 0.5, clear - 6);
      if (plot.h < 30) plot.h = 0;
      plot.x = stage.right - plot.w;
      plot.y = clear - plot.h;

    },

    frame(ctx, dt, t, ink) {
      if (model.lastTime > t) model.shiftPast(model.lastTime - t);
      model.follow(dt, t);
      paint(ctx, t, ink);
    },

    still(ctx, ink, t) {
      const at = t || 4;
      /* Run the real law over the recent past, so the events show the
         horizon in use and not a fixed pattern. */
      model.startPast(at - TRACK_SECONDS);
      const dt = 1 / 30;
      for (let when = at - TRACK_SECONDS; when <= at; when += dt) model.follow(dt, when);
      paint(ctx, at, ink);
      return at;
    },
  };
}
