/* A series: the recent samples of a model, in the order they happened.

   Every model keeps one or more of these — the log of a force, the path
   of a craft, the times of the events, the shapes of a strobe. The
   series holds the samples, drops the ones that are too old or too many,
   and moves them when the clock goes back. It gives the drawing a way to
   read them, and no way to change them.

   A series keeps its samples for a time in seconds, or a fixed number of
   them. A sample is an object with a t, or a plain time. */

export function createSeries({ seconds = 0, keep = 0, timeOf = (item) => (typeof item === 'number' ? item : item.t) } = {}) {
  const items = [];

  return {
    /** Add a sample, and drop the ones the series does not keep. */
    push(item) {
      items.push(item);
      if (seconds > 0) {
        const now = timeOf(item);
        while (items.length && now - timeOf(items[0]) > seconds) items.shift();
      }
      if (keep > 0) {
        while (items.length > keep) items.shift();
      }
    },
    /** Move every sample back, when the clock goes back. */
    shiftTime(by) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (typeof item === 'number') items[i] = item - by;
        else item.t -= by;
      }
    },
    clear() { items.length = 0; },
    each(fn) { for (let i = 0; i < items.length; i++) fn(items[i], i); },
    /** The sample nearest to a time. */
    nearest(t) {
      if (!items.length) return null;
      let best = items[0];
      for (const item of items) {
        if (Math.abs(timeOf(item) - t) < Math.abs(timeOf(best) - t)) best = item;
      }
      return best;
    },
    at(i) { return items[i]; },
    get count() { return items.length; },
    get first() { return items[0]; },
    get last() { return items[items.length - 1]; },
  };
}
