/* Entry point for the home page: the shared site features plus the
   hero field. Dependencies are wired here.

   The hero has two fields, and the page selects one at random on each
   visit. Both show a cylinder in a stream, by the two methods this field
   uses to draw a flow:

     vortex-street     the Karman street, as streamlines through the
                       vortices the body sheds
     lifting-cylinder  the same body with steady circulation, as
                       particles that trail along their paths

   The map holds one dynamic import for each field, so the page fetches
   only the one it selected. */

import { effectiveTheme } from './theme.js';
import { initFieldCanvas } from './field-canvas.js';
import { initSite } from './site.js';

const FIELDS = {
  'vortex-street': () => import('./scenes/vortex-street.js').then((m) => m.createVortexStreet()),
  'lifting-cylinder': () => import('./scenes/lifting-cylinder.js').then((m) => m.createLiftingCylinder()),
};

const canvas = document.getElementById('flowfield');
let field = null;

initSite(() => {
  if (field) field.repaint();
});

if (canvas) {
  const names = Object.keys(FIELDS);
  const name = names[Math.floor(Math.random() * names.length)];
  // Record the choice, so it can be read in the page.
  canvas.dataset.field = name;
  FIELDS[name]().then((scene) => {
    field = initFieldCanvas(canvas, () => effectiveTheme() === 'dark', scene);
  });
}
