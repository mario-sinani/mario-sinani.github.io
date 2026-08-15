/* Field canvas: the engine that runs one animated background.

   The engine owns the canvas lifecycle: it sizes the canvas to its parent
   at the device pixel ratio, washes the last frame toward the page
   ground, runs the animation loop, and draws one still frame when the
   visitor prefers reduced motion.

   What is drawn comes from a scene object. A scene provides:

     fade                    per-frame wash toward the ground, 0..1
     layout(width, height)   set positions and sizes
     frame(ctx, dt, t, ink)  draw one frame
     still(ctx, ink, t)      draw one frozen frame

   The engine gives each call a resolved palette (see ink.js), so scenes
   do not read the CSS. The isDark function reports the active theme.

   The loop runs only while the canvas is on the screen and the tab is in
   front. A field in the hero is off the screen for most of a visit, and
   a loop that continues there drains the battery for no result. */

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

  /* Start and stop are safe to call again in the same state. On a start
     the frame time resets to zero. The first step after a pause then
     hits the 0.05 s clamp in frame(), so the scene does not jump forward
     by the length of the pause. */
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

  /* A resize event can arrive many times a second while a window edge is
     dragged, and each resize() allocates the canvas bitmap again. One
     call per frame is enough, because the screen cannot show more. */
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

  /* Without IntersectionObserver the field counts as always on screen,
     which is the behaviour before this gate. */
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      onScreen = entries[entries.length - 1].isIntersecting;
      sync();
    }).observe(canvas);
  }

  sync();

  return { repaint };
}
