/* Potential-flow building blocks shared by the scenes that draw a flow:
   singularities superposed on a uniform stream, plus the geometry test
   that keeps particles out of a body.

   Everything works in screen axes - x right, y down - so a nose-up section
   is a negative rotation and carries positive circulation. */

export const TWO_PI = 6.2832;

/** Point vortex with a finite core, so induced velocity never blows up. */
export function addVortex(out, x, y, vx, vy, gamma, core2) {
  const dx = x - vx;
  const dy = y - vy;
  const k = gamma / (TWO_PI * (dx * dx + dy * dy + core2));
  out.u -= k * dy;
  out.v += k * dx;
}

/** Doublet of the given radius in a stream of speed u0: a body's thickness. */
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

/** Squared distance from a point to a segment centred at (cx, cy), of the
    given half-length, running along the unit direction (dirX, dirY). */
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

/** Unit vector along a chord at the given nose-up incidence. */
export function chordDirection(alpha) {
  return { x: Math.cos(alpha), y: -Math.sin(alpha) };
}
