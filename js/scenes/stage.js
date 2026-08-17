/* Stage: the position of a paper scene on the page.

   The text of the hero is a column at the centre, with a maximum width.
   A scene at a fraction of the viewport moves away from that column on
   a wide screen. This module holds the scene on the same column. The
   subject is on the left, and the instrument is on the right. The two
   items are in one band above the hero panel. The panel is at the centre in the
   vertical direction, and that band stays clear at each height. */

const CONTENT_WIDTH = 1060;   // matches --w-content
const COLUMN_PADDING = 24;    // matches the column's 1.5rem side padding
const BAND = 0.14;            // the band's height down the hero

export function stageFor(w, h) {
  const width = Math.min(w - COLUMN_PADDING * 2, CONTENT_WIDTH);
  const left = (w - width) / 2;
  return { left, right: left + width, width, y: h * BAND };
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
