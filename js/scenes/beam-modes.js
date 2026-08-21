/* Scene: a cantilever beam whose bending mode and axial mode exchange
   energy, with a bound on the share the bending keeps. Background for
   "Capturing & Bounding Nonlinear Modal Energy Transfer for Geometrically
   Exact Beams using Semidefinite Programming".

   The modes of a linear beam never exchange energy. In a geometrically
   exact beam they do, through quadratic terms, and the paper finds that the
   axial modes make it possible. Its smallest model is the first bending
   mode with the first axial mode, and it bounds the average share of the
   bending: 0.83 in one case, 0.98 in a stiffer one, with the running
   averages of a hundred starts 5 per cent under the bound.

   The scene integrates that model: the bending stretches the axis by the
   square of its slope, and the axial force changes the stiffness of the
   bending. The sum of the energies is constant. The bars are the energy in
   each mode, the marks are the running averages, and the dashed line is the
   numerical envelope plus the gap the paper reports. The scene solves no
   semidefinite program. The axial motion is drawn larger than it is, and
   the two frequencies are closer than in the paper, so the eye can follow
   both. */

import { withAlpha } from '../ink.js';
import { stageFor, drawDatum } from './stage.js';

const TWO_PI = Math.PI * 2;
const FIRST_ROOT = 1.8751040687;
const FIRST_SIGMA = 0.734096;
const BEND_HZ = 0.28;             // the first bending mode, on the screen
const RATIO = 6;                  // the axial frequency over the bending frequency; 58 and 14 in the paper
/* The quadratic coupling. It is small enough that the axial force never
   cancels the stiffness of the bending. With the amplitudes below it moves
   1 to 18 per cent of the energy out of the bending mode, which is the
   range of the two cases of the paper. */
const COUPLING = 35;
const AMPLITUDES = [0.08, 0.2, 0.32, 0.4];   // the tip amplitude, as a fraction of the length
const HOLD = 14;                  // seconds for each amplitude
const AXIAL_SHOW = 6;             // the axial displacement is drawn this many times larger
const SAMPLES = 96;
const TICKS = 10;
const STROBES = 12;
const STROBE_STEP = 0.09;
const BOUND_GAP = 1.05;           // the paper finds its bounds 5 per cent over the envelope
const BOUND_RUNS = 16;
const BOUND_SECONDS = 60;
const STEP = 1 / 240;

function firstMode(xi) {
  const t = FIRST_ROOT * xi;
  return (Math.cosh(t) - Math.cos(t) - FIRST_SIGMA * (Math.sinh(t) - Math.sin(t))) / 2;
}

function firstSlope(xi) {
  const t = FIRST_ROOT * xi;
  return (FIRST_ROOT * (Math.sinh(t) + Math.sin(t) - FIRST_SIGMA * (Math.cosh(t) - Math.cos(t)))) / 2;
}

/** The first axial mode of a clamped-free rod. Its largest value is one, at
    the tip. */
function axialMode(xi) {
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

export function createBeamModes() {
  const w1 = TWO_PI * BEND_HZ;
  const w2 = w1 * RATIO;
  const slope = new Float64Array(SAMPLES + 1);
  const axial = new Float64Array(SAMPLES + 1);
  for (let i = 0; i <= SAMPLES; i++) {
    slope[i] = firstSlope(i / SAMPLES);
    axial[i] = axialMode(i / SAMPLES);
  }
  const X = new Float64Array(SAMPLES + 1);
  const Z = new Float64Array(SAMPLES + 1);
  const beam = { x: 0, y: 0, length: 200 };
  const bars = { x: 0, y: 0, w: 0, gap: 0 };
  const state = { x1: 0, v1: 0, x2: 0, v2: 0 };
  let stage = null;
  let amplitude = AMPLITUDES[0];
  let runStart = 0;
  let clock = 0;
  let meanSum = 0;
  let meanTime = 0;
  let bound = 1;
  let strobe = [];
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
    runStart = at;
    meanSum = 0;
    meanTime = 0;
    strobe = [];
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
        while (strobe.length > STROBES) strobe.shift();
      }
    }
  }

  /** The axis of the beam for a bending x1. The beam keeps its length. */
  function traceBeam(x1) {
    X[0] = 0;
    Z[0] = 0;
    const ds = 1 / SAMPLES;
    for (let i = 1; i <= SAMPLES; i++) {
      const a = 0.5 * (slope[i - 1] + slope[i]) * x1;
      X[i] = X[i - 1] + Math.cos(a) * ds;
      Z[i] = Z[i - 1] + Math.sin(a) * ds;
    }
  }

  function toScreen(i) {
    return { x: beam.x + X[i] * beam.length, y: beam.y - Z[i] * beam.length };
  }

  function pathBeam(ctx, x1) {
    traceBeam(x1);
    ctx.beginPath();
    for (let i = 0; i <= SAMPLES; i++) {
      const p = toScreen(i);
      if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    }
  }

  function drawStrobe(ctx, ink) {
    strobe.forEach((s, k) => {
      pathBeam(ctx, s.x1);
      ctx.lineWidth = 1;
      ctx.strokeStyle = withAlpha(ink.line, (0.42 * (k + 1)) / STROBES);
      ctx.stroke();
    });
  }

  function drawBeam(ctx, ink) {
    pathBeam(ctx, state.x1);
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = ink.body;
    ctx.stroke();

    /* The ticks move with the axial mode, each at its station plus the
       axial displacement, drawn larger than it is. */
    traceBeam(state.x1);
    ctx.beginPath();
    for (let k = 1; k <= TICKS; k++) {
      const xi = k / TICKS;
      const shifted = Math.min(Math.max(xi + state.x2 * axial[Math.round(xi * SAMPLES)] * AXIAL_SHOW, 0), 1);
      const i = shifted * SAMPLES;
      const i0 = Math.floor(i);
      const i1 = Math.min(i0 + 1, SAMPLES);
      const f = i - i0;
      const px = beam.x + (X[i0] + (X[i1] - X[i0]) * f) * beam.length;
      const py = beam.y - (Z[i0] + (Z[i1] - Z[i0]) * f) * beam.length;
      const a = slope[i0] * state.x1;
      const nx = -Math.sin(a) * 4;
      const ny = -Math.cos(a) * 4;
      ctx.moveTo(px - nx, py - ny);
      ctx.lineTo(px + nx, py + ny);
    }
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = ink.accent;
    ctx.stroke();

    // The clamp: a short vertical line with hatch lines.
    const reach = beam.length * 0.07;
    ctx.beginPath();
    ctx.moveTo(beam.x, beam.y - reach);
    ctx.lineTo(beam.x, beam.y + reach);
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = ink.accent;
    ctx.stroke();
    ctx.beginPath();
    for (let i = -3; i <= 3; i++) {
      const y = beam.y + (i / 3) * reach;
      ctx.moveTo(beam.x, y);
      ctx.lineTo(beam.x - 7, y + 5);
    }
    ctx.lineWidth = 1;
    ctx.strokeStyle = ink.faint;
    ctx.stroke();
  }

  /* The bars: the share of each mode now, the running average as a mark,
     and the bound on the bending as a dashed line. */
  function drawEnergy(ctx, ink) {
    if (bars.w <= 0) return;
    const e = energies(state, w1, w2);
    const mean = meanTime > 0 ? meanSum / meanTime : e.share;
    const rows = [
      { share: e.share, mean, style: ink.accent },
      { share: 1 - e.share, mean: 1 - mean, style: ink.body },
    ];
    rows.forEach((row, i) => {
      const y = bars.y + i * bars.gap;
      ctx.beginPath();
      ctx.moveTo(bars.x, y);
      ctx.lineTo(bars.x + bars.w, y);
      ctx.lineWidth = 1;
      ctx.strokeStyle = ink.faint;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(bars.x, y);
      ctx.lineTo(bars.x + bars.w * row.share, y);
      ctx.lineWidth = 3.2;
      ctx.strokeStyle = row.style;
      ctx.stroke();

      // The running average.
      const mx = bars.x + bars.w * row.mean;
      ctx.beginPath();
      ctx.moveTo(mx, y - 5);
      ctx.lineTo(mx, y + 5);
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = row.style;
      ctx.stroke();
    });

    // The bound on the average of the bending.
    const bx = bars.x + bars.w * bound;
    ctx.beginPath();
    ctx.setLineDash([3, 3]);
    ctx.moveTo(bx, bars.y - bars.gap * 0.6);
    ctx.lineTo(bx, bars.y + bars.gap * 0.6);
    ctx.lineWidth = 1;
    ctx.strokeStyle = ink.line;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function paint(ctx, ink) {
    drawDatum(ctx, stage, ink);
    drawStrobe(ctx, ink);
    drawBeam(ctx, ink);
    drawEnergy(ctx, ink);
  }

  return {
    fade: 1,

    /* The control on the lab page: the amplitude, which sets how nonlinear
       the beam is. */
    lab: {
      label: 'Amplitude',
      unit: '%',
      min: 5,
      max: 40,
      step: 1,
      value: () => amplitude * 100,
      set(v) { held = v / 100; },
      release() { held = null; },
      auto: {
        name: 'four amplitudes in turn',
        status() {
          const i = Math.floor(clock / HOLD) % AMPLITUDES.length;
          const next = AMPLITUDES[(i + 1) % AMPLITUDES.length];
          const left = Math.ceil(HOLD - (clock % HOLD));
          return 'Auto runs four amplitudes in turn, 14 seconds each, and restarts the run at each one. '
            + 'Now ' + Math.round(amplitude * 100) + ' per cent of the length; next ' + Math.round(next * 100) + ' per cent in ' + left + ' s.';
        },
      },
      hold(v) {
        return 'Amplitude held at ' + v + ' per cent. The run and its averages restart at each new value. '
          + 'Auto returns to the four amplitudes.';
      },
    },

    /** A few numbers of the state, for a test. */
    probe() {
      const e = energies(state, w1, w2);
      const total = 0.5 * w1 * w1 * amplitude * amplitude;
      const coupling = 0.5 * COUPLING * state.x1 * state.x1 * state.x2;
      return {
        amplitude,
        share: e.share,
        mean: meanTime > 0 ? meanSum / meanTime : 1,
        bound,
        energy: (e.e1 + e.e2 + coupling) / total,
      };
    },

    layout(w, h, fit = {}) {
      /* A preview shows the top of the box, so the beam sits lower and in
         the middle, and takes the width. */
      const preview = Boolean(fit.preview);
      stage = stageFor(w, h, fit.band ?? (preview ? 0.19 : undefined));
      beam.length = preview
        ? Math.min(stage.width * 0.86, (stage.y - 10) / 0.42)
        : Math.min(stage.width * 0.58, 660, (stage.y - 16) / 0.42);
      beam.x = preview ? stage.left + (stage.width - beam.length) / 2 : stage.left;
      beam.y = stage.y;

      const room = w > 700 && !preview;
      bars.w = room ? Math.min(stage.width * 0.15, 170) : 0;
      bars.x = stage.right - bars.w;
      bars.gap = Math.max(h * 0.028, 12);
      bars.y = stage.y - bars.gap * 0.5;
      clock = 0;
      launch(scheduled(0), 0);
    },

    frame(ctx, dt, t, ink) {
      advance(t);
      paint(ctx, ink);
    },

    still(ctx, ink, t) {
      const at = t || 46;   // 4 s into the largest amplitude
      const a = scheduled(at);
      const since = held !== null ? Math.min(at, 8) : at % HOLD;
      launch(a, at - since);
      clock = at - since;
      while (clock < at) advance(Math.min(clock + 0.25, at));
      paint(ctx, ink);
      return at;
    },
  };
}
