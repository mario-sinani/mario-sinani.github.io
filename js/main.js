/* Entry point for the home page: the shared site features plus the hero
   field, which exists only here. Modules receive their dependencies here
   instead of reaching into each other. */

import { effectiveTheme } from './theme.js';
import { initFieldCanvas } from './field-canvas.js';
import { createLiftingCylinder } from './scenes/lifting-cylinder.js';
import { initSite } from './site.js';

const field = initFieldCanvas(
  document.getElementById('flowfield'),
  () => effectiveTheme() === 'dark',
  createLiftingCylinder()
);

initSite(() => {
  if (field) field.repaint();
});
