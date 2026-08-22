/* The tests of the models: each scene must answer as its paper does.

   The tests drive a scene with its own frame loop and read probe(). No
   browser runs, because the drawing goes to the stub context. */

import { recordingContext, INK } from './canvas-stub.mjs';

const ROOT = new URL('../js/scenes/', import.meta.url);
const DT = 1 / 60;
let failed = 0;

function check(name, got, want, tolerance) {
  const ok = tolerance === undefined ? got === want : Math.abs(got - want) <= tolerance;
  console.log(`${ok ? 'pass' : 'FAIL'}  ${name.padEnd(58)} ${tolerance === undefined ? got : got.toFixed(3)}`);
  if (!ok) { failed += 1; console.log('       wanted %s%s', want, tolerance === undefined ? '' : ' +/- ' + tolerance); }
}

function ok(name, condition, detail) {
  console.log(`${condition ? 'pass' : 'FAIL'}  ${name.padEnd(58)} ${detail === undefined ? '' : detail}`);
  if (!condition) failed += 1;
}

async function scene(file, factory, hold) {
  const module = await import(new URL(file + '.js', ROOT));
  const s = module[factory]();
  const { ctx } = recordingContext();
  s.layout(1000, 560, { band: 0.42, scale: 1.3 });
  if (hold !== undefined && s.lab) s.lab.set(hold);
  s.still(ctx, INK, 0);
  return {
    s,
    run(seconds) {
      let t = 0;
      for (let i = 0; i < Math.round(seconds / DT); i += 1) { t += DT; s.frame(ctx, DT, t, INK); }
      return s.probe();
    },
  };
}

/* The Pazy wing under a step: the tip rises, and the nonlinear force
   stays below the linear one, as the paper reports. */
{
  const { run } = await scene('pazy-step', 'createPazyStep', 8);
  const p = run(6);
  check('pazy-step: the tip rises at 8 degrees, in spans', p.tipRise, 0.45, 0.06);
  ok('pazy-step: the force stays below the linear line',
     p.steadyForce < p.linearForce, p.steadyForce.toFixed(3) + ' < ' + p.linearForce.toFixed(3));
}

/* The flutter band of the paper: growth from 3 to 4.6 degrees, decay
   outside it. */
{
  for (const [alpha, grows] of [[1.75, false], [4, true], [5, false], [7.5, false]]) {
    const { s, run } = await scene('pazy-flutter', 'createPazyFlutter', alpha);
    const envelope = (seconds) => {
      let peak = 0;
      for (let i = 0; i < seconds; i += 0.1) peak = Math.max(peak, Math.abs(run(0.1).q2));
      return peak;
    };
    const first = envelope(2);
    const later = envelope(6);
    ok('pazy-flutter: ' + alpha + ' degrees ' + (grows ? 'grows' : 'decays'),
       grows ? later > first * 1.3 : later < first,
       (later / first).toFixed(2) + ' times in 6 s');
    ok('pazy-flutter: the growth rate at ' + alpha + ' degrees has the sign of the band',
       grows ? s.probe().growth > 0 : s.probe().growth <= 0, s.probe().growth.toFixed(2) + ' 1/s');
  }
}

/* The flared hinge: the tip settles where its own lift carries it, at
   the angles of the paper's Fig. 18. */
{
  const { run: paperCase } = await scene('hinged-wingtip', 'createHingedWingtip', 10);
  check('hinged-wingtip: the flare of the paper settles the fold at 45 degrees', paperCase(6.5).fold, 45, 3);
  const folds = [];
  for (const flare of [5, 10, 20, 30]) {
    const { run } = await scene('hinged-wingtip', 'createHingedWingtip', flare);
    folds.push(run(6.5).fold);
  }
  ok('hinged-wingtip: more flare gives a smaller fold',
     folds.every((f, i) => i === 0 || f < folds[i - 1]), folds.map((f) => f.toFixed(1)).join(' > '));
}

/* The beam: the two modes exchange energy, the sum stays constant, and
   the average share of the bending stays under the bound. */
{
  const { run } = await scene('beam-modes', 'createBeamModes', 40);
  const start = run(0.5);
  const late = run(25);
  check('beam-modes: the energy of the two modes is constant', late.energy, start.energy, 0.02);
  ok('beam-modes: the modes exchange energy', Math.abs(late.share - start.share) > 0.02,
     start.share.toFixed(3) + ' -> ' + late.share.toFixed(3));
  ok('beam-modes: the average share stays under the bound', late.mean <= late.bound,
     late.mean.toFixed(3) + ' <= ' + late.bound.toFixed(3));
}

/* The event-triggered plan: a shorter horizon gives more plans. */
{
  const rate = async (horizon) => {
    const { run } = await scene('event-tracking', 'createEventTracking', horizon);
    const p = run(30);
    return p.events / 30;
  };
  const slow = await rate(2);
  const fast = await rate(0.4);
  ok('event-tracking: a short horizon gives more plans', fast > slow,
     slow.toFixed(2) + ' -> ' + fast.toFixed(2) + ' plans per second');
}

/* The image servo: more noise in the tracking gives more solutions,
   and the features stay near their desired positions. */
{
  const rate = async (noise) => {
    const { run } = await scene('image-servo', 'createImageServo', noise);
    const p = run(30);
    return { perSecond: p.events / 30, error: p.error };
  };
  const quiet = await rate(0);
  const loud = await rate(4);
  ok('image-servo: more noise gives more solutions', loud.perSecond > quiet.perSecond,
     quiet.perSecond.toFixed(2) + ' -> ' + loud.perSecond.toFixed(2) + ' per second');
  ok('image-servo: the features stay near the desired ones', loud.error < 40,
     loud.error.toFixed(1) + ' px');
}

console.log(failed ? `\n${failed} test(s) failed` : '\nevery test passed');
process.exit(failed ? 1 : 0);
