/* The schedule of the Auto mode: a list of cases, each one held for
   the same time.

   A scene gives its list and the time of a case. The module gives the
   case that runs now, the one that follows, and the seconds left. The
   scene then writes its own sentence with those three. */

export function caseAt(clock, hold, cases) {
  const index = Math.floor(clock / hold) % cases.length;
  return {
    index,
    now: cases[index],
    next: cases[(index + 1) % cases.length],
    left: Math.ceil(hold - (clock % hold)),
  };
}
