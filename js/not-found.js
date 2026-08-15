/* Entry point for the not-found page: the shared site features plus the
   hero field.

   The page uses the Karman street, the same scene the home page can
   draw: a body in a stream, and the wake that trails behind it. The
   import is dynamic, so the scene and the engine load after the page is
   on screen. */

import { effectiveTheme } from './theme.js';
import { initFieldCanvas } from './field-canvas.js';
import { initSite } from './site.js';

const canvas = document.getElementById('flowfield');
let field = null;

initSite(() => {
  if (field) field.repaint();
});

if (canvas) {
  import('./scenes/vortex-street.js').then((m) => {
    field = initFieldCanvas(canvas, () => effectiveTheme() === 'dark', m.createVortexStreet());
  });
}
