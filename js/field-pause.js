/* Pause: the control that stops the motion of a background field.

   The button keeps the wish of the visitor in aria-pressed. The page
   applies the wish to the field when the field is ready, because the
   scene loads after the page. CSS shows the button only if JavaScript
   runs, because only a script can stop the loop. */

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
