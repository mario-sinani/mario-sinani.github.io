/* Entry point for the lab page: the features of all pages, and one
   instrument for each scene.

   An instrument is a scene from a paper page with one control. The
   visitor holds the parameter with the slider, and the sweep button
   gives the parameter back to the clock. The map has one dynamic
   import for each scene, and the page loads only the scenes on it. */

import { effectiveTheme } from './theme.js';
import { initFieldCanvas } from './field-canvas.js';
import { initSite } from './site.js';

const SCENES = {
  'incidence-sweep': () => import('./scenes/incidence-sweep.js').then((m) => m.createIncidenceSweep()),
  'pitching-section': () => import('./scenes/pitching-section.js').then((m) => m.createPitchingSection()),
  'hinged-wingtip': () => import('./scenes/hinged-wingtip.js').then((m) => m.createHingedWingtip()),
  'beam-modes': () => import('./scenes/beam-modes.js').then((m) => m.createBeamModes()),
  'event-tracking': () => import('./scenes/event-tracking.js').then((m) => m.createEventTracking()),
};

/* While the sweep runs, the slider follows the scene at this rate. */
const FOLLOW_MS = 150;

const fields = [];

initSite(() => {
  fields.forEach((field) => field.repaint());
});

/* With reduced motion or reduced data the engine draws fixed frames.
   The page must then draw a new fixed frame after each change of the
   slider. */
const stillPage = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  || window.matchMedia('(prefers-reduced-data: reduce)').matches;

function show(value, unit) {
  const text = (Math.round(value * 10) / 10).toFixed(1).replace(/\.0$/, '');
  return unit ? text + unit : text;
}

function buildControls(container, scene, field, name) {
  const lab = scene.lab;
  if (!lab) return;
  const id = 'ctl-' + name;

  const label = document.createElement('label');
  label.htmlFor = id;
  label.textContent = lab.label;

  const input = document.createElement('input');
  input.type = 'range';
  input.id = id;
  input.min = String(lab.min);
  input.max = String(lab.max);
  input.step = String(lab.step);
  input.value = String(lab.value());

  const readout = document.createElement('output');
  readout.setAttribute('for', id);
  readout.textContent = show(lab.value(), lab.unit);
  /* A screen reader reads a range as a plain number. Give it the text
     of the readout, so it says the unit too. */
  input.setAttribute('aria-valuetext', readout.textContent);

  const sweep = document.createElement('button');
  sweep.type = 'button';
  sweep.className = 'lab-sweep';
  sweep.setAttribute('aria-pressed', 'true');
  sweep.textContent = 'Sweep';

  const sweeping = () => sweep.getAttribute('aria-pressed') === 'true';

  input.addEventListener('input', () => {
    sweep.setAttribute('aria-pressed', 'false');
    lab.set(Number(input.value));
    /* Show the value of the slider itself. The scene applies it in
       its next frame. */
    readout.textContent = show(Number(input.value), lab.unit);
    input.setAttribute('aria-valuetext', readout.textContent);
    if (stillPage) field.repaint();
  });

  sweep.addEventListener('click', () => {
    if (sweeping()) return;
    sweep.setAttribute('aria-pressed', 'true');
    lab.release();
    if (stillPage) field.repaint();
  });

  /* Follow the sweep, so the slider shows the state of the scene. A
     fixed page does not move, and it does not need the timer. The
     timer also stops when the instrument leaves the screen. */
  if (!stillPage) {
    let onScreen = true;
    setInterval(() => {
      if (!sweeping() || document.hidden || !onScreen) return;
      input.value = String(lab.value());
      readout.textContent = show(lab.value(), lab.unit);
      input.setAttribute('aria-valuetext', readout.textContent);
    }, FOLLOW_MS);

    if ('IntersectionObserver' in window) {
      new IntersectionObserver((entries) => {
        onScreen = entries[entries.length - 1].isIntersecting;
      }).observe(container);
    }
  }

  container.append(label, input, readout, sweep);
}

document.querySelectorAll('canvas[data-scene]').forEach((canvas) => {
  const load = SCENES[canvas.dataset.scene];
  if (!load) return;
  load().then((scene) => {
    const field = initFieldCanvas(canvas, () => effectiveTheme() === 'dark', scene);
    if (!field) return;
    fields.push(field);
    const controls = canvas.closest('.instrument')?.querySelector('.lab-controls');
    if (controls) buildControls(controls, scene, field, canvas.dataset.scene);
  });
});
