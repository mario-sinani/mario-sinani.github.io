/* Stage: where a paper scene sits relative to the page.

   The hero's text is a centred column capped at the site's content width;
   a scene positioned by viewport fractions drifts away from that column on
   wide screens and its pieces stop reading as one drawing. Anchoring to
   the same column keeps the subject on the left of the words below, the
   instrument on their right, and the whole band symmetric to the layout.

   Every scene occupies one band above the hero panel - the strip its
   vertical centring leaves clear at every viewport height. */

const CONTENT_WIDTH = 1060;   // matches --w-content
const COLUMN_PADDING = 24;    // matches the column's 1.5rem side padding
const BAND = 0.14;            // the band's height down the hero

export function stageFor(w, h) {
  const width = Math.min(w - COLUMN_PADDING * 2, CONTENT_WIDTH);
  const left = (w - width) / 2;
  return { left, right: left + width, width, y: h * BAND };
}

/* The datum: one hairline across the whole stage, which each scene reads
   as its own zero - the freestream's line, the beam at rest, the joint
   unfolded. The subject sits on it and the instrument measures from it,
   which is what makes two separate drawings read as one scene. */
export function drawDatum(ctx, stage, ink) {
  ctx.beginPath();
  ctx.setLineDash([3, 4]);
  ctx.moveTo(stage.left, stage.y);
  ctx.lineTo(stage.right, stage.y);
  ctx.lineWidth = 1;
  ctx.strokeStyle = ink.faint;
  ctx.stroke();
  ctx.setLineDash([]);
}
