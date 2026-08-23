/* Swell: the crests of the sea between deep water and a coast.

   A crest moves toward the coast. Three effects change it on the way:

     shoaling      the wave speed falls with the depth, so the crests
                   come closer together near the shore
     refraction    the crest turns until it is parallel to the coast
     breaking      the crest fades at the shore

   The module gives the state of each crest. Each scene draws that state
   in its own geometry. */

const TWO_PI = Math.PI * 2;
const SHOAL = 1.5;              // the exponent that slows and bunches a crest
const RIPPLE = 0.06;            // the undulation of a crest, in reaches
const RIPPLE_RATE = 0.55;       // radians a second, along the crest

export const CRESTS = 6;        // the crests the sea holds at one time

/**
 * The crests of this moment, from the one at the shore to the one far out.
 *
 * clock   - the time of the scene, in seconds
 * period  - the seconds a crest takes to come in
 * reach   - how far out the sea starts, in pixels
 */
export function crestsAt(clock, period, reach, count = CRESTS) {
  const out = [];
  for (let k = 0; k < count; k++) {
    const phase = 1 - (((clock / period) + k / count) % 1);
    out.push({
      phase,
      /** How far the crest still is from the coast, in pixels. */
      drop: reach * Math.pow(phase, SHOAL),
      /** The crest fades in far out, and away as it breaks. */
      fade: Math.sin(Math.PI * phase),
      /** 1 in deep water, where the crest is straight; 0 at the coast,
          where refraction has turned it parallel to the shore. */
      deep: phase,
      seed: k,
    });
  }
  return out;
}

/** The undulation of one crest at a point along it, in pixels. */
export function ripple(crest, along, clock, reach, wavelength) {
  return RIPPLE * reach * crest.deep
    * Math.sin((TWO_PI * along) / wavelength + clock * RIPPLE_RATE + crest.seed * 1.7);
}
