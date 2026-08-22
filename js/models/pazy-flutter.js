/* Model: the Pazy wing at its trim, and the growth or the decay of a
   perturbation of one degree.

   The scene of the same name draws it. The first bending mode carries the
   trim and is stable. The second bending mode grows or decays at the rate
   the paper gives for the angle, and a soft limit holds the unstable
   motion at a small amplitude, where the paper also sees the peaks
   saturate. On the wing the second mode is at 29 Hz and on the screen at
   2.4 Hz, and the rates scale with the same ratio. */

const TWO_PI = Math.PI * 2;

/* The largest real part of the eigenvalues against the angle, in 1/s, from
   Fig. 6. The sign changes at 3.0 and at 4.6 degrees. */
export const GROWTH = [
  [0.5, -0.5], [0.75, -0.9], [1, -1.5], [1.25, -3.0], [1.5, -5.3], [1.75, -5.6],
  [2, -5.5], [2.25, -4.0], [2.5, -1.8], [2.75, -0.6], [3, 0.0], [3.25, 1.2],
  [3.5, 1.7], [3.75, 1.8], [4, 1.7], [4.25, 1.6], [4.5, 1.4], [4.6, 0.0],
  [4.75, -0.6], [5, -1.1], [5.25, -7.0], [5.5, -6.2], [5.75, -2.8], [6, -0.4],
  [6.5, -0.6], [7, -0.9], [7.5, -1.7], [8, -2.3],
];

export const FLUTTER_BAND = [3.0, 4.6];
export const ALPHA_MIN = 0.5;
export const ALPHA_MAX = 8;

/* The second bending mode is at 29 Hz in the paper and at 2.4 Hz on the
   screen. The rates scale with the same ratio, so the growth in one cycle
   is the one of the paper. */
const PAPER_HZ = 29;
const SCREEN_HZ = 2.4;
const TIME_SCALE = SCREEN_HZ / PAPER_HZ;
const FIRST_DAMPING = 0.12;
const KICK = 1;                   // degrees; the perturbation of the paper
const SECOND_SHARE = 0.12;        // the part of the kick the second mode takes
const LIMIT = 0.045;              // span fraction; where the soft limit holds the unstable mode
const STROBE_STEP = 0.15;
const LOG_STEP = 1 / 30;
const STEP = 1 / 240;

export const STROBES = 8;
export const CASES = [1.75, 4, 5, 7.5];  // degrees: the four cases of the paper's Fig. 10
export const HOLD = 11;           // seconds at each case
export const LOG_SECONDS = 6;     // seconds of tip velocity the trace shows
export const LIMIT_SPEED = LIMIT * TWO_PI * SCREEN_HZ;

/** The rise of the tip at the trim, as a fraction of the span, from the
    flutter chart the paper reproduces. */
export function trimTip(alphaDeg) {
  return 0.062 * alphaDeg - 0.0008 * alphaDeg * alphaDeg;
}

/** True if the angle is in the flutter band. */
export function inBand(alphaDeg) {
  return alphaDeg >= FLUTTER_BAND[0] && alphaDeg <= FLUTTER_BAND[1];
}

/** The growth rate at an angle, by interpolation in the table. */
export function growthAt(alphaDeg) {
  if (alphaDeg <= GROWTH[0][0]) return GROWTH[0][1];
  for (let i = 1; i < GROWTH.length; i++) {
    if (alphaDeg <= GROWTH[i][0]) {
      const [a0, g0] = GROWTH[i - 1];
      const [a1, g1] = GROWTH[i];
      return g0 + ((g1 - g0) * (alphaDeg - a0)) / (a1 - a0);
    }
  }
  return GROWTH[GROWTH.length - 1][1];
}

export function createPazyFlutterModel(secondOverFirst) {
  const omega2 = TWO_PI * SCREEN_HZ;
  const omega1 = omega2 / secondOverFirst;
  const history = [];
  const strobe = [];
  let alpha = CASES[0];
  let q1 = 0; let q1d = 0;
  let q2 = 0; let q2d = 0;
  let clock = 0;
  let lastLog = -99;
  let lastStrobe = -99;
  /* The lab can hold the angle. null runs the four cases of the paper in
     turn. */
  let held = null;

  function scheduled(t) {
    if (held !== null) return held;
    return CASES[Math.floor(t / HOLD) % CASES.length];
  }

  /** Put the wing at the trim plus one degree, at rest, as the paper does
      before each record. */
  function perturb(a) {
    alpha = a;
    const shift = trimTip(a + KICK) - trimTip(a);
    q1 = trimTip(a) + shift * (1 - SECOND_SHARE);
    q1d = 0;
    q2 = shift * SECOND_SHARE;
    q2d = 0;
    strobe.length = 0;
    lastStrobe = -99;
    history.length = 0;
    lastLog = -99;
  }

  function integrate(dt) {
    const trim = trimTip(alpha);
    const a1 = -2 * FIRST_DAMPING * omega1 * q1d - omega1 * omega1 * (q1 - trim);
    const sigma = TIME_SCALE * growthAt(alpha);
    const soft = 1.8 * TIME_SCALE * (q2 / LIMIT) * (q2 / LIMIT);
    const a2 = -omega2 * omega2 * q2 + 2 * (sigma - soft) * q2d;
    q1d += a1 * dt;
    q1 += q1d * dt;
    q2d += a2 * dt;
    q2 += q2d * dt;
  }

  function advance(t) {
    if (clock > t) {
      // The clock went back. Move the past with it.
      const by = clock - t;
      history.forEach((h) => { h.t -= by; });
      lastLog -= by;
      lastStrobe -= by;
      clock = t;
    }
    let left = Math.min(Math.max(t - clock, 0), 0.25);
    while (left > 0) {
      const h = Math.min(STEP, left);
      clock += h;
      const a = scheduled(clock);
      if (a !== alpha) perturb(a);
      integrate(h);
      left -= h;
      if (clock - lastStrobe >= STROBE_STEP) {
        lastStrobe = clock;
        strobe.push({ q1, q2 });
        while (strobe.length > STROBES) strobe.shift();
      }
      if (clock - lastLog >= LOG_STEP) {
        lastLog = clock;
        history.push({ t: clock, v: q1d + q2d });
        while (history.length && clock - history[0].t > LOG_SECONDS) history.shift();
      }
    }
  }

  return {
    history,
    strobe,
    get alpha() { return alpha; },
    get clock() { return clock; },
    get q1() { return q1; },
    get q2() { return q2; },
    get q1d() { return q1d; },
    get q2d() { return q2d; },
    get omega2() { return omega2; },
    scheduled,
    perturb,
    advance,
    /** A few numbers of the state, for a test. */
    probe() {
      return { alpha, q1, q2, growth: growthAt(alpha), trim: trimTip(alpha) };
    },
    reset(at = 0) { clock = at; perturb(scheduled(at)); },
    hold(v) { held = v; },
    release() { held = null; },
    heldValue() { return held; },
    setClock(t) { clock = t; },
  };
}
