/* Stage: where a paper scene sits on the page.

   The hero text is a centred column with a maximum width. A scene placed
   by viewport fractions drifts from that column on wide screens. This
   module anchors the scene to the same column: subject on the left,
   instrument on the right, both in one band above the hero panel. The
   panel's vertical centring keeps that band clear at every height. */

const CONTENT_WIDTH = 1060;   // matches --w-content
const COLUMN_PADDING = 24;    // matches the column's 1.5rem side padding
const BAND = 0.14;            // the band's height down the hero

export function stageFor(w, h) {
  const width = Math.min(w - COLUMN_PADDING * 2, CONTENT_WIDTH);
  const left = (w - width) / 2;
  return { left, right: left + width, width, y: h * BAND };
}

/* Draw the datum: one dashed hairline across the stage. Each scene uses
   it as its zero line: the freestream, the beam at rest, or the joint
   with no fold. The subject sits on the datum and the instrument
   measures from it. The datum joins the two drawings. */
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
