/* Field canvas: the engine for one moving background.

   The engine sizes the canvas to its parent at the device pixel ratio,
   fades the last frame toward the page background, runs the animation
   loop, and draws one fixed frame if the visitor asks for reduced
   motion or for reduced data.

   A scene object gives the drawing, with these members:

     fade                    the fade to the background in each frame,
                             from 0 to 1
     layout(w, h, fit)       set the positions and the sizes. The fit
                             gives band, how far down the box the
                             subject sits; scale, the size of the
                             subject against its normal size; and
                             preview, true in a small window that shows
                             the top of the box only.
     frame(ctx, dt, t, ink)  draw one frame
     still(ctx, ink, t)      draw one fixed frame. A scene that draws a
                             later time than t, because t is zero and
                             its subject needs a past, gives that time
                             back, and the loop continues from it.

   The engine passes a palette and the theme to each call (see ink.js),
   so a scene does not read the CSS. The loop runs only while the canvas
   is on the screen and the tab is in front, because a hero field is off
   the screen for most of a visit. The visitor can also stop the loop
   with setPaused.

   A preview asks for one fixed frame at a chosen time with
   options.still. The loop then never runs, and every visitor gets
   the same picture. A page that shows a scene alone gives a larger
   options.band and options.scale, and the subject then sits near the
   middle of the box and takes more of it. */

import { resolveInk } from './ink.js';

export function initFieldCanvas(canvas, isDark, scene, options = {}) {
  if (!canvas || !scene) return null;

  const ctx = canvas.getContext('2d');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  /* A visitor on a metered connection asks for reduced data. The scene
     then draws one fixed frame and does not run. */
  const reducedData = window.matchMedia('(prefers-reduced-data: reduce)').matches;
  /* The time of a preview. The value null means that the field runs. */
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
    /* One fixed frame at once. The field then never shows an empty
       box before the first animation frame, and it shows this frame
       while the loop is off. The loop continues from the time of that
       frame, so the past the scene built for it stays in the past. */
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

  /* A second call to start or to stop in the same state has no bad
     effect. A start sets the frame time to zero. The first step after a
     pause then gets the limit of 0.05 s in frame(). The scene does not
     move forward by the length of the pause. */
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
     controls use this call while the loop is off. */
  function repaint() {
    readInk();
    wash(1);
    if (!handle) scene.still(ctx, ink, clock);
  }

  /* The pause control of the visitor. A pause draws one fixed frame,
     so the picture does not depend on the moment of the click. */
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

  /* A resize event can come many times in one second while the visitor
     moves the edge of the window. Each call to resize() makes the canvas
     bitmap again. One call in each frame is enough, because the screen
     cannot show more. */
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

  /* If the browser has no IntersectionObserver, the field is always on
     the screen. This is the behaviour before this control. */
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      onScreen = entries[entries.length - 1].isIntersecting;
      sync();
    }).observe(canvas);
  }

  sync();

  return { repaint, setPaused };
}
