/* Entry point for the not-found page: the features of all pages, and
   the field in the hero.

   The page uses the Karman street. The home page can draw the same
   scene: a body in a stream, and the wake behind it. The import is
   dynamic, and the browser loads the scene and the engine after the
   page is on the screen. */

import { effectiveTheme } from './theme.js';
import { initFieldCanvas } from './field-canvas.js';
import { initSite } from './site.js';
import { initFieldPause } from './field-pause.js';

const canvas = document.getElementById('flowfield');
let field = null;
const applyPause = initFieldPause(() => field);

initSite(() => {
  if (field) field.repaint();
});

if (canvas) {
  import('./scenes/vortex-street.js').then((m) => {
    field = initFieldCanvas(canvas, () => effectiveTheme() === 'dark', m.createVortexStreet());
    applyPause();
  });
}
