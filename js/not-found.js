/* Entry point for the not-found page: the shared features, and the Karman
   street in the hero. The import is dynamic, so the scene loads after the
   page. */

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
