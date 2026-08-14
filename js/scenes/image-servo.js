/* Scene: image-based visual servoing - the coastline seen through the
   camera, driven back onto where it is supposed to sit.

   Behind "Coastline Tracking for UAVs Using Event-Triggered Image-Based
   Visual Servoing Nonlinear Model Predictive Control".

   Image-based servoing closes the loop in the image itself: the error is
   the gap between where the features are on the sensor and where they
   should be, and the controller works on that directly rather than on any
   reconstructed position.

   So this is the canonical figure for it. The frame is the camera's view
   over its pixel grid, the crosses are the desired feature positions, and
   the curves trailing behind each feature are its path across the sensor
   as the error is driven out - the trajectories that plot is normally
   drawn to show. Every few seconds the vehicle is knocked off and they
   are drawn again. */

const TWO_PI = 6.2832;
const SETTLE = 0.9;             // exponential rate the error decays at
const KICK_SECONDS = 5.5;       // how often the view is knocked off
const FEATURES = 7;
const TRAIL = 46;               // samples kept of each feature's path
const GRID_X = 8;
const GRID_Y = 4;

/* Every paper scene sits in this band down from the top of the hero: the
   panel below is vertically centred, so this strip stays clear of the
   words at every viewport height. */
const BAND = 0.14;

function fadeColour(rgba, alpha) {
  return rgba.replace(/rgba?\(([^)]+)\)/, (all, parts) => {
    const [r, g, b] = parts.split(',');
    return `rgba(${r},${g},${b},${alpha})`;
  });
}

export function createImageServo() {
  const frame = { x: 0, y: 0, w: 0, h: 0 };
  const pose = { dy: 0, tilt: 0 };
  let trails = [];
  let nextKick = 1.2;
  let kicks = 0;

  /** The contour in its own frame: a gentle meander across the image. */
  function shoreY(u) {
    return Math.sin(u * 3.1) * 0.17 + Math.sin(u * 6.7 + 0.9) * 0.07;
  }

  /** That contour placed in the image by the current pose. */
  function imagePoint(u) {
    const x = frame.x + u * frame.w;
    const lever = (u - 0.5) * frame.w;
    return {
      x,
      y: frame.y + frame.h / 2 + shoreY(u) * frame.h + pose.dy + lever * Math.tan(pose.tilt),
    };
  }

  function desiredPoint(u) {
    return {
      x: frame.x + u * frame.w,
      y: frame.y + frame.h / 2 + shoreY(u) * frame.h,
    };
  }

  function featureU(i) {
    return (i + 0.5) / FEATURES;
  }

  function step(dt, t) {
    if (t > nextKick) {
      // Deterministic rather than random, so the rhythm stays calm.
      kicks += 1;
      pose.dy = frame.h * 0.42 * Math.sin(kicks * 2.4);
      pose.tilt = 0.19 * Math.cos(kicks * 1.7);
      nextKick = t + KICK_SECONDS;
      trails = trails.map(() => []);
    } else {
      const decay = Math.exp(-SETTLE * dt);
      pose.dy *= decay;
      pose.tilt *= decay;
    }
    for (let i = 0; i < FEATURES; i++) {
      const p = imagePoint(featureU(i));
      trails[i].push(p.y);
      if (trails[i].length > TRAIL) trails[i].shift();
    }
  }

  function drawFrame(ctx, ink) {
    // The pixel grid the features are measured on.
    ctx.beginPath();
    for (let i = 1; i < GRID_X; i++) {
      const x = frame.x + (i / GRID_X) * frame.w;
      ctx.moveTo(x, frame.y);
      ctx.lineTo(x, frame.y + frame.h);
    }
    for (let i = 1; i < GRID_Y; i++) {
      const y = frame.y + (i / GRID_Y) * frame.h;
      ctx.moveTo(frame.x, y);
      ctx.lineTo(frame.x + frame.w, y);
    }
    ctx.lineWidth = 1;
    ctx.strokeStyle = fadeColour(ink.line, 0.1);
    ctx.stroke();

    ctx.beginPath();
    ctx.rect(frame.x, frame.y, frame.w, frame.h);
    ctx.lineWidth = 1;
    ctx.strokeStyle = ink.faint;
    ctx.stroke();

    // Corner marks, so it reads as a viewfinder rather than a box.
    const c = Math.min(frame.w, frame.h) * 0.09;
    ctx.beginPath();
    for (const [cx, sx] of [[frame.x, 1], [frame.x + frame.w, -1]]) {
      for (const [cy, sy] of [[frame.y, 1], [frame.y + frame.h, -1]]) {
        ctx.moveTo(cx, cy + sy * c);
        ctx.lineTo(cx, cy);
        ctx.lineTo(cx + sx * c, cy);
      }
    }
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = ink.line;
    ctx.stroke();
  }

  function traceContour(ctx, mapper) {
    ctx.beginPath();
    for (let i = 0; i <= 72; i++) {
      const p = mapper(i / 72);
      if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    }
  }

  function drawContours(ctx, ink) {
    traceContour(ctx, desiredPoint);
    ctx.setLineDash([3, 4]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = ink.faint;
    ctx.stroke();
    ctx.setLineDash([]);

    traceContour(ctx, imagePoint);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = ink.body;
    ctx.stroke();
  }

  /** Each feature's path across the sensor: the servoing trajectories. */
  function drawTrails(ctx, ink) {
    for (let i = 0; i < FEATURES; i++) {
      const path = trails[i];
      if (path.length < 2) continue;
      const x = frame.x + featureU(i) * frame.w;
      ctx.beginPath();
      for (let k = 0; k < path.length; k++) {
        // Spread the trail sideways a little so overlapping paths stay
        // legible instead of collapsing onto one vertical line.
        const px = x + (k - path.length) * 0.55;
        if (k === 0) ctx.moveTo(px, path[k]); else ctx.lineTo(px, path[k]);
      }
      ctx.lineWidth = 1;
      ctx.strokeStyle = fadeColour(ink.accent, 0.4);
      ctx.stroke();
    }
  }

  function drawFeatures(ctx, ink) {
    const arm = 3.4;
    for (let i = 0; i < FEATURES; i++) {
      const u = featureU(i);
      const want = desiredPoint(u);
      const have = imagePoint(u);

      ctx.beginPath();
      ctx.moveTo(want.x - arm, want.y);
      ctx.lineTo(want.x + arm, want.y);
      ctx.moveTo(want.x, want.y - arm);
      ctx.lineTo(want.x, want.y + arm);
      ctx.lineWidth = 1;
      ctx.strokeStyle = ink.line;
      ctx.stroke();

      if (Math.abs(have.y - want.y) > 1.5) {
        ctx.beginPath();
        ctx.moveTo(have.x, have.y);
        ctx.lineTo(want.x, want.y);
        ctx.lineWidth = 1.1;
        ctx.strokeStyle = fadeColour(ink.accent, 0.55);
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.arc(have.x, have.y, 2.4, 0, TWO_PI);
      ctx.fillStyle = ink.accent;
      ctx.fill();
    }
  }

  return {
    fade: 1,   // a drawn scene rather than a trailing one: no ghosting

    layout(w, h) {
      frame.w = Math.min(w * 0.4, 600);
      frame.h = Math.min(h * 0.15, frame.w * 0.4);
      frame.x = w * 0.1;
      // Sat a little above the band's centre: the viewfinder is the
      // tallest thing any of these scenes draws.
      frame.y = h * (BAND - 0.035) - frame.h / 2;
      pose.dy = 0;
      pose.tilt = 0;
      nextKick = 1.2;
      kicks = 0;
      trails = Array.from({ length: FEATURES }, () => []);
    },

    frame(ctx, dt, t, ink) {
      step(dt, t);
      drawFrame(ctx, ink);
      drawContours(ctx, ink);
      drawTrails(ctx, ink);
      drawFeatures(ctx, ink);
    },

    still(ctx, ink) {
      pose.dy = frame.h * 0.2;
      pose.tilt = 0.08;
      // A settling run, so the trajectories are there to see.
      trails = Array.from({ length: FEATURES }, () => []);
      const held = { dy: pose.dy, tilt: pose.tilt };
      for (let k = TRAIL; k >= 0; k--) {
        const decay = Math.exp(-SETTLE * 0.05 * k);
        pose.dy = held.dy * (1 / decay);
        pose.tilt = held.tilt * (1 / decay);
        for (let i = 0; i < FEATURES; i++) trails[i].push(imagePoint(featureU(i)).y);
      }
      pose.dy = held.dy;
      pose.tilt = held.tilt;
      drawFrame(ctx, ink);
      drawContours(ctx, ink);
      drawTrails(ctx, ink);
      drawFeatures(ctx, ink);
    },
  };
}
