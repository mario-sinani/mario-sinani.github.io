/* The fingerprint of each scene: the drawing it makes and the numbers
   it reports.

   Run it with --write to record the fingerprints in golden.json, and
   with no argument to compare the code against that record. A refactor
   that changes no behaviour gives the same fingerprint.

   A fingerprint holds the hash of the drawing, the count of each kind of
   call, the numbers of probe() and the line of the lab. A change of
   behaviour therefore shows in the file as more arcs or fewer lines, and
   not as one hash that says nothing. */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { recordingContext, INK, seedRandom } from './canvas-stub.mjs';

const ROOT = new URL('../js/', import.meta.url);
const GOLDEN = new URL('./golden.json', import.meta.url);

const SCENES = [
  ['pazy-step', 'createPazyStep', 29.5],
  ['pazy-flutter', 'createPazyFlutter', 19],
  ['hinged-wingtip', 'createHingedWingtip', 4],
  ['beam-modes', 'createBeamModes', 46],
  ['event-tracking', 'createEventTracking', 22],
  ['image-servo', 'createImageServo', 9.8],
  ['vortex-street', 'createVortexStreet', 8],
  ['lifting-cylinder', 'createLiftingCylinder', 8],
];

const FRAMES = 90;
const DT = 1 / 60;

async function fingerprint(file, factory, still) {
  seedRandom();
  const module = await import(new URL('scenes/' + file + '.js', ROOT));
  const scene = module[factory]();
  const { ctx, calls } = recordingContext();
  scene.layout(1000, 560, { band: 0.42, scale: 1.3 });
  if (scene.reset) scene.reset();
  const shown = scene.still(ctx, INK, still);
  let clock = typeof shown === 'number' && shown > still ? shown : still;
  for (let i = 0; i < FRAMES; i += 1) {
    clock += DT;
    scene.frame(ctx, DT, clock, INK);
  }
  const probe = scene.probe ? scene.probe() : null;
  const status = scene.lab ? scene.lab.status(true, scene.lab.value()) : null;
  /* The count of each kind of call. A hash says only that a drawing
     changed; these numbers say what changed in it. */
  const shape = {};
  for (const call of calls) {
    const name = call.split(' ')[0];
    shape[name] = (shape[name] || 0) + 1;
  }
  return {
    calls: calls.length,
    drawing: createHash('sha256').update(calls.join('\n')).digest('hex').slice(0, 16),
    shape: Object.fromEntries(Object.entries(shape).sort((a, b) => b[1] - a[1])),
    probe: probe && JSON.parse(JSON.stringify(probe, (k, v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v))),
    status,
  };
}

const now = {};
for (const [file, factory, still] of SCENES) {
  now[file] = await fingerprint(file, factory, still);
}

if (process.argv.includes('--write')) {
  writeFileSync(GOLDEN, JSON.stringify(now, null, 2) + '\n');
  console.log('wrote', GOLDEN.pathname);
  for (const [name, f] of Object.entries(now)) console.log('  %s  %d calls  %s', name.padEnd(18), f.calls, f.drawing);
} else {
  const before = JSON.parse(readFileSync(GOLDEN, 'utf8'));
  let bad = 0;
  for (const [name, f] of Object.entries(now)) {
    const b = before[name];
    const same = b && JSON.stringify(b) === JSON.stringify(f);
    if (!same) bad += 1;
    console.log('%s %s  %d calls  %s', same ? 'same    ' : 'CHANGED ', name.padEnd(18), f.calls, f.drawing);
    if (!same && b) {
      if (b.drawing !== f.drawing) {
        console.log('         drawing %s -> %s (%d -> %d calls)', b.drawing, f.drawing, b.calls, f.calls);
        const kinds = new Set([...Object.keys(b.shape || {}), ...Object.keys(f.shape || {})]);
        for (const kind of kinds) {
          const was = (b.shape || {})[kind] || 0;
          const now = (f.shape || {})[kind] || 0;
          if (was !== now) console.log('         %s %d -> %d', kind.padEnd(18), was, now);
        }
      }
      if (JSON.stringify(b.probe) !== JSON.stringify(f.probe)) console.log('         probe %s -> %s', JSON.stringify(b.probe), JSON.stringify(f.probe));
      if (b.status !== f.status) console.log('         status changed');
    }
  }
  process.exit(bad ? 1 : 0);
}
