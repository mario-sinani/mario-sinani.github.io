/* Scene: the Pazy wing after a step in the angle of attack.

   Background for "Physics-Informed Data-Driven Modelling of Nonlinear
   Aerodynamic Forces of the Pazy Wing".

   The paper trains its model on the response of the wing to step
   inputs in the angle of attack, at 1, 2, 7 and 8 degrees, and tests
   it at 4 degrees. The wing is very flexible: its tip rises to almost
   half the span, and the aerodynamic force is then a nonlinear function
   of the shape. The scene integrates the first two bending modes under
   a load that follows the deformed surface: the incidence that the
   surface sees falls with its slope, and so does the vertical part of
   the force. The force therefore bends away from the straight line of
   the linear model as the wing curls.

   The two constraints of the paper are visible. The transient decays,
   which is the stability constraint. It settles at the deformed shape
   of the trim, which is the steady-state constraint. The inset is the
   vertical force at the tip against time, with the steady level of the
   nonlinear model and the level that the linear model gives. */

import { withAlpha } from '../ink.js';
import { createPazyWing, PAZY_ASPECT, OBLIQUE } from '../pazy-wing.js';
import { stageFor, drawDatum } from './stage.js';

const TWO_PI = Math.PI * 2;
const STATIONS = 48;
const ROOTS = [1.8751040687, 4.6940911330];
const SIGMA = [0.734096, 1.018467];
const TIP_RAW = [2.0, -2.0];
/* The tip-normalised modes have the integral 0.25 of their square along
   the span, and the first has the integral 0.3915. */
const MODAL_MASS = 0.25;
const FIRST_INTEGRAL = 0.3915;

const FIRST_HZ = 0.42;            // the first bending mode, on the screen
const AERO_DAMPING = 0.09;        // of the first mode, from the plunge rate
const STRUCTURAL_DAMPING = 0.01;
/* The rise of the tip that the linear model gives at 8 degrees, as a
   fraction of the span. The true rise is smaller, because the surface
   turns away from the flow as it curls. */
const LINEAR_RISE_AT_8 = 0.50;
const STEP_LAG = 0.04;            // seconds; the step is sharp, but not a jump
const SCHEDULE = [1, 2, 4, 7, 8, 4];   // degrees: the training set of the paper, and its test angle
const HOLD = 7;                   // seconds at each angle
const LOG_SECONDS = 6;
const LOG_STEP = 1 / 30;
const GHOSTS = [0.6, 0.4, 0.2];   // seconds ago
/* The subject rises above its datum, so the datum sits lower than the
   band a page gives by this fraction of the height. */
const RISE = 0.10;
const STEP = 1 / 240;

const ALPHA_8 = (8 * Math.PI) / 180;

function rawShape(m, xi) {
  const t = ROOTS[m] * xi;
  return Math.cosh(t) - Math.cos(t) - SIGMA[m] * (Math.sinh(t) - Math.sin(t));
}

function rawSlope(m, xi) {
  const b = ROOTS[m];
  const t = b * xi;
  return b * (Math.sinh(t) + Math.sin(t) - SIGMA[m] * (Math.cosh(t) - Math.cos(t)));
}

export function createPazyStep() {
  const n = STATIONS;
  const wing = createPazyWing(n);
  const omega = [TWO_PI * FIRST_HZ, 0];
  omega[1] = omega[0] * (ROOTS[1] * ROOTS[1]) / (ROOTS[0] * ROOTS[0]);
  /* The lift per unit span per radian, in the units of the modes, and
     the speed of the stream in spans per second. The first sets the
     rise of the tip, the second the damping of the first mode. */
  const LOAD = (LINEAR_RISE_AT_8 * MODAL_MASS * omega[0] * omega[0]) / (ALPHA_8 * FIRST_INTEGRAL);
  const STREAM = LOAD / (2 * AERO_DAMPING * omega[0]);

  const shape = [new Float64Array(n + 1), new Float64Array(n + 1)];
  const slope = [new Float64Array(n + 1), new Float64Array(n + 1)];
  for (let m = 0; m < 2; m++) {
    for (let i = 0; i <= n; i++) {
      shape[m][i] = rawShape(m, i / n) / TIP_RAW[m];
      slope[m][i] = rawSlope(m, i / n) / TIP_RAW[m];
    }
  }

  const psi = new Float64Array(n + 1);
  const theta = new Float64Array(n + 1);   // no twist in this scene
  const vel = new Float64Array(n + 1);
  const inset = { x: 0, y: 0, w: 0, h: 0 };
  let stage = null;
  let span = 300;
  const q = [0, 0];
  const qd = [0, 0];
  let alphaNow = 0;
  let clock = 0;
  let history = [];
  let lastLog = -99;
  let steady = { tip: 0, q: [0, 0] };
  let steadyFor = -1;
  /* The lab can hold the angle. The value null means that the schedule
     of the paper runs. */
  let held = null;

  function targetAlpha(t) {
    if (held !== null) return held;
    return (SCHEDULE[Math.floor(t / HOLD) % SCHEDULE.length] * Math.PI) / 180;
  }

  function slopesFrom(qs) {
    for (let i = 0; i <= n; i++) psi[i] = qs[0] * slope[0][i] + qs[1] * slope[1][i];
  }

  /** The normal load per unit span at station i, for an incidence and
      the slope and the normal velocity of the station. */
  function load(alpha, slopeAt, velocity) {
    return LOAD * (alpha * Math.cos(slopeAt) - velocity / STREAM);
  }

  /** The vertical force at the tip, which the paper plots. */
  function tipForce(alpha, qs, qds) {
    const s = qs[0] * slope[0][n] + qs[1] * slope[1][n];
    const v = qds[0] * shape[0][n] + qds[1] * shape[1][n];
    return load(alpha, s, v) * Math.cos(s);
  }

  function integrate(dt, alpha) {
    slopesFrom(q);
    for (let i = 0; i <= n; i++) vel[i] = qd[0] * shape[0][i] + qd[1] * shape[1][i];
    const ds = 1 / n;
    const Q = [0, 0];
    for (let i = 1; i <= n; i++) {
      const ln = load(alpha, psi[i], vel[i]);
      Q[0] += ln * shape[0][i] * ds;
      Q[1] += ln * shape[1][i] * ds;
    }
    for (let m = 0; m < 2; m++) {
      const acc = Q[m] / MODAL_MASS - 2 * STRUCTURAL_DAMPING * omega[m] * qd[m] - omega[m] * omega[m] * q[m];
      qd[m] += acc * dt;
      q[m] += qd[m] * dt;
    }
  }

  /** The deformed trim of an angle: the balance of the load and the
      stiffness, found by iteration. */
  function settle(alpha) {
    if (steadyFor === alpha) return steady;
    const qs = [0, 0];
    const ds = 1 / n;
    for (let k = 0; k < 80; k++) {
      const Q = [0, 0];
      for (let i = 1; i <= n; i++) {
        const s = qs[0] * slope[0][i] + qs[1] * slope[1][i];
        const ln = load(alpha, s, 0);
        Q[0] += ln * shape[0][i] * ds;
        Q[1] += ln * shape[1][i] * ds;
      }
      for (let m = 0; m < 2; m++) qs[m] += 0.5 * (Q[m] / (MODAL_MASS * omega[m] * omega[m]) - qs[m]);
    }
    steady = { q: qs, tip: tipForce(alpha, qs, [0, 0]) };
    steadyFor = alpha;
    return steady;
  }

  /** Step the wing with a fixed step up to the time t. */
  function advance(t) {
    if (clock > t) {
      // The clock went back. Move the past with it.
      const by = clock - t;
      history.forEach((h) => { h.t -= by; });
      lastLog -= by;
      clock = t;
    }
    let left = Math.min(Math.max(t - clock, 0), 0.25);
    while (left > 0) {
      const h = Math.min(STEP, left);
      const target = targetAlpha(clock + h);
      alphaNow += (target - alphaNow) * Math.min(1, h / STEP_LAG);
      integrate(h, alphaNow);
      clock += h;
      left -= h;
      if (clock - lastLog >= LOG_STEP) {
        lastLog = clock;
        history.push({ t: clock, q: [q[0], q[1]], force: tipForce(alphaNow, q, qd) });
        while (history.length && clock - history[0].t > LOG_SECONDS) history.shift();
      }
    }
  }

  /** The state a time ago, from the log. */
  function stateAgo(ago) {
    if (!history.length) return null;
    const when = clock - ago;
    let best = history[0];
    for (const h of history) if (Math.abs(h.t - when) < Math.abs(best.t - when)) best = h;
    return best;
  }

  function drawGhosts(ctx, ink) {
    GHOSTS.forEach((ago, k) => {
      const s = stateAgo(ago);
      if (!s) return;
      slopesFrom(s.q);
      wing.ghost(ctx, psi, theta, withAlpha(ink.body, 0.07 + 0.06 * k));
    });
  }

  function drawLoad(ctx, ink) {
    slopesFrom(q);
    for (let i = 0; i <= n; i++) vel[i] = qd[0] * shape[0][i] + qd[1] * shape[1][i];
    const unit = LOAD * ALPHA_8;
    wing.arrows(ctx, ink, psi, (i) => (load(alphaNow, psi[i], vel[i]) / unit) * span * 0.16);
  }

  /* The inset: the vertical force at the tip against time. The dashed
     lines are the level of the linear model and the level the
     nonlinear model settles at. */
  function drawInset(ctx, ink) {
    if (inset.w <= 0 || history.length < 2) return;
    const unit = LOAD * ALPHA_8;
    const toX = (when) => inset.x + inset.w * (1 - (clock - when) / LOG_SECONDS);
    const toY = (f) => inset.y + inset.h * (1 - (f / unit + 0.25) / 1.4);

    ctx.beginPath();
    ctx.moveTo(inset.x, toY(0));
    ctx.lineTo(inset.x + inset.w, toY(0));
    ctx.moveTo(inset.x, inset.y);
    ctx.lineTo(inset.x, inset.y + inset.h);
    ctx.lineWidth = 1;
    ctx.strokeStyle = ink.faint;
    ctx.stroke();

    const alpha = targetAlpha(clock);
    const linear = LOAD * alpha;
    const trim = settle(alpha).tip;
    ctx.beginPath();
    ctx.setLineDash([3, 3]);
    ctx.moveTo(inset.x, toY(linear));
    ctx.lineTo(inset.x + inset.w, toY(linear));
    ctx.lineWidth = 1;
    ctx.strokeStyle = withAlpha(ink.line, 0.55);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(inset.x, toY(trim));
    ctx.lineTo(inset.x + inset.w, toY(trim));
    ctx.strokeStyle = withAlpha(ink.accent, 0.55);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.beginPath();
    history.forEach((h, i) => {
      const px = toX(h.t);
      const py = toY(h.force);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = ink.body;
    ctx.stroke();

    const last = history[history.length - 1];
    ctx.beginPath();
    ctx.arc(toX(last.t), toY(last.force), 2.6, 0, TWO_PI);
    ctx.fillStyle = ink.accent;
    ctx.fill();
  }

  function paint(ctx, ink) {
    drawDatum(ctx, stage, ink);
    drawGhosts(ctx, ink);
    drawLoad(ctx, ink);
    slopesFrom(q);
    wing.draw(ctx, ink, psi, theta);
    drawInset(ctx, ink);
  }

  return {
    // A figure with lines. The engine clears it completely in each
    // frame.
    fade: 1,

    /* The control of this scene on the lab page. Each new value is a
       step input, as in the paper. */
    lab: {
      label: 'Angle of attack',
      unit: '°',
      min: 0,
      max: 8,
      step: 0.25,
      value: () => (targetAlpha(clock) * 180) / Math.PI,
      set(v) { held = (v * Math.PI) / 180; },
      release() { held = null; },
      auto: {
        name: 'the steps of the paper',
        status() {
          const i = Math.floor(clock / HOLD) % SCHEDULE.length;
          const next = SCHEDULE[(i + 1) % SCHEDULE.length];
          const left = Math.ceil(HOLD - (clock % HOLD));
          return 'Auto runs the steps of the paper: 1, 2, 4, 7 and 8 degrees, 7 seconds each. '
            + 'Now a step to ' + SCHEDULE[i] + '°; next ' + next + '° in ' + left + ' s.';
        },
      },
      hold(v) {
        return 'Held at ' + v + '°. Each new value of the slider is a step input, and the wing '
          + 'answers with a transient. Auto returns to the steps of the paper.';
      },
    },

    /** A few numbers of the state, for a test. */
    probe() {
      slopesFrom(q);
      wing.trace(psi);
      return {
        alpha: (alphaNow * 180) / Math.PI,
        tipRise: q[0] + q[1],
        tipForce: tipForce(alphaNow, q, qd) / (LOAD * ALPHA_8),
        linearForce: alphaNow / ALPHA_8,
        steadyForce: settle(targetAlpha(clock)).tip / (LOAD * ALPHA_8),
        datum: stage.y,
        span,
      };
    },

    layout(w, h, fit = {}) {
      /* A preview shows the top of the box in a small window. The wing
         then sits lower and in the middle, and it takes the width. */
      const preview = Boolean(fit.preview);
      stage = stageFor(w, h, preview ? 0.30 : (fit.band ?? 0.14) + RISE);
      const scale = fit.scale || 1;
      // The tip rises to half the span, so the room above the datum
      // limits the span.
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

      q[0] = 0; q[1] = 0; qd[0] = 0; qd[1] = 0;
      alphaNow = 0;
      clock = 0;
      history = [];
      lastLog = -99;
      steadyFor = -1;
    },

    frame(ctx, dt, t, ink) {
      advance(t);
      paint(ctx, ink);
    },

    still(ctx, ink, t) {
      const at = t || 30;   // 1.5 s into the step to 8 degrees
      /* Start from the trim of the angle before the log, and run the
         schedule from there, so the log and the ghosts have a past. */
      const from = Math.max(0, at - LOG_SECONDS - 1.5);
      const trim = settle(targetAlpha(from));
      q[0] = trim.q[0]; q[1] = trim.q[1]; qd[0] = 0; qd[1] = 0;
      alphaNow = targetAlpha(from);
      clock = from;
      history = [];
      lastLog = -99;
      while (clock < at) advance(Math.min(clock + 0.25, at));
      paint(ctx, ink);
      return at;
    },
  };
}
