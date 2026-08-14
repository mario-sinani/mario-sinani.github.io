/* Scene: a clamped-free beam vibrating in its first three modes, with the
   energy sloshing between them and a bound sitting over the total.

   Behind "Capturing & Bounding Nonlinear Modal Energy Transfer for
   Geometrically Exact Beams using Semidefinite Programming".

   The mode shapes are the real ones - the clamped-free eigenfunctions,
   with the usual roots of cos(bL)cosh(bL) = -1 - and the frequencies keep
   their true ratios, which is why the third mode blurs while the first is
   still swinging. What the paper adds is the bar at the right: a rigorous
   bound on the energy a chosen set of modes can hold, which is drawn as
   the line the bars are measured against. The trail the beam leaves is
   just the canvas fading, so the envelope draws itself. */

const TWO_PI = 6.2832;

// Roots of cos(bL)cosh(bL) = -1, and the frequency of each mode goes as
// the square of its root.
const ROOTS = [1.8751, 4.6941, 7.8548];
const SLOSH_SECONDS = 14;       // period of the energy exchange
const BASE_HZ = 0.09;           // first mode; the rest follow the ratios
const SAMPLES = 90;

function sigmaFor(bL) {
  return (Math.cosh(bL) + Math.cos(bL)) / (Math.sinh(bL) + Math.sin(bL));
}

/** Clamped-free mode shape, normalised so its largest value is one. */
function modeShape(bL, sigma, xi) {
  const b = bL * xi;
  const raw = Math.cosh(b) - Math.cos(b) - sigma * (Math.sinh(b) - Math.sin(b));
  const tip = Math.cosh(bL) - Math.cos(bL) - sigma * (Math.sinh(bL) - Math.sin(bL));
  return raw / tip;
}

/* Every paper scene sits in this band down from the top of the hero: the
   panel below is vertically centred, so this strip stays clear of the
   words at every viewport height. */
const BAND = 0.14;

export function createBeamModes() {
  const modes = ROOTS.map((bL, i) => {
    const sigma = sigmaFor(bL);
    return {
      bL,
      sigma,
      omega: TWO_PI * BASE_HZ * ((bL * bL) / (ROOTS[0] * ROOTS[0])),
      // Higher modes carry the same energy in less displacement.
      reach: 1 / (i + 1) ** 1.6,
      energy: 0,
    };
  });

  const beam = { x: 0, y: 0, length: 200, amplitude: 30 };
  const bars = { x: 0, y: 0, w: 0, gap: 0, height: 0 };

  /* Energy moves between modes and back; the three shares are normalised
     every frame, so the total is conserved exactly. */
  function slosh(t) {
    const phase = (TWO_PI * t) / SLOSH_SECONDS;
    let sum = 0;
    for (let i = 0; i < modes.length; i++) {
      const raw = 0.35 + 0.3 * Math.sin(phase + i * 2.1) + 0.2 / (i + 1);
      modes[i].energy = Math.max(raw, 0.02);
      sum += modes[i].energy;
    }
    for (let i = 0; i < modes.length; i++) modes[i].energy /= sum;
  }

  function deflection(xi, t) {
    let w = 0;
    for (let i = 0; i < modes.length; i++) {
      const m = modes[i];
      w += Math.sqrt(m.energy) * m.reach * modeShape(m.bL, m.sigma, xi) * Math.sin(m.omega * t);
    }
    return w;
  }

  function drawBeam(ctx, t, ink) {
    ctx.beginPath();
    for (let i = 0; i <= SAMPLES; i++) {
      const xi = i / SAMPLES;
      const x = beam.x + xi * beam.length;
      const y = beam.y + deflection(xi, t) * beam.amplitude;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = ink.body;
    ctx.stroke();

    // The clamp: a short upright at the root, so which end is fixed reads
    // at a glance.
    ctx.beginPath();
    ctx.moveTo(beam.x, beam.y - beam.amplitude * 0.5);
    ctx.lineTo(beam.x, beam.y + beam.amplitude * 0.5);
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = ink.accent;
    ctx.stroke();
  }

  function drawEnergy(ctx, ink) {
    if (bars.w <= 0) return;
    for (let i = 0; i < modes.length; i++) {
      const y = bars.y + i * bars.gap;
      ctx.beginPath();
      ctx.moveTo(bars.x, y);
      ctx.lineTo(bars.x + bars.w, y);
      ctx.lineWidth = 1;
      ctx.strokeStyle = ink.faint;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(bars.x, y);
      ctx.lineTo(bars.x + bars.w * modes[i].energy, y);
      ctx.lineWidth = 3.2;
      ctx.strokeStyle = i === 0 ? ink.accent : ink.body;
      ctx.stroke();
    }

    // The bound: the line the shares are measured against.
    const boundX = bars.x + bars.w * 0.62;
    ctx.beginPath();
    ctx.setLineDash([3, 3]);
    ctx.moveTo(boundX, bars.y - bars.gap * 0.6);
    ctx.lineTo(boundX, bars.y + bars.gap * (modes.length - 0.4));
    ctx.lineWidth = 1;
    ctx.strokeStyle = ink.line;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  return {
    fade: 0.055,

    layout(w, h) {
      beam.length = Math.min(w * 0.42, 620);
      beam.x = w * 0.08;
      beam.y = h * BAND;
      beam.amplitude = Math.min(h * 0.075, 52);

      const room = w > 700;
      bars.w = room ? Math.min(w * 0.12, 160) : 0;
      bars.x = w * 0.78;
      bars.gap = Math.max(h * 0.028, 12);
      bars.y = h * BAND - bars.gap;
    },

    frame(ctx, dt, t, ink) {
      slosh(t);
      drawBeam(ctx, t, ink);
      drawEnergy(ctx, ink);
    },

    still(ctx, ink, t) {
      const at = t || 2.6;
      slosh(at);
      drawBeam(ctx, at, ink);
      drawEnergy(ctx, ink);
    },
  };
}
