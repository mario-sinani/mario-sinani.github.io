/* Model: the coast as the camera sees it, and a new solution only at an
   event.

   The scene of the same name draws it. The detection gives the bounding
   box of the coastline, and its four corners are the features. Their
   desired positions are the corners of a narrow box across the middle, and
   they slide along the frame, so the craft moves along the coast. Between
   two solutions the camera keeps the last velocity in an open loop, and it
   solves again when the measured features depart from the predicted ones
   by more than a bound, or when the horizon of six steps ends.

   The geometry lives in the scene, which gives it here: the frame of the
   camera and the shape of the coast, in the pixels of the image. */

export const DESIRED_BAND = 40 / 480;  // the desired box: 40 pixels of the 480 across the coast
export const HORIZON = 0.6;     // seconds a solution stays valid for: 6 steps of 0.1 s in the thesis
export const ALONG = 40;        // px/s the desired features slide along the frame
const GAIN_U = 1.6;             // 1/s on the lateral error
const GAIN_ROLL = 1.4;          // 1/s on the tilt
/* The triggering condition: the departure of the measured features from
   the predicted ones stays under a floor in pixels plus a fraction of the
   image error. */
const SIGMA = 0.25;
const FLOOR = 2.5;
export const NOISE = 1.5;              // pixels of noise in the visual tracking, unless the lab holds it
const KICK_SECONDS = 9;         // how often a gust moves the craft
const KICK_RAMP = 0.7;          // seconds the gust takes to land
const SAMPLE_STEP = 0.04;
export const PLOT_SECONDS = 8;
export const SAMPLES = 64;      // points of the coast along the frame

export function createImageServoModel(frame, coast) {
  /* The pose of the camera: the lateral offset from the coast, the roll,
     and the position along the coast, in pixels. */
  const pose = { u: 0, roll: 0, s: 0 };
  const held = { u: 0, roll: 0 };
  const atSolve = { u: 0, roll: 0, s: 0, corners: [] };
  const kickFrom = { u: 0, roll: 0 };
  const kickTo = { u: 0, roll: 0 };
  let errorLog = [];
  let triggers = [];
  let events = 0;
  let lastSolve = -99;
  let lastSample = -99;
  let nextKick = 2;
  let kicks = 0;
  let kickAt = -99;
  let lastTime = 0;
  /* The lab can hold the noise. null uses the constant. */
  let heldNoise = null;

  function noiseLevel() {
    return heldNoise !== null ? heldNoise : NOISE;
  }

  /** The lateral position of the coast at a point along it. */
  function coastAt(s) {
    return coast.a1 * Math.sin(coast.k1 * s) + coast.a2 * Math.sin(coast.k2 * s + 1.3);
  }

  function centre() {
    return { x: frame.x + frame.w / 2, y: frame.y + frame.h / 2 };
  }

  /** A point of the coast in the image, through the pose. The coast runs
      across the frame, the lateral offset is down it, and the roll turns
      the image about its centre. */
  function project(s, at) {
    const c = centre();
    const along = s - at.s;
    const lateral = coastAt(s) - at.u;
    const cr = Math.cos(at.roll);
    const sr = Math.sin(at.roll);
    return { x: c.x + along * cr - lateral * sr, y: c.y + along * sr + lateral * cr };
  }

  /** The coast in the frame: its points, and the box of the detection, with
      the lateral position and the tilt. */
  function detect(at) {
    const pts = [];
    let vMin = Infinity;
    let vMax = -Infinity;
    let vLeft = 0;
    let vRight = 0;
    const left = frame.x;
    const right = frame.x + frame.w;
    for (let i = 0; i <= SAMPLES; i++) {
      const s = at.s + (i / SAMPLES - 0.5) * frame.w * 1.6;
      const p = project(s, at);
      pts.push(p);
      if (p.x >= left && p.x <= right) {
        vMin = Math.min(vMin, p.y);
        vMax = Math.max(vMax, p.y);
      }
    }
    // The lateral position at each edge of the frame.
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      if ((a.x - left) * (b.x - left) <= 0 && a.x !== b.x) vLeft = a.y + ((left - a.x) * (b.y - a.y)) / (b.x - a.x);
      if ((a.x - right) * (b.x - right) <= 0 && a.x !== b.x) vRight = a.y + ((right - a.x) * (b.y - a.y)) / (b.x - a.x);
    }
    if (!Number.isFinite(vMin)) { vMin = centre().y; vMax = centre().y; }
    vMin = Math.max(vMin, frame.y);
    vMax = Math.min(vMax, frame.y + frame.h);
    return {
      pts,
      corners: [{ x: left, y: vMin }, { x: right, y: vMin }, { x: left, y: vMax }, { x: right, y: vMax }],
      boxV: (vMin + vMax) / 2,
      tilt: Math.atan2(vRight - vLeft, frame.w),
    };
  }

  /** The desired features: the corners of the band across the middle. */
  function desired() {
    const c = centre();
    const half = (frame.h * DESIRED_BAND) / 2;
    return [
      { x: frame.x, y: c.y - half }, { x: frame.x + frame.w, y: c.y - half },
      { x: frame.x, y: c.y + half }, { x: frame.x + frame.w, y: c.y + half },
    ];
  }

  /** The noise of the tracking on one corner: small, smooth and
      deterministic. */
  function jitter(i, t) {
    const n = noiseLevel();
    return { x: n * Math.sin(9.7 * t + i * 1.7), y: n * Math.sin(12.3 * t + i * 2.3) };
  }

  function measured(t) {
    return detect(pose).corners.map((p, i) => {
      const j = jitter(i, t);
      return { x: p.x + j.x, y: p.y + j.y };
    });
  }

  /** The mean distance between the features and their desired positions. */
  function errorNorm(t) {
    const want = desired();
    const have = measured(t);
    let sum = 0;
    for (let i = 0; i < 4; i++) sum += Math.hypot(have[i].x - want[i].x, have[i].y - want[i].y);
    return sum / 4;
  }

  /** The features as the last solution predicts them: the features it
      measured, moved by its own command since then. The lateral velocity
      moves all four down or up, and the roll moves the left corners against
      the right. The model knows nothing of the coast ahead, so a bend takes
      the real features off this prediction. */
  function predicted(t) {
    const dt = t - lastSolve;
    const cx = centre().x;
    return atSolve.corners.map((p) => ({
      x: p.x,
      y: p.y - held.u * dt + (p.x > cx ? 1 : -1) * held.roll * dt * (frame.w / 2),
    }));
  }

  function departure(t) {
    if (!atSolve.corners.length) return Infinity;
    const have = measured(t);
    const guess = predicted(t);
    let sum = 0;
    for (let i = 0; i < 4; i++) sum += Math.hypot(have[i].x - guess[i].x, have[i].y - guess[i].y);
    return sum / 4;
  }

  function solve(t) {
    const d = detect(pose);
    const c = centre();
    held.u = GAIN_U * (d.boxV - c.y);
    // A positive roll turns the right of the image down, and adds to a
    // positive tilt. The command turns the other way.
    held.roll = -GAIN_ROLL * d.tilt;
    atSolve.u = pose.u;
    atSolve.roll = pose.roll;
    atSolve.s = pose.s;
    atSolve.corners = measured(t);
    lastSolve = t;
    events += 1;
    triggers.push(t);
    while (triggers.length && t - triggers[0] > PLOT_SECONDS) triggers.shift();
  }

  function step(dt, t) {
    if (t > nextKick) {
      /* The gust moves the pose on a smooth ramp, and not suddenly. The
         values are deterministic, and the rhythm is constant. */
      kicks += 1;
      kickFrom.u = 0;
      kickFrom.roll = 0;
      kickTo.u = frame.h * 0.12 * Math.sin(kicks * 2.4);
      kickTo.roll = 0.16 * Math.sin(kicks * 1.7);
      kickAt = t;
      nextKick = t + KICK_SECONDS;
    }

    /* The event: the measured features against the predicted ones, with a
       bound that scales with the image error. The horizon is the other
       event. */
    if (t - lastSolve > HORIZON || departure(t) > FLOOR + SIGMA * errorNorm(t)) solve(t);

    // Between two solutions the loop is open and the command holds. The
    // craft moves along the coast at the set rate, and the gust moves it as
    // well.
    pose.u += held.u * dt;
    pose.roll += held.roll * dt;
    pose.s += ALONG * dt;
    if (t - kickAt < KICK_RAMP) {
      const s0 = Math.max(Math.min((t - dt - kickAt) / KICK_RAMP, 1), 0);
      const s1 = Math.min((t - kickAt) / KICK_RAMP, 1);
      const e0 = s0 * s0 * (3 - 2 * s0);
      const e1 = s1 * s1 * (3 - 2 * s1);
      pose.u += (kickTo.u - kickFrom.u) * (e1 - e0);
      pose.roll += (kickTo.roll - kickFrom.roll) * (e1 - e0);
    }

    lastTime = t;
    if (t - lastSample < SAMPLE_STEP) return;
    lastSample = t;
    errorLog.push({ t, e: errorNorm(t) });
    while (errorLog.length && t - errorLog[0].t > PLOT_SECONDS) errorLog.shift();
  }

  /** Move the past with the clock, if the clock goes back. */
  function shiftPast(by) {
    errorLog.forEach((p) => { p.t -= by; });
    triggers = triggers.map((x) => x - by);
    lastSolve -= by;
    lastSample -= by;
    kickAt -= by;
    nextKick -= by;
    lastTime -= by;
  }

  return {
    pose,
    get errorLog() { return errorLog; },
    get triggers() { return triggers; },
    get events() { return events; },
    get lastTime() { return lastTime; },
    get lastSolve() { return lastSolve; },
    noiseLevel,
    coastAt,
    centre,
    project,
    detect,
    desired,
    measured,
    errorNorm,
    predicted,
    step,
    shiftPast,
    /** A few numbers of the state, for a test. */
    probe() {
      return { events, noise: noiseLevel(), error: errorNorm(lastTime), along: pose.s };
    },
    reset() {
      pose.u = 0;
      pose.roll = 0;
      pose.s = 0;
      held.u = 0;
      held.roll = 0;
      lastSolve = -99;
      lastSample = -99;
      kicks = 0;
      kickAt = -99;
      nextKick = 2;
      errorLog = [];
      triggers = [];
      lastTime = 0;
    },
    /* Start the past of a fixed frame: a pose off the desired one, and the
       gust of the sequence. */
    startPast(at, seconds) {
      this.reset();
      pose.u = frame.h * 0.1;
      pose.roll = 0.12;
      nextKick = at - seconds + 1.5;
      lastSample = at - seconds - 1;
    },
    hold(v) { heldNoise = v; },
    release() { heldNoise = null; },
  };
}
