/* Surface: the canvas that a scene draws on.

   It holds the bitmap at the pixel ratio of the device, the size in CSS
   pixels, and the palette of the theme. It knows nothing of the loop or
   of the scene. */

import { resolveInk } from './ink.js';

export function createSurface(canvas, isDark) {
  const ctx = canvas.getContext('2d');
  let width = 0;
  let height = 0;
  let ink = resolveInk(false, '#ffffff');

  /** Read the palette of the theme that is on the page. */
  function readInk() {
    const ground = getComputedStyle(document.documentElement)
      .getPropertyValue('--paper').trim();
    ink = resolveInk(isDark(), ground);
  }

  return {
    ctx,
    get width() { return width; },
    get height() { return height; },
    get ink() { return ink; },
    readInk,
    /** Size the bitmap to the parent, at the pixel ratio of the device. */
    fit() {
      const rect = canvas.parentElement.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(rect.width, 1);
      height = Math.max(rect.height, 1);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      readInk();
    },
    /** Fade the last frame toward the background of the page. */
    wash(alpha) {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = ink.ground;
      ctx.fillRect(0, 0, width, height);
      ctx.globalAlpha = 1;
    },
  };
}
