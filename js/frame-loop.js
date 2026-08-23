/* Loop: the animation loop of one field.

   The loop runs while the canvas is on the screen and the tab is in
   front, and a pause stops it. It calls the step that it is given, and
   knows nothing of the drawing. */

export function createLoop(element, step) {
  let handle = 0;
  let onScreen = true;
  let userPaused = false;
  let stopped = false;

  function tick(time) {
    step(time);
    handle = requestAnimationFrame(tick);
  }

  /* A second call in the same state does nothing. */
  function start() {
    if (handle || stopped || userPaused) return;
    handle = requestAnimationFrame(tick);
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

  document.addEventListener('visibilitychange', sync);

  /* Without IntersectionObserver the field is always on the screen. */
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      onScreen = entries[entries.length - 1].isIntersecting;
      sync();
    }).observe(element);
  }

  return {
    get running() { return Boolean(handle); },
    sync,
    stop,
    /** Never run: a fixed frame, reduced motion or reduced data. */
    freeze() { stopped = true; stop(); },
    /** Set or clear the pause. It gives back true for a pause. */
    setPaused(paused) {
      userPaused = paused;
      if (paused) stop();
      else sync();
      return paused;
    },
  };
}
