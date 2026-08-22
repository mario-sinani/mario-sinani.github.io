/* Model: the Pazy wing after a step in the angle of attack.

   The scene of the same name draws it. The wing is the first two bending
   modes under a load that follows the deformed surface: the incidence
   falls with the slope, and so does the vertical part of the force. The
   force therefore leaves the straight line of the linear model as the wing
   curls, which is the nonlinearity the paper learns.

   The transient decays, which is the stability constraint of the paper,
   and it settles at the deformed trim, which is the steady-state one. */

import { ROOTS, shape as modeShape, slope as modeSlope } from '../beam-modes-shape.js';
import { createSeries } from './series.js';

const TWO_PI = Math.PI * 2;
const TIP_RAW = [2.0, -2.0];
/* The tip-normalised modes: the integral of the square along the span is
   0.25, and 0.3915 for the first. */
const MODAL_MASS = 0.25;
const FIRST_INTEGRAL = 0.3915;

const FIRST_HZ = 0.42;            // the first bending mode, on the screen
const AERO_DAMPING = 0.09;        // of the first mode, from the plunge rate
const STRUCTURAL_DAMPING = 0.01;
/* The rise of the tip of the linear model at 8 degrees, as a fraction of
   the span. The true rise is smaller, because the surface turns away from
   the flow. */
const LINEAR_RISE_AT_8 = 0.50;
const STEP_LAG = 0.04;            // seconds; the step is sharp, but not a jump
const LOG_STEP = 1 / 30;
const STEP = 1 / 240;

export const SCHEDULE = [1, 2, 4, 7, 8, 4];   // degrees: the training set of the paper, and its test angle
export const HOLD = 7;            // seconds at each angle
export const LOG_SECONDS = 6;
export const ALPHA_8 = (8 * Math.PI) / 180;

export function createPazyStepModel(n) {
  const omega = [TWO_PI * FIRST_HZ, 0];
  omega[1] = omega[0] * (ROOTS[1] * ROOTS[1]) / (ROOTS[0] * ROOTS[0]);
  /* The lift per unit span per radian, in the units of the modes, and the
     speed in spans per second. The first sets the rise of the tip, the
     second the damping of the first mode. */
  const LOAD = (LINEAR_RISE_AT_8 * MODAL_MASS * omega[0] * omega[0]) / (ALPHA_8 * FIRST_INTEGRAL);
  const STREAM = LOAD / (2 * AERO_DAMPING * omega[0]);

  const shape = [new Float64Array(n + 1), new Float64Array(n + 1)];
  const slope = [new Float64Array(n + 1), new Float64Array(n + 1)];
  for (let m = 0; m < 2; m++) {
    for (let i = 0; i <= n; i++) {
      shape[m][i] = modeShape(m, i / n) / TIP_RAW[m];
      slope[m][i] = modeSlope(m, i / n) / TIP_RAW[m];
    }
  }

  const psi = new Float64Array(n + 1);
  const vel = new Float64Array(n + 1);
  const q = [0, 0];
  const qd = [0, 0];
  let alphaNow = 0;
  let clock = 0;
  const history = createSeries({ seconds: LOG_SECONDS });
  let lastLog = -99;
  let steady = { tip: 0, q: [0, 0] };
  let steadyFor = -1;
  /* The lab can hold the angle. null runs the schedule of the paper. */
  let held = null;

  /** The slope of the surface at each station, for a modal state. */
  function slopesFrom(qs) {
    for (let i = 0; i <= n; i++) psi[i] = qs[0] * slope[0][i] + qs[1] * slope[1][i];
  }

  function targetAlpha(t) {
    if (held !== null) return held;
    return (SCHEDULE[Math.floor(t / HOLD) % SCHEDULE.length] * Math.PI) / 180;
  }

  /** The normal load per unit span at station i, for an incidence and the
      slope and the normal velocity there. */
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
      stiffness, by iteration. */
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
      history.shiftTime(by);
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
      }
    }
  }

  /** The state a time ago, from the log. */
  function stateAgo(ago) {
    return history.nearest(clock - ago);
  }

  return {
    n,
    LOAD,
    get alphaNow() { return alphaNow; },
    get clock() { return clock; },
    get history() { return history; },
    /* Write the slope of the surface at each station into out. The
       state of a moment ago comes from stateAgo; with no state it is the
       one of now. */
    slopesInto(out, qs = q) {
      for (let i = 0; i <= n; i++) out[i] = qs[0] * slope[0][i] + qs[1] * slope[1][i];
    },
    /** The normal velocity of the surface at each station. */
    velocityInto(out) {
      for (let i = 0; i <= n; i++) out[i] = qd[0] * shape[0][i] + qd[1] * shape[1][i];
    },
    load,
    tipForce,
    settle,
    targetAlpha,
    advance,
    stateAgo,
    /** A few numbers of the state, for a test. */
    probe() {
      return {
        alpha: (alphaNow * 180) / Math.PI,
        tipRise: q[0] + q[1],
        tipForce: tipForce(alphaNow, q, qd) / (LOAD * ALPHA_8),
        linearForce: alphaNow / ALPHA_8,
        steadyForce: settle(targetAlpha(clock)).tip / (LOAD * ALPHA_8),
      };
    },
    /** Start at rest, with no past. */
    reset() {
      q[0] = 0; q[1] = 0; qd[0] = 0; qd[1] = 0;
      alphaNow = 0;
      clock = 0;
      history.clear();
      lastLog = -99;
      steadyFor = -1;
    },
    /** Start at the trim of the angle at the time from, for a fixed frame. */
    startAtTrim(from) {
      const trim = settle(targetAlpha(from));
      q[0] = trim.q[0]; q[1] = trim.q[1]; qd[0] = 0; qd[1] = 0;
      alphaNow = targetAlpha(from);
      clock = from;
      history.clear();
      lastLog = -99;
    },
    hold(v) { held = v; },
    release() { held = null; },
  };
}
