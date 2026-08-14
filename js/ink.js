/* Ink: small helpers for the palette the field canvas hands to a scene.

   Scenes are given four resolved colours and often need the same colour at
   a weaker strength - a strobe fading into the past, a contour receding.
   Rather than each scene carrying its own copy of the palette, it asks for
   the one it was given at a different alpha. */

/** The same colour at a new alpha. Accepts the rgb()/rgba() the ink uses. */
export function withAlpha(colour, alpha) {
  return colour.replace(/rgba?\(([^)]+)\)/, (whole, parts) => {
    const [r, g, b] = parts.split(',');
    return `rgba(${r},${g},${b},${alpha})`;
  });
}
