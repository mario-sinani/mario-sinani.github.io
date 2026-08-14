/* Ink: the colours a scene draws with.

   This module owns colour. The canvas engine asks it for a palette, and
   the scenes ask it for weaker tints of that palette. Scenes do not read
   the CSS. */

/** Return the same colour with a new alpha value. */
export function withAlpha(colour, alpha) {
  return colour.replace(/rgba?\(([^)]+)\)/, (whole, parts) => {
    const [r, g, b] = parts.split(',');
    return `rgba(${r},${g},${b},${alpha})`;
  });
}

/**
 * Build the palette for one theme.
 *
 * ground - the page background, taken from the CSS custom property.
 * line   - grey strokes.
 * accent - the brand blue. Use it for instruments and key marks.
 * wash   - a low-contrast indigo. Use it for field elements. The accent
 *          then stays available for the instruments.
 * body   - the outline colour for bodies (wing sections, beams).
 * faint  - hairlines and reference lines.
 */
export function resolveInk(dark, ground) {
  return {
    dark,
    ground,
    line: dark ? 'rgba(237, 242, 246, 0.32)' : 'rgba(15, 25, 38, 0.3)',
    accent: dark ? 'rgba(106, 106, 255, 0.8)' : 'rgba(0, 0, 205, 0.7)',
    body: dark ? 'rgba(154, 154, 255, 0.75)' : 'rgba(0, 0, 205, 0.55)',
    wash: dark ? 'rgba(148, 154, 236, 0.6)' : 'rgba(84, 92, 190, 0.6)',
    faint: dark ? 'rgba(237, 242, 246, 0.16)' : 'rgba(15, 25, 38, 0.14)',
  };
}
