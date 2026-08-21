/* Entry point for the home page: the shared features, and the field in the
   hero.

   The hero has two fields, and the page takes one at random. Both show a
   cylinder in a stream: vortex-street draws streamlines through the
   vortices it sheds, lifting-cylinder draws particles along their paths.
   The import is dynamic, so the page loads only the field it took. */

import { effectiveTheme } from './theme.js';
import { initFieldCanvas } from './field-canvas.js';
import { initSite } from './site.js';
import { initFieldPause } from './field-pause.js';

const FIELDS = {
  'vortex-street': () => import('./scenes/vortex-street.js').then((m) => m.createVortexStreet()),
  'lifting-cylinder': () => import('./scenes/lifting-cylinder.js').then((m) => m.createLiftingCylinder()),
};

const canvas = document.getElementById('flowfield');
let field = null;
const applyPause = initFieldPause(() => field);

initSite(() => {
  if (field) field.repaint();
});

if (canvas) {
  const names = Object.keys(FIELDS);
  const name = names[Math.floor(Math.random() * names.length)];
  // Keep the choice on the page: a check reads it later.
  canvas.dataset.field = name;
  FIELDS[name]().then((scene) => {
    field = initFieldCanvas(canvas, () => effectiveTheme() === 'dark', scene);
    applyPause();
  });
}
