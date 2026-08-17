/* Entry point for the home page: the features of all pages, and the
   field in the hero.

   The hero has two fields, and the page selects one at random in each
   visit. Both show a cylinder in a stream, by the two methods this site
   uses to draw a flow:

     vortex-street     the Karman street, as streamlines through the
                       vortices that the body sheds
     lifting-cylinder  the same body with a steady circulation, as
                       particles that make a line along their paths

   The map has one dynamic import for each field, and the page gets only
   the field that it selected. */

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
  // Keep the choice in the page, because a check must read it later.
  canvas.dataset.field = name;
  FIELDS[name]().then((scene) => {
    field = initFieldCanvas(canvas, () => effectiveTheme() === 'dark', scene);
  });
}
