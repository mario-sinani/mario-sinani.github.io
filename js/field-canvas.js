/* Field canvas: the engine for one moving background. It sizes the canvas
   to its parent, fades the last frame toward the page background, runs
   the loop, and draws one fixed frame with reduced motion or reduced
   data.

   A scene gives the drawing:

     fade                    the fade to the background in each frame
     layout(w, h, fit)       set the positions. fit.band is how far down
                             the box the subject sits, fit.scale its
                             size, fit.preview true in a small window
     frame(ctx, dt, t, ink)  draw one frame
     still(ctx, ink, t)      draw one fixed frame. A scene that needs a
                             past draws a later time and gives it back,
                             and the loop continues from it.

   The engine passes the palette (see ink.js), so a scene does not read
   the CSS. The loop runs only while the canvas is on the screen and the
   tab is in front. options.still asks for one fixed frame at a time, and
   the loop then never runs. */

import { resolveInk } from './ink.js';

export function initFieldCanvas(canvas, isDark, scene, options = {}) {
  if (!canvas || !scene) return null;

  const ctx = canvas.getContext('2d');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  /* Reduced data: draw one fixed frame and do not run. */
  const reducedData = window.matchMedia('(prefers-reduced-data: reduce)').matches;
  /* The time of a fixed frame. null means that the field runs. */
  const stillAt = typeof options.still === 'number' ? options.still : null;
  const fit = { band: options.band, scale: options.scale, preview: Boolean(options.preview) };
  const fixed = reducedMotion || reducedData || stillAt !== null;
  let ink = resolveInk(false, '#ffffff');
  let width = 0;
  let height = 0;
  let clock = stillAt === null ? 0 : stillAt;
  let lastFrameTime = 0;
  let handle = 0;
  let onScreen = true;
  let userPaused = false;

  function readInk() {
    const ground = getComputedStyle(document.documentElement)
      .getPropertyValue('--paper').trim();
    ink = resolveInk(isDark(), ground);
  }

  function wash(alpha) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = ink.ground;
    ctx.fillRect(0, 0, width, height);
    ctx.globalAlpha = 1;
  }

  function resize() {
    const rect = canvas.parentElement.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = Math.max(rect.width, 1);
    height = Math.max(rect.height, 1);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    readInk();
    scene.layout(width, height, fit);
    wash(1);
    /* One fixed frame at once, so the box is never empty. The loop
       continues from the time of that frame, and the past the scene built
       stays in the past. */
    const shown = scene.still(ctx, ink, clock);
    if (typeof shown === 'number' && shown > clock) clock = shown;
  }

  function frame(time) {
    const dt = Math.min((time - lastFrameTime) / 1000, 0.05) || 0.016;
    lastFrameTime = time;
    clock += dt;
    wash(scene.fade);
    ctx.lineCap = 'butt';
    scene.frame(ctx, dt, clock, ink);
    handle = requestAnimationFrame(frame);
  }

  /* A second call in the same state does nothing. A start sets the frame
     time to zero, so the first step after a pause gets the limit of 0.05 s
     and the scene does not jump. */
  function start() {
    if (handle || fixed || userPaused) return;
    lastFrameTime = 0;
    handle = requestAnimationFrame(frame);
  }

  function stop() {
    if (!handle) return;
    cancelAnimationFrame(handle);
    handle = 0;
  }

  function sync() {
    if (onScreen && !document.hidden) start();
    else stop();
  }

  /* Draw the state again with no motion. The theme button and the lab
     controls use it while the loop is off. */
  function repaint() {
    readInk();
    wash(1);
    if (!handle) scene.still(ctx, ink, clock);
  }

  /* The pause control. A pause draws one fixed frame, so the picture does
     not depend on the moment of the click. */
  function setPaused(paused) {
    userPaused = paused;
    if (paused) {
      stop();
      wash(1);
      scene.still(ctx, ink, clock);
    } else {
      sync();
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
  document.addEventListener('visibilitychange', sync);

  /* Without IntersectionObserver the field is always on the screen. */
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      onScreen = entries[entries.length - 1].isIntersecting;
      sync();
    }).observe(canvas);
  }

  sync();

  return { repaint, setPaused };
}
