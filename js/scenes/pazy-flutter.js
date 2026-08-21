/* Scene: the Pazy wing at its trim, and the growth or the decay of a
   perturbation with the angle of attack.

   Background for "Data-Driven Parametric Aeroelastic Modeling of the
   Pazy Wing".

   The paper trims the wing at angles of attack from 0.5 to 8 degrees,
   perturbs each trim by one degree, and records the response. The wing
   flutters in a band of angles only: from 3 to 4.6 degrees the second
   out-of-plane bending mode couples with the first torsion mode and
   the perturbation grows; below and above the band it decays. The
   largest real part of the eigenvalues against the angle, the paper's
   Fig. 6, is the curve its parametric model learns.

   The scene holds the trim shape of the angle, integrates the first
   two bending modes with the growth rate the paper gives at that
   angle, and twists the wing with the second mode, as the coupled
   flutter mode does. A soft limit holds the unstable motion at a small
   amplitude, where the paper also sees the peaks saturate. The faint
   fan is the trims of the whole range, as in the paper's Fig. 2. The
   trace is the velocity of the tip against time, as in the paper's
   Fig. 7 and Fig. 10: it grows inside the band and dies outside it.
   Below it, the chart is the growth rate against the angle, with the
   flutter band and a marker at the angle of the moment. */

import { withAlpha } from '../ink.js';
import { createPazyWing, PAZY_ASPECT, OBLIQUE } from '../pazy-wing.js';
import { stageFor, drawDatum } from './stage.js';

const TWO_PI = Math.PI * 2;
const STATIONS = 48;
const ROOTS = [1.8751040687, 4.6940911330];
const SIGMA = [0.734096, 1.018467];
const TIP_RAW = [2.0, -2.0];

/* The largest real part of the eigenvalues against the angle of attack,
   in 1/s, read from Fig. 6 of the paper. The sign changes at 3.0 and
   at 4.6 degrees. */
const GROWTH = [
  [0.5, -0.5], [0.75, -0.9], [1, -1.5], [1.25, -3.0], [1.5, -5.3], [1.75, -5.6],
  [2, -5.5], [2.25, -4.0], [2.5, -1.8], [2.75, -0.6], [3, 0.0], [3.25, 1.2],
  [3.5, 1.7], [3.75, 1.8], [4, 1.7], [4.25, 1.6], [4.5, 1.4], [4.6, 0.0],
  [4.75, -0.6], [5, -1.1], [5.25, -7.0], [5.5, -6.2], [5.75, -2.8], [6, -0.4],
  [6.5, -0.6], [7, -0.9], [7.5, -1.7], [8, -2.3],
];
const FLUTTER_BAND = [3.0, 4.6];
const ALPHA_MIN = 0.5;
const ALPHA_MAX = 8;

/* The second bending mode is at 29 Hz in the paper and at 2.4 Hz on the
   screen. The growth rates scale with the same ratio, so the growth in
   one cycle is the one the paper gives. */
const PAPER_HZ = 29;
const SCREEN_HZ = 2.4;
const TIME_SCALE = SCREEN_HZ / PAPER_HZ;
const FIRST_DAMPING = 0.12;
const KICK = 1;                   // degrees; the perturbation of the paper
const SECOND_SHARE = 0.12;        // the part of the kick the second mode takes
const LIMIT = 0.045;              // span fraction; where the soft limit holds the unstable mode
const TWIST_GAIN = 2.2;           // radians of tip twist per span fraction of the second mode, a quarter cycle behind
const CASES = [1.75, 4, 5, 7.5];  // degrees: the four cases of the paper's Fig. 10
const HOLD = 11;                  // seconds at each case
const STROBE_STEP = 0.15;
const STROBES = 8;
const LOG_SECONDS = 6;            // seconds of tip velocity the trace shows
const LOG_STEP = 1 / 30;
const FAN = [1, 2, 3, 4, 5, 6, 7, 8];
/* The subject rises above its datum, so the datum sits lower than the
   band a page gives by this fraction of the height. */
const RISE = 0.10;
const STEP = 1 / 240;

function rawShape(m, xi) {
  const t = ROOTS[m] * xi;
  return Math.cosh(t) - Math.cos(t) - SIGMA[m] * (Math.sinh(t) - Math.sin(t));
}

function rawSlope(m, xi) {
  const b = ROOTS[m];
  const t = b * xi;
  return b * (Math.sinh(t) + Math.sin(t) - SIGMA[m] * (Math.cosh(t) - Math.cos(t)));
}

/** The rise of the tip at the trim, as a fraction of the span, from
    the flutter chart the paper reproduces. */
function trimTip(alphaDeg) {
  return 0.062 * alphaDeg - 0.0008 * alphaDeg * alphaDeg;
}

/** Whether an angle is in the flutter band. */
function inBand(alphaDeg) {
  return alphaDeg >= FLUTTER_BAND[0] && alphaDeg <= FLUTTER_BAND[1];
}

/** The growth rate at an angle, by interpolation in the table. */
function growthAt(alphaDeg) {
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

export function createPazyFlutter() {
  const n = STATIONS;
  const wing = createPazyWing(n);
  const omega2 = TWO_PI * SCREEN_HZ;
  const omega1 = omega2 * (ROOTS[0] * ROOTS[0]) / (ROOTS[1] * ROOTS[1]);
  const slope = [new Float64Array(n + 1), new Float64Array(n + 1)];
  for (let m = 0; m < 2; m++) {
    for (let i = 0; i <= n; i++) slope[m][i] = rawSlope(m, i / n) / TIP_RAW[m];
  }
  const psi = new Float64Array(n + 1);
  const theta = new Float64Array(n + 1);
  const flat = new Float64Array(n + 1);
  const inset = { x: 0, y: 0, w: 0, h: 0 };
  const trace = { x: 0, y: 0, w: 0, h: 0 };
  let stage = null;
  let history = [];
  let lastLog = -99;
  let span = 300;
  let alpha = CASES[0];
  let q1 = 0; let q1d = 0;
  let q2 = 0; let q2d = 0;
  let clock = 0;
  let strobe = [];
  let lastStrobe = -99;
  /* The lab can hold the angle. The value null means that the four
     cases of the paper run in turn. */
  let held = null;
  let caseIndex = -1;

  function scheduled(t) {
    if (held !== null) return held;
    return CASES[Math.floor(t / HOLD) % CASES.length];
  }

  /** Put the wing at the trim of the angle plus one degree, at rest,
      as the paper does before each record. */
  function perturb(a) {
    alpha = a;
    const shift = trimTip(a + KICK) - trimTip(a);
    q1 = trimTip(a) + shift * (1 - SECOND_SHARE);
    q1d = 0;
    q2 = shift * SECOND_SHARE;
    q2d = 0;
    strobe = [];
    lastStrobe = -99;
    history = [];
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

  /* The trace: the velocity of the tip against time. The scale is the
     velocity of the limit cycle, so the growth fills the box and the
     decay empties it. */
  function drawTrace(ctx, ink) {
    if (trace.h <= 0 || history.length < 2) return;
    const midY = trace.y + trace.h / 2;
    const scale = LIMIT * omega2 * 1.15;
    const toX = (when) => trace.x + trace.w * (1 - (clock - when) / LOG_SECONDS);
    const toY = (v) => midY - Math.max(-1, Math.min(1, v / scale)) * (trace.h / 2) * 0.92;

    ctx.beginPath();
    ctx.moveTo(trace.x, midY);
    ctx.lineTo(trace.x + trace.w, midY);
    ctx.moveTo(trace.x, trace.y);
    ctx.lineTo(trace.x, trace.y + trace.h);
    ctx.lineWidth = 1;
    ctx.strokeStyle = ink.faint;
    ctx.stroke();

    ctx.beginPath();
    history.forEach((h, i) => {
      const px = toX(h.t);
      const py = toY(h.v);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = ink.body;
    ctx.stroke();

    const last = history[history.length - 1];
    ctx.beginPath();
    ctx.arc(toX(last.t), toY(last.v), 2.6, 0, TWO_PI);
    ctx.fillStyle = ink.accent;
    ctx.fill();
  }

  function slopesFrom(a, b) {
    for (let i = 0; i <= n; i++) psi[i] = a * slope[0][i] + b * slope[1][i];
  }

  /* The twist follows the rate of the second mode: in the coupled
     flutter mode the torsion is a quarter cycle behind the bending.
     The shape is the first torsion mode. */
  function twistFrom() {
    const tip = (TWIST_GAIN * q2d) / omega2;
    for (let i = 0; i <= n; i++) theta[i] = tip * Math.sin((Math.PI / 2) * (i / n));
  }

  function drawFan(ctx, ink) {
    for (const a of FAN) {
      slopesFrom(trimTip(a), 0);
      wing.axis(ctx, psi, withAlpha(ink.line, 0.22));
    }
  }

  function drawStrobe(ctx, ink) {
    strobe.forEach((s, k) => {
      slopesFrom(s.q1, s.q2);
      wing.axis(ctx, psi, withAlpha(ink.body, (0.05 + 0.2 * (k + 1)) / STROBES));
    });
  }

  /* The inset: the growth rate against the angle, the zero line, the
     flutter band and the marker. */
  function drawInset(ctx, ink) {
    if (inset.w <= 0) return;
    const lo = -8;
    const hi = 3;
    const toX = (a) => inset.x + inset.w * ((a - ALPHA_MIN) / (ALPHA_MAX - ALPHA_MIN));
    const toY = (g) => inset.y + inset.h * (1 - (g - lo) / (hi - lo));

    ctx.fillStyle = withAlpha(ink.accent, 0.08);
    ctx.fillRect(toX(FLUTTER_BAND[0]), inset.y, toX(FLUTTER_BAND[1]) - toX(FLUTTER_BAND[0]), inset.h);

    ctx.beginPath();
    ctx.setLineDash([3, 3]);
    ctx.moveTo(inset.x, toY(0));
    ctx.lineTo(inset.x + inset.w, toY(0));
    ctx.lineWidth = 1;
    ctx.strokeStyle = withAlpha(ink.line, 0.55);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.beginPath();
    ctx.moveTo(inset.x, inset.y);
    ctx.lineTo(inset.x, inset.y + inset.h);
    ctx.lineTo(inset.x + inset.w, inset.y + inset.h);
    ctx.strokeStyle = ink.faint;
    ctx.stroke();

    ctx.beginPath();
    GROWTH.forEach(([a, g], i) => {
      if (i === 0) ctx.moveTo(toX(a), toY(g)); else ctx.lineTo(toX(a), toY(g));
    });
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = ink.body;
    ctx.stroke();

    const mx = toX(alpha);
    const my = toY(growthAt(alpha));
    ctx.beginPath();
    ctx.moveTo(mx, inset.y + inset.h);
    ctx.lineTo(mx, my);
    ctx.lineWidth = 1;
    ctx.strokeStyle = withAlpha(ink.accent, 0.4);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(mx, my, 2.8, 0, TWO_PI);
    ctx.fillStyle = ink.accent;
    ctx.fill();
  }

  function paint(ctx, ink) {
    drawDatum(ctx, stage, ink);
    drawFan(ctx, ink);
    drawStrobe(ctx, ink);
    slopesFrom(q1, q2);
    twistFrom();
    wing.draw(ctx, ink, psi, theta);
    drawTrace(ctx, ink);
    drawInset(ctx, ink);
  }

  return {
    fade: 1,

    /* The control of this scene on the lab page. A new angle is a new
       trim with the perturbation of the paper. */
    lab: {
      label: 'Angle of attack',
      unit: '°',
      min: ALPHA_MIN,
      max: ALPHA_MAX,
      step: 0.25,
      value: () => alpha,
      set(v) { held = v; },
      release() { held = null; },
      auto: {
        name: 'the four cases of the paper',
        status() {
          const i = Math.floor(clock / HOLD) % CASES.length;
          const next = CASES[(i + 1) % CASES.length];
          const left = Math.ceil(HOLD - (clock % HOLD));
          return 'Auto runs the four cases of the paper, 11 seconds each. Now ' + alpha + '°, '
            + (inBand(alpha) ? 'inside the flutter band: the perturbation grows' : 'outside the band: the perturbation decays')
            + '; next ' + next + '° in ' + left + ' s.';
        },
      },
      hold(v) {
        return 'Held at ' + v + '°, ' + (inBand(v) ? 'inside' : 'outside') + ' the flutter band of 3° to 4.6°. '
          + 'A new angle is a new trim with the perturbation of one degree. Auto returns to the four cases.';
      },
    },

    /** A few numbers of the state, for a test. */
    probe() {
      return { alpha, q1, q2, growth: growthAt(alpha), trim: trimTip(alpha) };
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
      // The trace stands above the chart. It goes if there is no room.
      trace.w = inset.w;
      trace.h = inset.h * 0.85;
      trace.x = inset.x;
      trace.y = inset.y - trace.h - 14;
      if (trace.y < 6) trace.h = 0;

      for (let i = 0; i <= n; i++) flat[i] = 0;
      clock = 0;
      caseIndex = -1;
      perturb(scheduled(0));
    },

    frame(ctx, dt, t, ink) {
      advance(t);
      paint(ctx, ink);
    },

    still(ctx, ink, t) {
      const at = t || 19;   // 8 s into the case at 4 degrees, inside the band
      /* Run from the last perturbation to this time, so the strobe
         shows the growth or the decay. */
      const a = scheduled(at);
      const since = held !== null ? Math.min(at, 6) : at % HOLD;
      perturb(a);
      clock = at - since;
      while (clock < at) advance(Math.min(clock + 0.25, at));
      paint(ctx, ink);
      return at;
    },
  };
}
