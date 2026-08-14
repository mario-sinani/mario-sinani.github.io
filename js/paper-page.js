/* Entry point for an individual paper page: the shared site features, the
   paper's own animated field and the citation copy button.

   Every paper page uses this one entry point and names its field in the
   canvas markup. The map below keeps one static import per scene, so a
   page fetches the scene it uses and none of the others. */

import { effectiveTheme } from './theme.js';
import { initFieldCanvas } from './field-canvas.js';
import { initSite } from './site.js';
import { initCite } from './cite.js';

const SCENES = {
  'pitching-section': () => import('./scenes/pitching-section.js').then((m) => m.createPitchingSection()),
};

const canvas = document.getElementById('paper-field');
let field = null;

initSite(() => {
  if (field) field.repaint();
});

initCite();

const load = canvas && SCENES[canvas.dataset.field];
if (load) {
  load().then((scene) => {
    field = initFieldCanvas(canvas, () => effectiveTheme() === 'dark', scene);
  });
}
