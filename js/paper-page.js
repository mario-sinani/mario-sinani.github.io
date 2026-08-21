/* Entry point for a paper page: the shared features, the field of the
   paper, and the copy button. Each canvas names its scene in data-field,
   and the import is dynamic. */

import { effectiveTheme } from './theme.js';
import { initFieldCanvas } from './field-canvas.js';
import { initSite } from './site.js';
import { initCite, initCiteFormats } from './cite.js';
import { initFieldPause } from './field-pause.js';

const SCENES = {
  'pazy-flutter': () => import('./scenes/pazy-flutter.js').then((m) => m.createPazyFlutter()),
  'pazy-step': () => import('./scenes/pazy-step.js').then((m) => m.createPazyStep()),
  'hinged-wingtip': () => import('./scenes/hinged-wingtip.js').then((m) => m.createHingedWingtip()),
  'beam-modes': () => import('./scenes/beam-modes.js').then((m) => m.createBeamModes()),
  'event-tracking': () => import('./scenes/event-tracking.js').then((m) => m.createEventTracking()),
  'image-servo': () => import('./scenes/image-servo.js').then((m) => m.createImageServo()),
};

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
  });
}
