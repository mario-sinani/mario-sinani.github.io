/* Aerofoil geometry: the NACA 4-digit symmetric section. An ellipse is
   the same at the front and at the back, but a wing has a round nose and
   a pointed tail, and that difference makes the outline look like a
   wing.

   The thickness law is one polynomial:

     yt(x) = (t / 0.2) * (0.2969*sqrt(x) - 0.1260*x - 0.3516*x^2
                          + 0.2843*x^3 - 0.1036*x^4)

   Here x is the fraction of the chord, 0 at the leading edge and 1 at
   the trailing edge, yt is half of the thickness, and t is the thickness
   ratio. The last coefficient is -0.1036 and not -0.1015, because
   -0.1036 closes the trailing edge to a point. The Pazy wing uses NACA
   0018, where t = 0.18. */

import { chordDirection } from './potential-flow.js';

/** Thickness ratio of the Pazy wing section, NACA 0018. */
export const PAZY_RATIO = 0.18;

/* The number of points on each surface. Cosine spacing puts most of
   the points at the nose, where the curvature is largest. */
const SAMPLES = 44;

/**
 * A section is a record. It has the position of the middle of the
 * chord, and half of the chord in px. It also has the nose-up incidence
 * in radians and the thickness ratio.
 */

/** Half of the thickness at a point on the chord, as a fraction of
    the chord. */
export function halfThicknessAt(fraction, ratio) {
  const c = Math.min(Math.max(fraction, 0), 1);
  const root = Math.sqrt(c);
  return (ratio / 0.2) * (0.2969 * root - 0.1260 * c - 0.3516 * c * c
    + 0.2843 * c * c * c - 0.1036 * c * c * c * c);
}

/** A point on one surface. The side value is +1 for the upper surface
    and -1 for the lower surface. */
function surfacePoint(section, dir, fraction, side) {
  const chord = section.half * 2;
  const along = (fraction - 0.5) * chord;
  const offset = halfThicknessAt(fraction, section.ratio) * chord * side;
  return {
    // The normal points up on the screen, where y increases downward.
    x: section.x + along * dir.x + offset * dir.y,
    y: section.y + along * dir.y - offset * dir.x,
  };
}

/** The fraction of the chord for the sample at the given index. */
function fractionAt(index) {
  return 0.5 * (1 - Math.cos((Math.PI * index) / SAMPLES));
}

/**
 * Make the outline of the section as a closed path. The path goes along
 * the upper surface from the nose to the tail. It then comes back along
 * the lower surface. The caller sets the stroke and draws the path.
 */
export function traceAerofoil(ctx, section) {
  const dir = chordDirection(section.alpha);
  ctx.beginPath();
  for (let i = 0; i <= SAMPLES; i++) {
    const p = surfacePoint(section, dir, fractionAt(i), 1);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  for (let i = SAMPLES - 1; i >= 0; i--) {
    const p = surfacePoint(section, dir, fractionAt(i), -1);
    ctx.lineTo(p.x, p.y);
  }
  ctx.closePath();
}

/** True if the point is in the section. Use it to keep the samples
    outside the body. */
export function isInsideAerofoil(section, x, y) {
  const dir = chordDirection(section.alpha);
  const dx = x - section.x;
  const dy = y - section.y;
  const along = dx * dir.x + dy * dir.y;
  if (along < -section.half || along > section.half) return false;
  const chord = section.half * 2;
  const normal = Math.abs(dx * dir.y - dy * dir.x);
  return normal <= halfThicknessAt((along + section.half) / chord, section.ratio) * chord;
}
