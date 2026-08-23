/* The small charts beside a scene: the force at the tip, the velocity of
   a tip, the growth rate, the fold angle, the image error.

   Each one is a box with two axes, a line through the samples and a dot
   at the head of that line. The scene keeps its own scales and its own
   extra marks; this module draws the parts they all share, in the same
   order, so the charts of the site look alike. */

const TWO_PI = Math.PI * 2;

/** A map from a time to an x in the box: now at the right edge. */
export function timeToX(box, span, now) {
  return (when) => box.x + box.w * (1 - (now - when) / span);
}

/** The two axes: a level line across the box, and the left edge. */
export function drawAxes(ctx, ink, box, zeroY) {
  ctx.beginPath();
  ctx.moveTo(box.x, zeroY);
  ctx.lineTo(box.x + box.w, zeroY);
  ctx.moveTo(box.x, box.y);
  ctx.lineTo(box.x, box.y + box.h);
  ctx.lineWidth = 1;
  ctx.strokeStyle = ink.faint;
  ctx.stroke();
}

/** The line through the samples. A series or an array holds them, x and y
    put one sample on the screen, and live adds the point of this moment
    at the head. */
export function drawLine(ctx, samples, { x, y, width, style, live }) {
  ctx.beginPath();
  let first = true;
  const put = (sample, i) => {
    const px = x(sample, i);
    const py = y(sample, i);
    if (first) { ctx.moveTo(px, py); first = false; } else { ctx.lineTo(px, py); }
  };
  if (typeof samples.each === 'function') samples.each(put);
  else samples.forEach(put);
  if (live) ctx.lineTo(live.x, live.y);
  ctx.lineWidth = width;
  ctx.strokeStyle = style;
  ctx.stroke();
}

/** The dot at the head of the line: where the model is now. */
export function drawHead(ctx, style, px, py, radius = 2.6) {
  ctx.beginPath();
  ctx.arc(px, py, radius, 0, TWO_PI);
  ctx.fillStyle = style;
  ctx.fill();
}
