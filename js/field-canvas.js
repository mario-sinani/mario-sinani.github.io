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
   do not read the CSS. The isDark function reports the active theme. */

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
    requestAnimationFrame(frame);
  }

  function repaint() {
    readInk();
    wash(1);
    if (reducedMotion) scene.still(ctx, ink, clock);
  }

  resize();
  window.addEventListener('resize', resize);
  if (!reducedMotion) requestAnimationFrame(frame);

  return { repaint };
}
