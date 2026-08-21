/* Pause: the control that stops a background field. The button keeps the
   state in aria-pressed, and the page applies it when the scene is ready,
   because the scene loads later. CSS shows the button only with a script. */

export function initFieldPause(getField) {
  const button = document.getElementById('field-pause');
  if (!button) return () => {};

  function apply() {
    const paused = button.getAttribute('aria-pressed') === 'true';
    button.setAttribute('aria-label',
      paused ? 'Start the motion of the background' : 'Stop the motion of the background');
    const field = getField();
    if (field) field.setPaused(paused);
  }

  button.addEventListener('click', () => {
    const paused = button.getAttribute('aria-pressed') === 'true';
    button.setAttribute('aria-pressed', String(!paused));
    apply();
  });

  return apply;
}
