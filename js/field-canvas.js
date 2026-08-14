/* Field canvas: the plumbing every animated background shares - sizing to
   the parent at device pixel ratio, resolving the theme colours, washing
   the previous frame toward the page ground, the animation loop, and the
   frozen frame drawn instead when reduced motion is asked for.

   What is drawn comes from a scene, so a new background is a new scene
   rather than another copy of this file. A scene provides:

     fade                    per-frame wash toward the ground, 0..1
     layout(width, height)   position and size everything
     frame(ctx, dt, t, ink)  draw one frame
     still(ctx, ink, t)      draw a single frozen frame

   `ink` carries the resolved palette, so scenes never read CSS themselves.
   The theme arrives as an `isDark` predicate for the same reason. */

export function initFieldCanvas(canvas, isDark, scene) {
  if (!canvas || !scene) return null;

  const ctx = canvas.getContext('2d');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ink = { ground: '', line: '', accent: '', body: '', dark: false };
  let width = 0;
  let height = 0;
  let clock = 0;
  let lastFrameTime = 0;

  function readInk() {
    const styles = getComputedStyle(document.documentElement);
    const dark = isDark();
    ink.dark = dark;
    ink.ground = styles.getPropertyValue('--paper').trim();
    ink.line = dark ? 'rgba(237, 242, 246, 0.32)' : 'rgba(15, 25, 38, 0.3)';
    ink.accent = dark ? 'rgba(106, 106, 255, 0.8)' : 'rgba(0, 0, 205, 0.7)';
    ink.body = dark ? 'rgba(154, 154, 255, 0.75)' : 'rgba(0, 0, 205, 0.55)';
    ink.faint = dark ? 'rgba(237, 242, 246, 0.16)' : 'rgba(15, 25, 38, 0.14)';
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
