/* Scene: a wing with a folding tip on a flared hinge, from the front. The
   flow starts, the wing bends up, and the tip finds its own angle.
   Background for "Absolute Nodal Coordinate Formulation for Nonlinear
   Multibody Modeling of Flared Hinged Wings".

   The paper simulates a semispan of 16 m: 12 m of inner wing, a free hinge
   flared by 10 degrees, and 4 m of tip. The flow and the gravity start at t
   = 0. The tip lags behind the rising wing, folds past its final angle and
   settles: 45 degrees at 10 degrees of incidence, 25 degrees at 5 (Fig.
   18). A fold of theta about a hinge flared by beta turns the chord by
   atan(tan(theta) sin(beta)), so the tip coasts where its own lift carries
   it.

   The inner wing is a beam in its first bending mode, and the tip is a
   rigid body on the hinge. The equation of the tip holds the lift on its
   incidence, its weight, the inertial load of the rising hinge, and the
   damping of the joint. The constants are calibrated to the two cases of
   the paper. The inset is the plan view with the flare, and the trace is
   the fold angle against time. */

import { withAlpha } from '../ink.js';
import { stageFor, drawDatum } from './stage.js';

const TWO_PI = Math.PI * 2;
const INNER = 12;                 // metres
const OUTER = 4;
const SEMISPAN = INNER + OUTER;
const CHORD = 1;
const FLARE = (10 * Math.PI) / 180;
const FIRST_ROOT = 1.8751040687;
const FIRST_SIGMA = 0.734096;
const TIP_SLOPE = 1.3765;         // the slope of the first mode at its tip, per unit of tip deflection and length
const STATIONS = 40;

/* The inner wing: the steady rise of the hinge per radian of incidence, and
   the first bending mode. */
const HINGE_RISE = 14.0;          // metres per radian
const WING_OMEGA = 5.0;           // 1/s
const WING_DAMPING = 0.5;
const LIFT_LAG = 0.15;            // seconds for the lift to build up

/* The tip: the lift per radian of incidence, the weight, and the damping of
   the joint, each per unit of inertia about the hinge. */
const TIP_LIFT = 12.0;            // 1/s^2 per radian
const TIP_WEIGHT = 0.0752;        // 1/s^2
const TIP_DAMPING = 0.45;
const GRAVITY = 9.8;
const STOP = (85 * Math.PI) / 180;

const CASES = [10, 5];            // degrees; the two cases of the paper
const HOLD = 7;                   // seconds for each case; the transient settles in about 6
const TRACE_SECONDS = 14;
const TRACE_STEP = 0.1;
const MARK_EVERY = 0.5;           // seconds between the marks on the trace
const GHOSTS = [0.5, 0.25];       // seconds ago
/* The subject rises above the datum, so the datum sits lower by this
   fraction of the height. */
const RISE = 0.10;
const STEP = 1 / 240;

function firstMode(xi) {
  const t = FIRST_ROOT * xi;
  return (Math.cosh(t) - Math.cos(t) - FIRST_SIGMA * (Math.sinh(t) - Math.sin(t))) / 2;
}

function firstSlope(xi) {
  const t = FIRST_ROOT * xi;
  return (FIRST_ROOT * (Math.sinh(t) + Math.sin(t) - FIRST_SIGMA * (Math.cosh(t) - Math.cos(t)))) / 2;
}

export function createHingedWingtip() {
  const n = STATIONS;
  const slope = new Float64Array(n + 1);
  for (let i = 0; i <= n; i++) slope[i] = firstSlope(i / n) / INNER;
  const axisX = new Float64Array(n + 1);
  const axisZ = new Float64Array(n + 1);
  const plan = { x: 0, y: 0, w: 0, h: 0 };
  const trace = { x: 0, y: 0, w: 0, h: 0 };
  let stage = null;
  let root = { x: 0, y: 0 };
  let scale = 20;                 // pixels per metre
  let history = [];
  let lastSample = -99;
  /* The lab can hold the flare. null uses the flare of the paper. */
  let held = null;
  /* The state: the incidence the lift sees, the hinge, and the tip. */
  let alphaNow = 0;
  let q = 0; let qd = 0; let qdd = 0;
  let Theta = 0; let Thetad = 0;
  let clock = 0;

  function flare() {
    return held !== null ? held : FLARE;
  }

  function alphaCommand(t) {
    return (CASES[Math.floor(t / HOLD) % CASES.length] * Math.PI) / 180;
  }

  function hingeSlope() {
    return (TIP_SLOPE * q) / INNER;
  }

  function fold() {
    return Theta - hingeSlope();
  }

  /** The incidence left on the tip after the fold takes its part. */
  function tipIncidence() {
    return alphaNow - Math.atan(Math.tan(fold()) * Math.sin(flare()));
  }

  function step(dt, when) {
    alphaNow += (alphaCommand(when) - alphaNow) * Math.min(1, dt / LIFT_LAG);
    const rise = HINGE_RISE * alphaNow;
    qdd = -2 * WING_DAMPING * WING_OMEGA * qd - WING_OMEGA * WING_OMEGA * (q - rise);
    qd += qdd * dt;
    q += qd * dt;

    const stiffness = TIP_LIFT * Math.sin(flare()) + 0.05;
    const damping = 2 * TIP_DAMPING * Math.sqrt(stiffness);
    const accel = TIP_LIFT * tipIncidence()
      - TIP_WEIGHT * (1 + qdd / GRAVITY) * Math.cos(Theta)
      - damping * (Thetad - (TIP_SLOPE * qd) / INNER);
    Thetad += accel * dt;
    Theta += Thetad * dt;
    // The stops of the joint.
    const psi = hingeSlope();
    if (Theta - psi > STOP) { Theta = psi + STOP; Thetad = (TIP_SLOPE * qd) / INNER; }
    if (Theta - psi < -STOP) { Theta = psi - STOP; Thetad = (TIP_SLOPE * qd) / INNER; }
  }

  function advance(t) {
    if (clock > t) {
      // The clock went back. Move the past with it.
      const by = clock - t;
      history.forEach((s) => { s.t -= by; });
      lastSample -= by;
      clock = t;
    }
    let left = Math.min(Math.max(t - clock, 0), 0.25);
    while (left > 0) {
      const h = Math.min(STEP, left);
      step(h, clock + h);
      clock += h;
      left -= h;
      if (clock - lastSample >= TRACE_STEP) {
        lastSample = clock;
        history.push({ t: clock, fold: fold(), Theta, q });
        while (history.length && clock - history[0].t > TRACE_SECONDS) history.shift();
      }
    }
  }

  /** The inner wing, integrated along its length. The beam keeps its
      length. */
  function traceInner(deflection) {
    axisX[0] = 0;
    axisZ[0] = 0;
    const ds = INNER / n;
    for (let i = 1; i <= n; i++) {
      const a = 0.5 * (slope[i - 1] + slope[i]) * deflection;
      axisX[i] = axisX[i - 1] + Math.cos(a) * ds;
      axisZ[i] = axisZ[i - 1] + Math.sin(a) * ds;
    }
  }

  function toScreen(xm, zm) {
    return { x: root.x + xm * scale, y: root.y - zm * scale };
  }

  function drawInner(ctx, ink) {
    traceInner(q);
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const p = toScreen(axisX[i], axisZ[i]);
      if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    }
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.strokeStyle = ink.body;
    ctx.stroke();

    // The root, where the wing is clamped.
    const reach = CHORD * scale * 0.9;
    ctx.beginPath();
    ctx.moveTo(root.x, root.y - reach);
    ctx.lineTo(root.x, root.y + reach);
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = ink.accent;
    ctx.stroke();
  }

  function hingePoint() {
    return toScreen(axisX[n], axisZ[n]);
  }

  function drawTip(ctx, ink, angle, style, width) {
    const h = hingePoint();
    ctx.beginPath();
    ctx.moveTo(h.x, h.y);
    ctx.lineTo(h.x + Math.cos(angle) * OUTER * scale, h.y - Math.sin(angle) * OUTER * scale);
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.strokeStyle = style;
    ctx.stroke();
  }

  function drawGhosts(ctx, ink) {
    if (!history.length) return;
    GHOSTS.forEach((ago, k) => {
      const when = clock - ago;
      let best = history[0];
      for (const s of history) if (Math.abs(s.t - when) < Math.abs(best.t - when)) best = s;
      traceInner(best.q);
      drawTip(ctx, ink, best.Theta, withAlpha(ink.body, 0.1 + 0.1 * k), 1.4);
    });
    traceInner(q);
  }

  function drawHinge(ctx, ink) {
    const h = hingePoint();
    ctx.beginPath();
    ctx.arc(h.x, h.y, 3.6, 0, TWO_PI);
    ctx.fillStyle = ink.ground;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = ink.accent;
    ctx.stroke();

    // The arc of the fold, from the slope of the wing to the tip.
    const f = fold();
    const presence = Math.min(1, Math.max(0, (Math.abs(f) - 0.02) / 0.08));
    if (presence <= 0) return;
    const r = OUTER * scale * 0.45;
    const from = -hingeSlope();
    const to = -Theta;
    ctx.beginPath();
    ctx.arc(h.x, h.y, r, Math.min(from, to), Math.max(from, to));
    ctx.lineWidth = 1.1;
    ctx.strokeStyle = withAlpha(ink.accent, 0.6 * presence);
    ctx.stroke();
  }

  /* The lift along the wing and the tip, normal to each surface, and the
     weight of the tip. */
  function drawLoads(ctx, ink) {
    const unit = scale * OUTER * 0.35;
    const alpha10 = (10 * Math.PI) / 180;
    ctx.beginPath();
    for (let k = 1; k <= 6; k++) {
      const i = Math.round((k / 6) * n) - 1;
      const a = slope[i] * q;
      const len = (alphaNow / alpha10) * unit;
      const p = toScreen(axisX[i], axisZ[i]);
      arrow(ctx, p.x, p.y, -Math.sin(a), -Math.cos(a), len);
    }
    const h = hingePoint();
    const tipLen = (tipIncidence() / alpha10) * unit;
    for (const r of [0.33, 0.66]) {
      const x = h.x + Math.cos(Theta) * OUTER * r * scale;
      const y = h.y - Math.sin(Theta) * OUTER * r * scale;
      arrow(ctx, x, y, -Math.sin(Theta), -Math.cos(Theta), tipLen);
    }
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = withAlpha(ink.accent, 0.75);
    ctx.stroke();

    // The weight of the tip, at its middle.
    const wx = h.x + Math.cos(Theta) * OUTER * 0.5 * scale;
    const wy = h.y - Math.sin(Theta) * OUTER * 0.5 * scale;
    ctx.beginPath();
    arrow(ctx, wx, wy, 0, 1, unit * 0.45);
    ctx.lineWidth = 1.1;
    ctx.strokeStyle = withAlpha(ink.line, 0.7);
    ctx.stroke();
  }

  function arrow(ctx, x, y, nx, ny, len) {
    if (Math.abs(len) < 2) return;
    const tx = x + nx * len;
    const ty = y + ny * len;
    const sg = Math.sign(len);
    const dx = nx * sg;
    const dy = ny * sg;
    ctx.moveTo(x, y);
    ctx.lineTo(tx, ty);
    ctx.moveTo(tx, ty);
    ctx.lineTo(tx - 5 * dx - 3 * dy, ty - 5 * dy + 3 * dx);
    ctx.moveTo(tx, ty);
    ctx.lineTo(tx - 5 * dx + 3 * dy, ty - 5 * dy - 3 * dx);
  }

  /* The plan view: the wing, the tip and the hinge line at its flare, with
     the flow from above, as in Fig. 17. */
  function drawPlan(ctx, ink) {
    if (plan.w <= 0) return;
    const px = plan.w / SEMISPAN;
    const strip = Math.max(CHORD * px, 5);
    const midY = plan.y + plan.h * 0.62;
    const join = plan.x + INNER * px;

    ctx.beginPath();
    ctx.rect(plan.x, midY - strip / 2, INNER * px, strip);
    ctx.lineWidth = 1;
    ctx.strokeStyle = ink.line;
    ctx.fillStyle = withAlpha(ink.wash, 0.12);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.rect(join, midY - strip / 2, OUTER * px, strip);
    ctx.fillStyle = withAlpha(ink.accent, 0.16);
    ctx.fill();
    ctx.strokeStyle = ink.accent;
    ctx.stroke();

    // The hinge line, flared from the flow.
    const reach = strip * 1.7;
    const b = flare();
    ctx.beginPath();
    ctx.setLineDash([3, 3]);
    ctx.moveTo(join - Math.sin(b) * reach, midY + Math.cos(b) * reach);
    ctx.lineTo(join + Math.sin(b) * reach, midY - Math.cos(b) * reach);
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = ink.accent;
    ctx.stroke();
    ctx.setLineDash([]);

    // The flow, from above.
    const fx = plan.x + plan.w * 0.5;
    ctx.beginPath();
    arrow(ctx, fx, plan.y, 0, 1, plan.h * 0.36);
    ctx.lineWidth = 1.1;
    ctx.strokeStyle = withAlpha(ink.line, 0.8);
    ctx.stroke();
  }

  /* The fold angle against time, with marks at a fixed spacing. */
  function drawTrace(ctx, ink) {
    if (trace.w <= 0 || history.length < 3) return;
    const lo = (-30 * Math.PI) / 180;
    const hi = (70 * Math.PI) / 180;
    const toX = (when) => trace.x + trace.w * (1 - (clock - when) / TRACE_SECONDS);
    const toY = (f) => trace.y + trace.h * (1 - (f - lo) / (hi - lo));

    ctx.beginPath();
    ctx.moveTo(trace.x, toY(0));
    ctx.lineTo(trace.x + trace.w, toY(0));
    ctx.moveTo(trace.x, trace.y);
    ctx.lineTo(trace.x, trace.y + trace.h);
    ctx.lineWidth = 1;
    ctx.strokeStyle = ink.faint;
    ctx.stroke();

    ctx.beginPath();
    history.forEach((s, i) => {
      if (i === 0) ctx.moveTo(toX(s.t), toY(s.fold)); else ctx.lineTo(toX(s.t), toY(s.fold));
    });
    ctx.lineTo(toX(clock), toY(fold()));
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = ink.body;
    ctx.stroke();

    ctx.beginPath();
    for (const s of history) {
      if (Math.abs((s.t / MARK_EVERY) - Math.round(s.t / MARK_EVERY)) > TRACE_STEP / MARK_EVERY / 2) continue;
      ctx.moveTo(toX(s.t) + 2.2, toY(s.fold));
      ctx.arc(toX(s.t), toY(s.fold), 2.2, 0, TWO_PI);
    }
    ctx.lineWidth = 1;
    ctx.strokeStyle = ink.accent;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(toX(clock), toY(fold()), 2.6, 0, TWO_PI);
    ctx.fillStyle = ink.accent;
    ctx.fill();
  }

  function paint(ctx, ink) {
    drawDatum(ctx, stage, ink);
    drawGhosts(ctx, ink);
    drawLoads(ctx, ink);
    drawInner(ctx, ink);
    drawTip(ctx, ink, Theta, ink.body, 2.6);
    drawHinge(ctx, ink);
    drawPlan(ctx, ink);
    drawTrace(ctx, ink);
  }

  function reset() {
    alphaNow = 0;
    q = 0; qd = 0; qdd = 0;
    Theta = 0; Thetad = 0;
    clock = 0;
    history = [];
    lastSample = -99;
  }

  return {
    fade: 1,

    /* The control on the lab page: the flare, which sets how much incidence
       a fold takes off the tip. */
    lab: {
      label: 'Hinge flare',
      unit: '°',
      min: 0,
      max: 45,
      step: 1,
      value: () => (flare() * 180) / Math.PI,
      set(v) { held = (v * Math.PI) / 180; },
      release() { held = null; },
      auto: {
        name: 'the flare of the paper, 10 degrees',
        status() {
          const i = Math.floor(clock / HOLD) % CASES.length;
          const next = CASES[(i + 1) % CASES.length];
          const left = Math.ceil(HOLD - (clock % HOLD));
          return 'Auto keeps the flare of the paper, 10°, and alternates its two cases of incidence, ' + HOLD + ' seconds each. '
            + 'Now ' + CASES[i] + '° of incidence; ' + next + '° in ' + left + ' s.';
        },
      },
      hold(v) {
        return 'Flare held at ' + v + '°. The incidence keeps alternating between 10° and 5°, and the tip '
          + 'coasts at the fold that this flare gives. Auto returns to 10°.';
      },
    },

    /** A few numbers of the state, for a test. */
    probe() {
      return {
        alpha: (alphaNow * 180) / Math.PI,
        fold: (fold() * 180) / Math.PI,
        hingeRise: q,
        tipRise: q + OUTER * Math.sin(Theta),
        flare: (flare() * 180) / Math.PI,
      };
    },

    layout(w, h, fit = {}) {
      /* A preview shows the top of the box, so the wing sits lower and in
         the middle, and takes the width. */
      const preview = Boolean(fit.preview);
      stage = stageFor(w, h, preview ? 0.30 : (fit.band ?? 0.14) + RISE);
      const sc = fit.scale || 1;
      // The tip rises to 0.45 of the semispan, so the room above the datum
      // limits the scale.
      const above = stage.y - 18;
      const spanPx = preview
        ? Math.min(stage.width * 0.82, above / 0.48)
        : Math.min(stage.width * 0.6 * sc, above / 0.48, 820);
      scale = spanPx / SEMISPAN;
      root = { x: preview ? stage.left + (stage.width - spanPx) / 2 : stage.left + stage.width * 0.02, y: stage.y };

      const room = w > 760;
      const width = room ? Math.min(stage.width * 0.17, 170) : 0;
      plan.w = width;
      plan.h = width * 0.34;
      plan.x = stage.right - width;
      plan.y = stage.y - plan.h - 14;
      trace.w = width;
      trace.h = width * 0.42;
      trace.x = plan.x;
      trace.y = stage.y - 4;

      reset();
    },

    frame(ctx, dt, t, ink) {
      advance(t);
      paint(ctx, ink);
    },

    still(ctx, ink, t) {
      const at = t || 6;
      // Run from the start: the first transient is the one the paper shows.
      reset();
      const end = Math.min(at, 90);
      while (clock < end) advance(Math.min(clock + 0.25, end));
      paint(ctx, ink);
      return at;
    },
  };
}
