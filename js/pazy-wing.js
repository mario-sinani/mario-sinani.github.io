/* The Pazy wing, drawn as the papers draw it: a long strip with ribs,
   seen from the front and a little from above. The span is 5.5 chords,
   and the elastic axis is at 44.75 per cent of the chord.

   A scene gives the slope angle and the twist of each station along
   the span. The renderer integrates the slope, so the strip keeps its
   length when it bends and the tip curls inward, as the strip of a
   geometrically exact beam does. It then projects each station with a
   parallel projection: the span goes to the right, the height goes up,
   and the chord goes down and to the right. */

import { withAlpha } from './ink.js';

export const PAZY_ASPECT = 5.5;   // span over chord
const AXIS_AT = 0.4475;           // the elastic axis, as a fraction of the chord
const RIBS = 12;
/* The run and the drop on the screen of one unit of chord. A scene
   reads the run to centre the wing. */
export const OBLIQUE = { x: 0.34, y: 0.22 };
const OBLIQUE_X = OBLIQUE.x;
const OBLIQUE_Y = OBLIQUE.y;

/**
 * @param {number} stations Intervals along the span.
 */
export function createPazyWing(stations = 48) {
  const n = stations;
  const root = { x: 0, y: 0 };
  let span = 300;
  let chord = span / PAZY_ASPECT;
  // The elastic axis, in units of the span.
  const Y = new Float64Array(n + 1);
  const Z = new Float64Array(n + 1);

  function layout(x, y, spanPx) {
    root.x = x;
    root.y = y;
    span = spanPx;
    chord = span / PAZY_ASPECT;
  }

  /** Integrate the slope along the span. The axis keeps its length. */
  function trace(psi) {
    Y[0] = 0;
    Z[0] = 0;
    const ds = 1 / n;
    for (let i = 1; i <= n; i++) {
      const a = 0.5 * (psi[i - 1] + psi[i]);
      Y[i] = Y[i - 1] + Math.cos(a) * ds;
      Z[i] = Z[i - 1] + Math.sin(a) * ds;
    }
  }

  /** The screen point of station i at a fraction c of the chord, from
      the leading edge. A twist theta turns the chord about the local
      tangent of the axis, which has the slope psi. A positive twist is
      nose up. */
  function point(i, c, theta, psi) {
    const along = (c - AXIS_AT) * chord;
    const cx = Math.cos(theta);
    const cy = Math.sin(theta) * Math.sin(psi);
    const cz = -Math.sin(theta) * Math.cos(psi);
    const wx = along * cx;
    const wy = Y[i] * span + along * cy;
    const wz = Z[i] * span + along * cz;
    return { x: root.x + wy + wx * OBLIQUE_X, y: root.y - wz + wx * OBLIQUE_Y };
  }

  function outlinePath(ctx, psi, theta) {
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const p = point(i, 0, theta[i], psi[i]);
      if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    }
    for (let i = n; i >= 0; i--) {
      const p = point(i, 1, theta[i], psi[i]);
      ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
  }

  /** The strip with its ribs and its root. */
  function draw(ctx, ink, psi, theta) {
    trace(psi);
    outlinePath(ctx, psi, theta);
    ctx.fillStyle = withAlpha(ink.wash, 0.08);
    ctx.fill();
    ctx.lineWidth = 1.3;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = ink.body;
    ctx.stroke();

    ctx.beginPath();
    for (let r = 1; r < RIBS; r++) {
      const i = Math.round((r / RIBS) * n);
      const a = point(i, 0, theta[i], psi[i]);
      const b = point(i, 1, theta[i], psi[i]);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.lineWidth = 1;
    ctx.strokeStyle = withAlpha(ink.body, 0.3);
    ctx.stroke();

    // The root, where the wing is clamped.
    const a = point(0, -0.08, 0, psi[0]);
    const b = point(0, 1.08, 0, psi[0]);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = ink.accent;
    ctx.stroke();
  }

  /** The outline alone, for a strobe or a ghost. */
  function ghost(ctx, psi, theta, style, width = 1) {
    trace(psi);
    outlinePath(ctx, psi, theta);
    ctx.lineWidth = width;
    ctx.strokeStyle = style;
    ctx.stroke();
  }

  /** The elastic axis alone, for a fan of shapes. */
  function axis(ctx, psi, style, width = 1) {
    trace(psi);
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const p = point(i, AXIS_AT, 0, psi[i]);
      if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    }
    ctx.lineWidth = width;
    ctx.strokeStyle = style;
    ctx.stroke();
  }

  /** Arrows of the load along the axis, normal to the deformed
      surface. load(i) gives the length of the arrow at station i in
      pixels, and a negative value points down. */
  function arrows(ctx, ink, psi, load, count = 8) {
    trace(psi);
    ctx.beginPath();
    for (let k = 1; k <= count; k++) {
      const i = Math.round((k / count) * n) - 1;
      const len = load(i);
      if (Math.abs(len) < 2) continue;
      const p = point(i, AXIS_AT, 0, psi[i]);
      // The normal of the axis, on the screen.
      const nx = -Math.sin(psi[i]);
      const ny = -Math.cos(psi[i]);
      const tx = p.x + nx * len;
      const ty = p.y + ny * len;
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(tx, ty);
      const sg = Math.sign(len);
      const dx = nx * sg;
      const dy = ny * sg;
      ctx.moveTo(tx, ty);
      ctx.lineTo(tx - 5 * dx - 3 * dy, ty - 5 * dy + 3 * dx);
      ctx.moveTo(tx, ty);
      ctx.lineTo(tx - 5 * dx + 3 * dy, ty - 5 * dy - 3 * dx);
    }
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = withAlpha(ink.accent, 0.75);
    ctx.stroke();
  }

  return { layout, trace, point, draw, ghost, axis, arrows, stations: n };
}
