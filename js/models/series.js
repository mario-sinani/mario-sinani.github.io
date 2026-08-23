/* Series: the recent samples of a model, in the order of their time.

   The series adds a sample, removes the samples that are too old or in
   excess of the count, and moves the times when the clock goes back. It
   gives read access only.

   A series holds its samples for a time in seconds, or holds a count of
   them. A sample is an object with a property t, or a time. */

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
    get last() { return items[items.length - 1]; },
  };
}
