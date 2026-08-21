/* Entry point for the lab: the catalogue and the page of one model.

   An instrument is a scene from a paper page with one control. The
   parameter has two modes. In Auto the model sets it: it runs the
   cases of the paper, or it keeps the value of the paper. In Hold the
   slider sets it. A line of text below the control says what the
   model does at this moment, from the words the scene gives. A canvas
   with data-preview is a preview on the catalogue: it runs like a
   field, in the frame of the scene and with no control. A canvas with
   a time in data-still draws one fixed frame at that time and never
   runs. The map has one dynamic import for each scene, and the page
   loads only the scenes on it. */

import { effectiveTheme } from './theme.js';
import { initFieldCanvas } from './field-canvas.js';
import { initSite } from './site.js';

const SCENES = {
  'pazy-step': () => import('./scenes/pazy-step.js').then((m) => m.createPazyStep()),
  'pazy-flutter': () => import('./scenes/pazy-flutter.js').then((m) => m.createPazyFlutter()),
  'hinged-wingtip': () => import('./scenes/hinged-wingtip.js').then((m) => m.createHingedWingtip()),
  'beam-modes': () => import('./scenes/beam-modes.js').then((m) => m.createBeamModes()),
  'event-tracking': () => import('./scenes/event-tracking.js').then((m) => m.createEventTracking()),
  'image-servo': () => import('./scenes/image-servo.js').then((m) => m.createImageServo()),
};

/* In Auto the slider and the status follow the scene at this rate. */
const FOLLOW_MS = 150;

/* The page of a model shows the scene alone. The subject then sits
   near the middle of the stage and not near its top, and it is larger
   than on a page that uses the scene as a background. A preview keeps
   the values of the scene, because the card cuts the box. */
const MODEL_FIT = { band: 0.42, scale: 1.3 };

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

  /* The two modes. Auto: the model sets the parameter. Hold: the
     slider sets it. */
  const modes = document.createElement('div');
  modes.className = 'lab-modes';
  modes.setAttribute('role', 'group');
  modes.setAttribute('aria-label', 'Who sets the parameter');
  const auto = modeButton('Auto', true, lab.auto ? 'The model sets the parameter: ' + lab.auto.name : 'The model sets the parameter');
  const hold = modeButton('Hold', false, 'The slider sets the parameter');
  modes.append(auto, hold);

  /* What the model does at this moment, in words. */
  const status = document.createElement('p');
  status.className = 'lab-status';
  status.setAttribute('role', 'status');

  const isAuto = () => auto.getAttribute('aria-pressed') === 'true';

  function setMode(toAuto) {
    auto.setAttribute('aria-pressed', String(toAuto));
    hold.setAttribute('aria-pressed', String(!toAuto));
  }

  function showValue(v) {
    readout.textContent = show(v, lab.unit);
    input.setAttribute('aria-valuetext', readout.textContent);
  }

  function refresh() {
    const v = Number(input.value);
    if (isAuto()) status.textContent = lab.auto ? lab.auto.status() : '';
    else status.textContent = lab.hold ? lab.hold(v) : 'Held at ' + show(v, lab.unit) + '.';
  }

  input.addEventListener('input', () => {
    setMode(false);
    lab.set(Number(input.value));
    /* Show the value of the slider itself. The scene applies it in
       its next frame. */
    showValue(Number(input.value));
    refresh();
    if (stillPage) field.repaint();
  });

  auto.addEventListener('click', () => {
    if (isAuto()) return;
    setMode(true);
    lab.release();
    refresh();
    if (stillPage) field.repaint();
  });

  hold.addEventListener('click', () => {
    if (!isAuto()) return;
    setMode(false);
    lab.set(Number(input.value));
    refresh();
    if (stillPage) field.repaint();
  });

  /* In Auto the slider and the status follow the scene. A fixed page
     does not move, and it does not need the timer. The timer also
     stops when the instrument leaves the screen. */
  if (!stillPage) {
    let onScreen = true;
    setInterval(() => {
      if (document.hidden || !onScreen) return;
      if (isAuto()) {
        input.value = String(lab.value());
        showValue(lab.value());
      }
      refresh();
    }, FOLLOW_MS);

    if ('IntersectionObserver' in window) {
      new IntersectionObserver((entries) => {
        onScreen = entries[entries.length - 1].isIntersecting;
      }).observe(container);
    }
  }

  refresh();
  container.append(label, input, readout, modes);
  // The status is a line of its own, below the control.
  container.after(status);
}

function modeButton(text, pressed, title) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'lab-mode';
  button.setAttribute('aria-pressed', String(pressed));
  button.title = title;
  button.textContent = text;
  return button;
}

document.querySelectorAll('canvas[data-scene]').forEach((canvas) => {
  const load = SCENES[canvas.dataset.scene];
  if (!load) return;
  const still = canvas.dataset.still;
  const preview = canvas.dataset.preview !== undefined;
  load().then((scene) => {
    let options = MODEL_FIT;
    if (still !== undefined) options = { still: Number(still) };
    else if (preview) options = { preview: true };
    const field = initFieldCanvas(canvas, () => effectiveTheme() === 'dark', scene, options);
    if (!field) return;
    fields.push(field);
    if (preview || still !== undefined) return;
    const controls = canvas.closest('.instrument')?.querySelector('.lab-controls');
    if (controls) buildControls(controls, scene, field, canvas.dataset.scene);
  });
});
