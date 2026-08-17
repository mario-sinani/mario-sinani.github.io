/* Potential flow: the singularities that the flow scenes add to a
   uniform stream, and the test of the geometry that keeps the samples
   outside a body.

   All the functions use the axes of the screen: x to the right and y
   down. A nose-up section has a negative rotation and a positive
   circulation. */

export const TWO_PI = 6.2832;

/** A point vortex with a finite core. The induced velocity then stays
    finite. */
export function addVortex(out, x, y, vx, vy, gamma, core2) {
  const dx = x - vx;
  const dy = y - vy;
  const k = gamma / (TWO_PI * (dx * dx + dy * dy + core2));
  out.u -= k * dy;
  out.v += k * dx;
}

/** A doublet of the given radius in a stream at the speed u0. It gives
    the thickness of a body. */
export function addDoublet(out, x, y, cx, cy, radius, u0) {
  const dx = x - cx;
  const dy = y - cy;
  const r2 = dx * dx + dy * dy;
  const R2 = radius * radius;
  if (r2 <= R2) return;
  const r4 = r2 * r2;
  out.u += -u0 * R2 * (dx * dx - dy * dy) / r4;
  out.v += -u0 * R2 * (2 * dx * dy) / r4;
}

/** The square of the distance from a point to a segment. The centre of
    the segment is at (cx, cy). The segment has the given half-length,
    and it goes along the unit direction (dirX, dirY). */
export function segmentDistance2(x, y, cx, cy, dirX, dirY, half) {
  const dx = x - cx;
  const dy = y - cy;
  let along = dx * dirX + dy * dirY;
  if (along > half) along = half;
  if (along < -half) along = -half;
  const px = dx - along * dirX;
  const py = dy - along * dirY;
  return px * px + py * py;
}

/** The unit vector along a chord at the given nose-up incidence. */
export function chordDirection(alpha) {
  return { x: Math.cos(alpha), y: -Math.sin(alpha) };
}
