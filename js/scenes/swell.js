/* The swell: the crests of the sea, as they come in toward a coast.

   A crest starts far out, where the water is deep, and moves in. Three
   things happen to it on the way, and the scenes draw all three:

     it slows and bunches   in shallow water a wave is slower, so the
                            crests come closer together near the shore
     it turns to the coast  refraction bends a crest until it is parallel
                            to the shore, so a straight crest of the deep
                            water takes the shape of the coast
     it breaks              the crest fades as it arrives, and the line of
                            the coast stays the only hard edge

   The scene gives the clock and the room the sea has; this module gives
   the state of each crest, and the scene draws it in its own geometry. */

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
