/* Entry point for the home page: the shared site features plus the
   hero field. Dependencies are wired here. */

import { effectiveTheme } from './theme.js';
import { initFieldCanvas } from './field-canvas.js';
import { createVortexStreet } from './scenes/vortex-street.js';
import { initSite } from './site.js';

const field = initFieldCanvas(
  document.getElementById('flowfield'),
  () => effectiveTheme() === 'dark',
  createVortexStreet()
);

initSite(() => {
  if (field) field.repaint();
});
