/* Model: a cantilever beam whose first bending mode and first axial mode
   exchange energy through a quadratic coupling.

   The bending stretches the axis by the square of its slope, and the
   axial force changes the stiffness of the bending. The sum of the
   energies is constant. estimateBound gives the envelope of the running
   average of the bending share over many starts, plus the gap the paper
   reports between its envelope and its bound.

   The scene of the same name draws this model. */

import { createSeries } from './series.js';

const TWO_PI = Math.PI * 2;
const BEND_HZ = 0.28;             // the first bending mode, on the screen
const RATIO = 6;                  // the axial frequency over the bending frequency; 58 and 14 in the paper
/* The quadratic coupling. It is small enough that the axial force never
   cancels the stiffness of the bending. With the amplitudes below it moves
   1 to 18 per cent of the energy out of the bending mode, which is the
   range of the two cases of the paper. */
const COUPLING = 35;
const BOUND_GAP = 1.05;           // the paper finds its bounds 5 per cent over the envelope
const BOUND_RUNS = 16;
const BOUND_SECONDS = 60;
const STEP = 1 / 240;
const STROBE_STEP = 0.09;

export const STROBES = 12;       // the shapes the strobe keeps
export const AMPLITUDES = [0.08, 0.2, 0.32, 0.4];   // the tip amplitude, as a fraction of the length
export const HOLD = 14;           // seconds for each amplitude

/** The first axial mode of a clamped-free rod. Its largest value is one, at
    the tip. */
export function axialMode(xi) {
  return Math.sin((Math.PI / 2) * xi);
}

/** One step of the two modes: x1 is the bending, x2 the axial. */
function stepModes(s, dt, w1, w2) {
  const a1 = -w1 * w1 * s.x1 - COUPLING * s.x1 * s.x2;
  const a2 = -w2 * w2 * s.x2 - 0.5 * COUPLING * s.x1 * s.x1;
  s.v1 += a1 * dt;
  s.x1 += s.v1 * dt;
  s.v2 += a2 * dt;
  s.x2 += s.v2 * dt;
}

function energies(s, w1, w2) {
  const e1 = 0.5 * s.v1 * s.v1 + 0.5 * w1 * w1 * s.x1 * s.x1;
  const e2 = 0.5 * s.v2 * s.v2 + 0.5 * w2 * w2 * s.x2 * s.x2;
  return { e1, e2, share: e1 / (e1 + e2) };
}

export function createBeamModel() {
  const w1 = TWO_PI * BEND_HZ;
  const w2 = w1 * RATIO;
  const state = { x1: 0, v1: 0, x2: 0, v2: 0 };
  const strobe = createSeries({ keep: STROBES });
  let amplitude = AMPLITUDES[0];
  let clock = 0;
  let meanSum = 0;
  let meanTime = 0;
  let bound = 1;
  let lastStrobe = -99;
  /* The lab can hold the amplitude. null runs the four amplitudes in turn. */
  let held = null;

  function scheduled(t) {
    if (held !== null) return held;
    return AMPLITUDES[Math.floor(t / HOLD) % AMPLITUDES.length];
  }

  /** Start a run with all the energy in the bending mode. */
  function launch(a, at) {
    amplitude = a;
    state.x1 = a; state.v1 = 0; state.x2 = 0; state.v2 = 0;
    meanSum = 0;
    meanTime = 0;
    strobe.clear();
    lastStrobe = -99;
    bound = estimateBound(a);
  }

  /** The envelope of the running average of the bending share over many
      starts, plus the gap the paper reports between its envelope and its
      bound. */
  function estimateBound(a) {
    const total = 0.5 * w1 * w1 * a * a;
    let top = 0;
    for (let r = 0; r < BOUND_RUNS; r++) {
      // A deterministic spread of starts: the share of the bending, and the
      // phase of each mode.
      const share = r / (BOUND_RUNS - 1);
      const ph1 = (r * 2.399) % TWO_PI;
      const ph2 = (r * 1.618) % TWO_PI;
      const s = {
        x1: (Math.sqrt(2 * share * total) / w1) * Math.cos(ph1),
        v1: Math.sqrt(2 * share * total) * Math.sin(ph1),
        x2: (Math.sqrt(2 * (1 - share) * total) / w2) * Math.cos(ph2),
        v2: Math.sqrt(2 * (1 - share) * total) * Math.sin(ph2),
      };
      const dt = 1 / 120;
      let sum = 0;
      let count = 0;
      for (let k = 0; k < BOUND_SECONDS / dt; k++) {
        stepModes(s, dt, w1, w2);
        sum += energies(s, w1, w2).share;
        count += 1;
      }
      if (Number.isFinite(sum)) top = Math.max(top, sum / count);
    }
    return Math.min(1, top * BOUND_GAP);
  }

  function advance(t) {
    if (clock > t) clock = t;
    let left = Math.min(Math.max(t - clock, 0), 0.25);
    while (left > 0) {
      const h = Math.min(STEP, left);
      clock += h;
      const a = scheduled(clock);
      if (a !== amplitude) launch(a, clock);
      stepModes(state, h, w1, w2);
      meanSum += energies(state, w1, w2).share * h;
      meanTime += h;
      left -= h;
      if (clock - lastStrobe >= STROBE_STEP) {
        lastStrobe = clock;
        strobe.push({ x1: state.x1, x2: state.x2 });
      }
    }
  }

  return {
    strobe,
    /** The bending coordinate, which sets the shape of the beam. */
    get bending() { return state.x1; },
    /** The axial coordinate, which moves the stations along it. */
    get axial() { return state.x2; },
    get clock() { return clock; },
    get amplitude() { return amplitude; },
    get bound() { return bound; },
    /** The share of the energy that the bending keeps, now and on average. */
    energies() {
      const e = energies(state, w1, w2);
      return { ...e, mean: meanTime > 0 ? meanSum / meanTime : e.share, total: 0.5 * w1 * w1 * amplitude * amplitude };
    },
    /** The energy of the coupling itself, which the sum must hold. */
    coupling() { return 0.5 * COUPLING * state.x1 * state.x1 * state.x2; },
    advance,
    /** A few numbers of the state, for a test. */
    probe() {
      const e = energies(state, w1, w2);
      return {
        amplitude,
        share: e.share,
        mean: meanTime > 0 ? meanSum / meanTime : e.share,
        bound,
        energy: (e.e1 + e.e2 + 0.5 * COUPLING * state.x1 * state.x1 * state.x2)
          / (0.5 * w1 * w1 * amplitude * amplitude),
      };
    },
    reset(at = 0) { clock = at; launch(scheduled(at), at); },
    setAt(t, a) { launch(a, t); },
    hold(a) { held = a; },
    heldValue() { return held; },
    release() { held = null; },
    scheduled,
  };
}
