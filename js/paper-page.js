/* Entry point for a paper page: the shared site features, the paper's
   animated field, and the citation copy button.

   Each paper page names its scene in the canvas data-field attribute.
   The map keeps one dynamic import per scene, so a page fetches only
   the scene it uses. */

import { effectiveTheme } from './theme.js';
import { initFieldCanvas } from './field-canvas.js';
import { initSite } from './site.js';
import { initCite } from './cite.js';

const SCENES = {
  'pitching-section': () => import('./scenes/pitching-section.js').then((m) => m.createPitchingSection()),
  'incidence-sweep': () => import('./scenes/incidence-sweep.js').then((m) => m.createIncidenceSweep()),
  'hinged-wingtip': () => import('./scenes/hinged-wingtip.js').then((m) => m.createHingedWingtip()),
  'beam-modes': () => import('./scenes/beam-modes.js').then((m) => m.createBeamModes()),
  'event-tracking': () => import('./scenes/event-tracking.js').then((m) => m.createEventTracking()),
  'image-servo': () => import('./scenes/image-servo.js').then((m) => m.createImageServo()),
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
