/* The tests of the engine: the surface, the loop and the field.

   The browser gives the engine its canvas, its clock and its
   observers. Here they come from stubs, so the loop can be driven step by
   step and the rules can be checked: one fixed frame at once, no motion
   while paused or hidden, and no loop at all for a fixed frame. */

import { recordingContext } from './canvas-stub.mjs';

let failed = 0;
function ok(name, condition, detail) {
  console.log(`${condition ? 'pass' : 'FAIL'}  ${name.padEnd(58)} ${detail === undefined ? '' : detail}`);
  if (!condition) failed += 1;
}

/* The page that the modules find. */
const frames = [];
let now = 0;
let hidden = false;
const listeners = {};
let observed = null;

globalThis.requestAnimationFrame = (fn) => { frames.push(fn); return frames.length; };
globalThis.cancelAnimationFrame = (handle) => { frames[handle - 1] = null; };
globalThis.getComputedStyle = () => ({ getPropertyValue: () => '#f3f5f6' });
globalThis.window = {
  matchMedia: (query) => ({ matches: false, addEventListener() {} }),
  devicePixelRatio: 1,
  addEventListener() {},
  requestAnimationFrame: globalThis.requestAnimationFrame,
};
globalThis.document = {
  documentElement: {},
  get hidden() { return hidden; },
  addEventListener(name, fn) { listeners[name] = fn; },
};
globalThis.IntersectionObserver = class {
  constructor(fn) { this.fn = fn; observed = this; }
  observe() {}
  send(isIntersecting) { this.fn([{ isIntersecting }]); }
};
/* In a browser window is the global object. The stub must hold the
   observer under both names, because the loop asks the window for it. */
globalThis.window.IntersectionObserver = globalThis.IntersectionObserver;

/** Run every frame that waits, once. */
function pump(times = 1) {
  for (let k = 0; k < times; k++) {
    const waiting = frames.splice(0, frames.length);
    now += 16;
    waiting.forEach((fn) => fn && fn(now));
  }
}

function makeCanvas() {
  const { ctx, calls } = recordingContext();
  return {
    calls,
    getContext: () => ctx,
    parentElement: { getBoundingClientRect: () => ({ width: 800, height: 400 }) },
    width: 0,
    height: 0,
  };
}

/* A scene that counts what the engine asks of it. */
function makeScene() {
  const seen = { layout: 0, reset: 0, still: 0, frame: 0, times: [] };
  return {
    seen,
    fade: 1,
    layout() { seen.layout += 1; },
    reset() { seen.reset += 1; },
    still(ctx, ink, t) { seen.still += 1; return t; },
    frame(ctx, dt, t) { seen.frame += 1; seen.times.push(t); },
  };
}

const { initFieldCanvas } = await import(new URL('../js/field-canvas.js', import.meta.url));

/* A field that runs. */
{
  const canvas = makeCanvas();
  const scene = makeScene();
  const field = initFieldCanvas(canvas, () => false, scene);
  ok('engine: it lays the scene out and draws one fixed frame at once',
     scene.seen.layout === 1 && scene.seen.reset === 1 && scene.seen.still === 1);
  ok('engine: the canvas takes the size of its parent', canvas.width === 800 && canvas.height === 400,
     canvas.width + 'x' + canvas.height);
  pump(3);
  ok('engine: the loop draws a frame for each tick', scene.seen.frame === 3, scene.seen.frame + ' frames');
  ok('engine: no step is longer than 0.05 s',
     scene.seen.times.every((t, i) => i === 0 || t - scene.seen.times[i - 1] <= 0.0501));

  const before = scene.seen.frame;
  field.setPaused(true);
  pump(3);
  ok('engine: a pause stops the loop and draws a fixed frame',
     scene.seen.frame === before && scene.seen.still === 2);
  const stillCount = scene.seen.still;
  field.repaint();
  ok('engine: a repaint while paused draws again', scene.seen.still === stillCount + 1);

  field.setPaused(false);
  pump(2);
  ok('engine: the loop runs again after the pause', scene.seen.frame > before, scene.seen.frame + ' frames');

  const running = scene.seen.frame;
  hidden = true;
  listeners.visibilitychange();
  pump(3);
  ok('engine: a tab behind another one runs no frame', scene.seen.frame === running);
  hidden = false;
  listeners.visibilitychange();
  pump(1);
  ok('engine: the tab in front runs again', scene.seen.frame > running);

  const onScreen = scene.seen.frame;
  observed.send(false);
  pump(3);
  ok('engine: a field off the screen runs no frame', scene.seen.frame === onScreen);
  observed.send(true);
  pump(1);
  ok('engine: a field back on the screen runs again', scene.seen.frame > onScreen);
}

/* A fixed frame: the loop must never run. */
{
  const canvas = makeCanvas();
  const scene = makeScene();
  initFieldCanvas(canvas, () => false, scene, { still: 12 });
  pump(3);
  ok('engine: a fixed frame runs no loop', scene.seen.frame === 0 && scene.seen.still === 1);
}

/* No canvas, or no scene: the engine gives nothing back. */
ok('engine: it gives null without a canvas', initFieldCanvas(null, () => false, makeScene()) === null);
ok('engine: it gives null without a scene', initFieldCanvas(makeCanvas(), () => false, null) === null);

console.log(failed ? `\n${failed} test(s) failed` : '\nevery test passed');
process.exit(failed ? 1 : 0);
