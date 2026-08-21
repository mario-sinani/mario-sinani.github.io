/* Ink: the palette that a scene draws with. The engine asks for it, and a
   scene asks for a weaker tint. A scene does not read the CSS. */

/** The same colour with a new alpha value. */
export function withAlpha(colour, alpha) {
  return colour.replace(/rgba?\(([^)]+)\)/, (whole, parts) => {
    const [r, g, b] = parts.split(',');
    return `rgba(${r},${g},${b},${alpha})`;
  });
}

/**
 * The palette of one theme.
 *
 * ground - the page background, from the CSS custom property
 * line   - the grey strokes
 * accent - the blue of the site, for the instruments and the main marks
 * wash   - a low-contrast indigo for the field, so the accent stays free
 *          for the instruments
 * body   - the outline of a body, for example a section or a beam
 * faint  - the thin lines and the reference lines
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
