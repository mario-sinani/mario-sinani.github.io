/* The scenes, by the name a page gives in data-scene or data-field.

   Each entry is a dynamic import, so a page loads only the scenes on
   it. The lab pages and the paper pages read the same map. */

export const SCENES = Object.freeze({
  'pazy-step': () => import('./pazy-step.js').then((m) => m.createPazyStep()),
  'pazy-flutter': () => import('./pazy-flutter.js').then((m) => m.createPazyFlutter()),
  'hinged-wingtip': () => import('./hinged-wingtip.js').then((m) => m.createHingedWingtip()),
  'beam-modes': () => import('./beam-modes.js').then((m) => m.createBeamModes()),
  'event-tracking': () => import('./event-tracking.js').then((m) => m.createEventTracking()),
  'image-servo': () => import('./image-servo.js').then((m) => m.createImageServo()),
});

/* The two fields of the hero. The home page takes one at random. */
export const FIELDS = Object.freeze({
  'vortex-street': () => import('./vortex-street.js').then((m) => m.createVortexStreet()),
  'lifting-cylinder': () => import('./lifting-cylinder.js').then((m) => m.createLiftingCylinder()),
});
