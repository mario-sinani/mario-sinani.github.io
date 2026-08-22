/* The bending modes of a clamped-free beam.

   Four scenes need the same shapes: the Pazy wing under a step and at
   its flutter band, the beam that moves energy between its modes, and
   the wing on a flared hinge. The roots come from cos(b) cosh(b) = -1,
   and sigma from the ratio the clamped-free end conditions give.

   shape(m, xi) is the raw mode m at the station xi, from 0 at the root
   to 1 at the tip. slope(m, xi) is its derivative. The raw shape has
   the value 2 at the tip, so a scene that wants a tip of one divides
   by TIP_RAW[m]. */

export const ROOTS = [1.8751040687, 4.6940911330];
export const SIGMA = [0.734096, 1.018467];
export const TIP_RAW = ROOTS.map((_, m) => shape(m, 1));

export function shape(m, xi) {
  const t = ROOTS[m] * xi;
  return Math.cosh(t) - Math.cos(t) - SIGMA[m] * (Math.sinh(t) - Math.sin(t));
}

export function slope(m, xi) {
  const b = ROOTS[m];
  const t = b * xi;
  return b * (Math.sinh(t) + Math.sin(t) - SIGMA[m] * (Math.cosh(t) - Math.cos(t)));
}

/* The first mode, with the value one at the tip. The raw shape has the
   value 2 there to seven figures, so the divisor is 2. */
export function firstMode(xi) {
  return shape(0, xi) / 2;
}

/** The slope of the first mode, in the same scale. */
export function firstSlope(xi) {
  return slope(0, xi) / 2;
}
