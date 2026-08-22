/* Field canvas: the engine that puts a scene on a canvas.

   It joins three parts: the surface, which holds the bitmap and the
   palette (canvas-surface.js); the loop, which runs while the canvas is
   on the screen (frame-loop.js); and the scene, which draws. It draws one
   fixed frame with reduced motion or reduced data.

   A scene gives the drawing:

     fade                    the fade to the background in each frame
     layout(w, h, fit)       set the positions. fit.band is how far down
                             the box the subject sits, fit.scale its
                             size, fit.preview true in a small window
     reset()                 put the model back at its start, if it has
                             one to put back
     frame(ctx, dt, t, ink)  draw one frame
     lab                     the control of the lab page: the range, the
                             value, set, release, autoName, and status
     probe()                 a few numbers of the state, for a test
     still(ctx, ink, t)      draw one fixed frame. A scene that needs a
                             past draws a later time and gives it back,
                             and the loop continues from it.

   The engine passes the palette (see ink.js), so a scene does not read
   the CSS. The loop runs only while the canvas is on the screen and the
   tab is in front. options.still asks for one fixed frame at a time, and
   the loop then never runs. */

import { createSurface } from './canvas-surface.js';
import { createLoop } from './frame-loop.js';

export function initFieldCanvas(canvas, isDark, scene, options = {}) {
  if (!canvas || !scene) return null;

  const surface = createSurface(canvas, isDark);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  /* Reduced data: draw one fixed frame and do not run. */
  const reducedData = window.matchMedia('(prefers-reduced-data: reduce)').matches;
  /* The time of a fixed frame. null means that the field runs. */
  const stillAt = typeof options.still === 'number' ? options.still : null;
  const fit = { band: options.band, scale: options.scale, preview: Boolean(options.preview) };
  const fixed = reducedMotion || reducedData || stillAt !== null;
  let clock = stillAt === null ? 0 : stillAt;
  let lastFrameTime = 0;

  function step(time) {
    /* The limit of 0.05 s holds the first step after a pause, a resize or
       a tab that comes back, so the scene does not jump. */
    const dt = Math.min((time - lastFrameTime) / 1000, 0.05) || 0.016;
    lastFrameTime = time;
    clock += dt;
    surface.wash(scene.fade);
    surface.ctx.lineCap = 'butt';
    scene.frame(surface.ctx, dt, clock, surface.ink);
  }

  const loop = createLoop(canvas, step);
  if (fixed) loop.freeze();

  function resize() {
    surface.fit();
    scene.layout(surface.width, surface.height, fit);
    /* The geometry changed, so the model starts again and the fixed frame
       below builds the past it needs. */
    if (scene.reset) scene.reset();
    surface.wash(1);
    /* One fixed frame at once, so the box is never empty. The loop
       continues from the time of that frame, and the past the scene built
       stays in the past. */
    const shown = scene.still(surface.ctx, surface.ink, clock);
    if (typeof shown === 'number' && shown > clock) clock = shown;
  }

  /* Draw the state again with no motion. The theme button and the lab
     controls use it while the loop is off. */
  function repaint() {
    surface.readInk();
    surface.wash(1);
    if (!loop.running) scene.still(surface.ctx, surface.ink, clock);
  }

  /* The pause control. A pause draws one fixed frame, so the picture does
     not depend on the moment of the click. */
  function setPaused(paused) {
    if (loop.setPaused(paused)) {
      surface.wash(1);
      scene.still(surface.ctx, surface.ink, clock);
    }
  }

  /* A resize can come many times in one second, and each call makes the
     bitmap again. One call in each frame is enough. */
  let resizePending = 0;
  function onResize() {
    if (resizePending) return;
    resizePending = requestAnimationFrame(() => {
      resizePending = 0;
      resize();
    });
  }

  resize();
  window.addEventListener('resize', onResize);
  loop.sync();

  return { repaint, setPaused };
}
