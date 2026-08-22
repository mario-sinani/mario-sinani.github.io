/* Model: a multirotor that tracks a contour and plans again only at an
   event.

   The scene of the same name draws it. Between two events the craft
   follows the last plan in an open loop. The plan takes the contour ahead
   as straight and predicts the state. The craft plans again when the
   measured state departs from the predicted one by more than a floor plus
   a fraction of the tracking error, or when the horizon ends. The events
   therefore come close together where the coastline turns.

   The geometry lives in the scene, which gives it here: the shore, the
   craft and the size of the view, in the pixels of the drawing. */

import { createSeries } from './series.js';

export const DRIFT = 46;        // px/s the world moves below the vehicle
export const HORIZON = 1.2;     // seconds a plan is valid for: 12 steps of 0.1 s in the paper
/* The triggering condition: the departure of the measured state from the
   predicted one stays under a floor plus a fraction of the tracking error.
   The floor is a fraction of the canvas height, and the standoff is 0.05 of
   it. */
const SIGMA = 0.5;
const FLOOR = 0.0025;
/* The noise of the visual tracking, as a fraction of the canvas height. It
   is one of the disturbances the paper names. */
const NOISE = 0.0012;

export const TRACK_SECONDS = 9; // how much flown path is kept, and how much time the plot shows

/* The scene gives the geometry it draws in: the height of the view, the
   shape of the shore, and the station of the craft along it with its
   standoff. The model reads that geometry and never writes to it. */
export function createEventTrackingModel(view, shore, station) {
  const plan = { at: -99, v0: 0, base: 0, slope: 0, e0: 0 };
  /* Where the craft is, across the coast. The scene reads it to draw. */
  let y = 0;
  let craftVel = 0;
  const track = createSeries({ seconds: TRACK_SECONDS });
  const stamps = createSeries({ seconds: TRACK_SECONDS });
  let events = 0;
  let lastTime = 0;
  /* The lab can hold the horizon. null uses the constant. The horizon is
     the time a plan stays valid, so it sets the longest space between two
     events. */
  let held = null;

  function horizon() {
    return held !== null ? held : HORIZON;
  }

  /** The contour, in world coordinates that move to the left with time. */
  function shoreAt(x, t) {
    const s = x + DRIFT * t;
    return shore.y + shore.a1 * Math.sin(shore.k1 * s) + shore.a2 * Math.sin(shore.k2 * s + 1.3);
  }

  /** The correct position of the vehicle: a fixed standoff from the
      contour. */
  function target(t) {
    return shoreAt(station.x, t) - station.standoff;
  }

  /** The noise of the measurement: small, smooth and deterministic. */
  function noise(t) {
    return NOISE * view.h * (Math.sin(7.3 * t) + 0.6 * Math.sin(11.9 * t + 1));
  }

  /** The model of the controller takes the contour ahead as straight: the
      target moves on at the slope it has at the time of the plan. */
  function predictedTarget(t) {
    return plan.base + plan.slope * (t - plan.at);
  }

  /** The position the plan predicts: the offset from the target goes to
      zero along a Hermite arc over the horizon. */
  function predicted(t) {
    const s = Math.min((t - plan.at) / horizon(), 1);
    const s2 = s * s;
    const s3 = s2 * s;
    const offset = (2 * s3 - 3 * s2 + 1) * plan.e0
      + (s3 - 2 * s2 + s) * horizon() * (plan.v0 - plan.slope);
    return predictedTarget(t) + offset;
  }

  function replan(t) {
    plan.at = t;
    plan.base = target(t);
    plan.slope = (target(t) - target(t - 0.1)) / 0.1;
    plan.e0 = y - plan.base;
    // Start the new plan at the velocity of the craft: an event bends the
    // path, and does not stop it.
    plan.v0 = craftVel;
  }

  function follow(dt, t) {
    const before = y;
    const age = t - plan.at;
    /* The event: the measured state against the predicted one. The state is
       the offset from the target. The plan takes the contour as straight;
       the measurement has the real contour and the noise. The bound is a
       floor plus a fraction of the offset the plan still expects. */
    const expected = predicted(t);
    const expectedOffset = expected - predictedTarget(t);
    const measuredOffset = y + noise(t) - target(t);
    const departure = Math.abs(measuredOffset - expectedOffset);
    const bound = FLOOR * view.h + SIGMA * Math.abs(expectedOffset);
    if (age > horizon() || departure > bound) {
      replan(t);
      events += 1;
      stamps.push(t);
    } else {
      /* Between two events the craft is in an open loop, on the plan in
         memory. */
      y = expected;
    }
    if (dt > 0) craftVel = (y - before) / dt;
    track.push({ t, y, e: y - target(t) });
    lastTime = t;
  }

  /** Move the past with the clock, if the clock goes back. */
  function shiftPast(by) {
    track.shiftTime(by);
    stamps.shiftTime(by);
    plan.at -= by;
    lastTime -= by;
  }

  return {
    plan,
    /** Where the craft is now, across the coast. */
    get y() { return y; },
    /** Put the craft on a line, when the geometry of the scene changes. */
    placeAt(at) { y = at; },
    get track() { return track; },
    get stamps() { return stamps; },
    get events() { return events; },
    get lastTime() { return lastTime; },
    horizon,
    shoreAt,
    target,
    predicted,
    predictedTarget,
    follow,
    shiftPast,
    /** A few numbers of the state, for a test. */
    probe() {
      return {
        events,
        horizon: horizon(),
        offset: y - target(lastTime),
        trackEnd: track.count ? track.last.t : null,
      };
    },
    reset() {
      plan.at = -99;
      track.clear();
      stamps.clear();
      lastTime = 0;
    },
    /* Start the past of a fixed frame at the given time, on the target. */
    startPast(at) {
      track.clear();
      stamps.clear();
      plan.at = -99;
      craftVel = 0;
      y = target(at);
    },
    hold(v) { held = v; },
    release() { held = null; },
  };
}
