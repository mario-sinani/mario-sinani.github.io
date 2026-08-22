/* Entry point for a paper page: the shared features, the field of the
   paper, and the copy button. Each canvas names its scene in data-field,
   and the import is dynamic. */

import { effectiveTheme } from './theme.js';
import { initFieldCanvas } from './field-canvas.js';
import { initSite } from './site.js';
import { initCite, initCiteFormats } from './cite.js';
import { initFieldPause } from './field-pause.js';
import { SCENES } from './scenes/registry.js';

const canvas = document.getElementById('paper-field');
let field = null;
const applyPause = initFieldPause(() => field);

initSite(() => {
  if (field) field.repaint();
});

initCite();
initCiteFormats();

const load = canvas && SCENES[canvas.dataset.field];
if (load) {
  load().then((scene) => {
    field = initFieldCanvas(canvas, () => effectiveTheme() === 'dark', scene);
    applyPause();
  }).catch((error) => {
    /* A field that does not load leaves the box empty. Say why. */
    console.error('the scene did not load', error);
  });
}
