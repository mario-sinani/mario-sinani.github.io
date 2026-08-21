/* Stage: the position of a paper scene on the page.

   The hero text is a centred column with a maximum width, and a scene
   at a fraction of the viewport moves away from it on a wide screen.
   This module holds the scene on the same column: the subject on the
   left, the instrument on the right, both in one band above the hero
   panel. */

const CONTENT_WIDTH = 1060;   // matches --w-content
const COLUMN_PADDING = 24;    // matches the column's 1.5rem side padding
/* How far down the box the subject sits. A hero puts the subject high,
   because the panel of the hero fills the rest. A page that shows the
   scene alone gives a larger band, and the subject then sits near the
   middle of its box. */
const BAND = 0.14;

export function stageFor(w, h, band = BAND) {
  const width = Math.min(w - COLUMN_PADDING * 2, CONTENT_WIDTH);
  const left = (w - width) / 2;
  return { left, right: left + width, width, y: h * band };
}

/* Draw the datum: one dashed thin line across the stage. Each scene
   uses it as its zero line: the freestream, the beam at rest, or the
   joint with no fold. The subject is on the datum, and the instrument
   starts from it. The datum joins the two drawings. */
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
