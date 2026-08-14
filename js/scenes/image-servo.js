/* Scene: image-based visual servoing - the coastline seen through the
   camera, driven back onto where it is supposed to sit.

   Behind "Coastline Tracking for UAVs Using Event-Triggered Image-Based
   Visual Servoing Nonlinear Model Predictive Control".

   Image-based servoing closes the loop in the image itself: the error is
   the gap between where the features are on the sensor and where they
   should be, and the controller works on that directly rather than on any
   reconstructed position. So the frame here is the camera's view, the
   crosses are the desired feature positions, and the short accent lines
   are the error being driven to nothing. Every so often the vehicle is
   knocked off and has to converge again. */

const TWO_PI = 6.2832;
const SETTLE = 0.9;             // exponential rate the error decays at
const KICK_SECONDS = 5.5;       // how often the view is knocked off
const FEATURES = 5;

/* Every paper scene sits in this band down from the top of the hero: the
   panel below is vertically centred, so this strip stays clear of the
   words at every viewport height. */
const BAND = 0.14;

export function createImageServo() {
  const frame = { x: 0, y: 0, w: 0, h: 0 };
  const pose = { dy: 0, tilt: 0 };
  let nextKick = 1.5;
  let kicks = 0;

  /** The contour in its own frame: a gentle meander across the image. */
  function shoreY(u) {
    return Math.sin(u * 3.1) * 0.17 + Math.sin(u * 6.7 + 0.9) * 0.07;
  }

  /** That contour placed in the image by the current pose. */
  function imagePoint(u) {
    const x = frame.x + u * frame.w;
    const local = shoreY(u) * frame.h;
    const lever = (u - 0.5) * frame.w;
    return { x, y: frame.y + frame.h / 2 + local + pose.dy + lever * Math.tan(pose.tilt) };
  }

  function desiredPoint(u) {
    const x = frame.x + u * frame.w;
    return { x, y: frame.y + frame.h / 2 + shoreY(u) * frame.h };
  }

  function step(dt, t) {
    if (t > nextKick) {
      // Deterministic rather than random, so the rhythm stays calm.
      kicks += 1;
      pose.dy = frame.h * 0.3 * Math.sin(kicks * 2.4);
      pose.tilt = 0.16 * Math.cos(kicks * 1.7);
      nextKick = t + KICK_SECONDS;
      return;
    }
    const decay = Math.exp(-SETTLE * dt);
    pose.dy *= decay;
    pose.tilt *= decay;
  }

  function drawFrame(ctx, ink) {
    ctx.beginPath();
    ctx.rect(frame.x, frame.y, frame.w, frame.h);
    ctx.lineWidth = 1;
    ctx.strokeStyle = ink.faint;
    ctx.stroke();

    // Corner marks, so it reads as a viewfinder rather than a box.
    const c = Math.min(frame.w, frame.h) * 0.08;
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

  function drawContour(ctx, ink) {
    ctx.beginPath();
    for (let i = 0; i <= 60; i++) {
      const p = imagePoint(i / 60);
      if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    }
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = ink.body;
    ctx.stroke();
  }

  function drawFeatures(ctx, ink) {
    const arm = 3.4;
    for (let i = 0; i < FEATURES; i++) {
      const u = (i + 0.5) / FEATURES;
      const want = desiredPoint(u);
      const have = imagePoint(u);

      ctx.beginPath();
      ctx.moveTo(want.x - arm, want.y);
      ctx.lineTo(want.x + arm, want.y);
      ctx.moveTo(want.x, want.y - arm);
      ctx.lineTo(want.x, want.y + arm);
      ctx.lineWidth = 1;
      ctx.strokeStyle = ink.faint;
      ctx.stroke();

      if (Math.abs(have.y - want.y) > 1.5) {
        ctx.beginPath();
        ctx.moveTo(have.x, have.y);
        ctx.lineTo(want.x, want.y);
        ctx.lineWidth = 1.1;
        ctx.strokeStyle = ink.accent;
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
      frame.w = Math.min(w * 0.34, 520);
      frame.h = Math.min(h * 0.17, frame.w * 0.42);
      frame.x = w * 0.12;
      frame.y = h * BAND - frame.h / 2;
      pose.dy = 0;
      pose.tilt = 0;
      nextKick = 1.5;
      kicks = 0;
    },

    frame(ctx, dt, t, ink) {
      step(dt, t);
      drawFrame(ctx, ink);
      drawContour(ctx, ink);
      drawFeatures(ctx, ink);
    },

    still(ctx, ink) {
      pose.dy = frame.h * 0.16;
      pose.tilt = 0.07;
      drawFrame(ctx, ink);
      drawContour(ctx, ink);
      drawFeatures(ctx, ink);
    },
  };
}
