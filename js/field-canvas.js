/* Field canvas: the engine for one moving background.

   The engine controls the canvas. It sets the size of the canvas to the
   size of the parent element, at the device pixel ratio. It makes the
   last frame fade to the colour of the page background. It runs the
   animation loop. It draws one fixed frame if the visitor asks for
   reduced motion.

   The scene object gives the drawing. A scene has these members:

     fade                    the fade to the background in each frame,
                             from 0 to 1
     layout(width, height)   set the positions and the sizes
     frame(ctx, dt, t, ink)  draw one frame
     still(ctx, ink, t)      draw one fixed frame

   The engine gives a palette of colours to each call (see ink.js), and
   a scene does not read the CSS. The isDark function gives the theme in
   use.

   The loop runs only while the canvas is on the screen and the tab is
   in front. A field in the hero is off the screen for most of a visit.
   A loop that continues there uses the battery with no result. */

import { resolveInk } from './ink.js';

export function initFieldCanvas(canvas, isDark, scene) {
  if (!canvas || !scene) return null;

  const ctx = canvas.getContext('2d');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let ink = resolveInk(false, '#ffffff');
  let width = 0;
  let height = 0;
  let clock = 0;
  let lastFrameTime = 0;
  let handle = 0;
  let onScreen = true;

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
    scene.layout(width, height);
    wash(1);
    if (reducedMotion) scene.still(ctx, ink, clock);
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
    if (handle || reducedMotion) return;
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

  function repaint() {
    readInk();
    wash(1);
    if (reducedMotion) scene.still(ctx, ink, clock);
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

  return { repaint };
}
