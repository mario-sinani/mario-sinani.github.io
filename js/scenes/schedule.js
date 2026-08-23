/* Schedule of the Auto mode: a list of cases, each one held for the same
   time. caseAt gives the case of this moment, the case that follows, and
   the seconds that are left. */

export function caseAt(clock, hold, cases) {
  const index = Math.floor(clock / hold) % cases.length;
  return {
    index,
    now: cases[index],
    next: cases[(index + 1) % cases.length],
    left: Math.ceil(hold - (clock % hold)),
  };
}
