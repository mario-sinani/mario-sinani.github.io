/* Model: a wing with a folding tip on a flared hinge.

   The scene of the same name draws it. The inner wing is a beam in its
   first bending mode, and the tip is a rigid body on the hinge. The
   equation of the tip holds the lift on its incidence, its weight, the
   inertial load of the rising hinge, and the damping of the joint. A fold
   of theta about a hinge flared by beta turns the chord by
   atan(tan(theta) sin(beta)), so the fold takes incidence off the tip and
   the tip coasts where its own lift carries it. The constants are
   calibrated to the two cases of the paper. */

export const INNER = 12;          // metres
export const OUTER = 4;
export const SEMISPAN = INNER + OUTER;
export const CHORD = 1;
export const FLARE = (10 * Math.PI) / 180;
export const TIP_SLOPE = 1.3765;  // the slope of the first mode at its tip, per unit of tip deflection and length

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

const STEP = 1 / 240;

export const CASES = [10, 5];     // degrees; the two cases of the paper
export const HOLD = 7;            // seconds for each case; the transient settles in about 6
export const TRACE_SECONDS = 14;
export const TRACE_STEP = 0.1;   // seconds between the samples of the trace

export function createHingedWingtipModel() {
  const history = [];
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

  return {
    history,
    get clock() { return clock; },
    get alphaNow() { return alphaNow; },
    get q() { return q; },
    get qd() { return qd; },
    get Theta() { return Theta; },
    flare,
    fold,
    hingeSlope,
    tipIncidence,
    advance,
    reset() {
      alphaNow = 0;
      q = 0; qd = 0; qdd = 0;
      Theta = 0; Thetad = 0;
      clock = 0;
      history.length = 0;
      lastSample = -99;
    },
    hold(v) { held = v; },
    release() { held = null; },
  };
}
