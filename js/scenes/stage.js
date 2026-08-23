/* Stage: the position of a paper scene on the page. The hero text is a
   centred column, so the scene stays on that column: the subject on the
   left, the instrument on the right, in one band above the panel. */

const CONTENT_WIDTH = 1060;   // matches --w-content
const COLUMN_PADDING = 24;    // matches the column's 1.5rem side padding
/* How far down the box the subject sits. A hero puts it high, because the
   panel fills the rest. A page that shows the scene alone gives a larger
   band. */
const BAND = 0.14;

/* The stage for the fit that the engine gives. A preview shows the top of
   the box only, so the scene gives the band to use there. A page that
   shows the scene alone gives its band in the fit. */
export function stageForFit(w, h, fit, { preview: previewBand, band, rise = 0 }) {
  if (fit.preview) return stageFor(w, h, previewBand);
  if (band !== undefined) return stageFor(w, h, (fit.band ?? band) + rise);
  return stageFor(w, h, fit.band);
}

export function stageFor(w, h, band = BAND) {
  const width = Math.min(w - COLUMN_PADDING * 2, CONTENT_WIDTH);
  const left = (w - width) / 2;
  return { left, right: left + width, width, y: h * band };
}

/* The datum: one dashed line across the stage. Each scene uses it as its
   zero: the freestream, the beam at rest, or the joint with no fold. It
   joins the two drawings. */
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
