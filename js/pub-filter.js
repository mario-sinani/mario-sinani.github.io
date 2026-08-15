/* Publication filter: shows one publication type at a time.

   CSS shows the controls only when JavaScript is available. Without it,
   every entry stays on the page.

   The filter repairs two things that CSS cannot: CSS has no selector for
   "the first visible element". The two are the rail caps at the top and
   the bottom of the list, and the reveal state of an entry that was
   hidden before it scrolled into view.

   The choice goes in the address bar as ?type=journal. A filtered list is
   then a link the visitor can send or keep, and the back button returns
   to the list they saw before. The "all" state writes no parameter, so
   the plain address stays the plain address. */

const ALL = 'all';
const PARAM = 'type';

export function initPubFilter() {
  const bar = document.getElementById('pub-filter');
  const list = document.getElementById('pub-list');
  if (!bar || !list) return;

  const buttons = Array.from(bar.querySelectorAll('[data-filter]'));
  const entries = Array.from(list.querySelectorAll('.pub'));
  const count = document.getElementById('pub-count');
  const types = new Set(buttons.map((button) => button.dataset.filter));

  /** The type in the address bar, or "all" if it names no known type. */
  function typeFromUrl() {
    const asked = new URLSearchParams(location.search).get(PARAM);
    return types.has(asked) ? asked : ALL;
  }

  function writeUrl(type, replace) {
    const url = new URL(location.href);
    if (type === ALL) url.searchParams.delete(PARAM);
    else url.searchParams.set(PARAM, type);
    if (url.href === location.href) return;
    history[replace ? 'replaceState' : 'pushState']({ [PARAM]: type }, '', url);
  }

  function apply(type) {
    const visible = [];

    entries.forEach((entry) => {
      const shown = type === ALL || entry.dataset.type === type;
      entry.hidden = !shown;
      entry.classList.remove('rail-start', 'rail-end');
      // An entry hidden before it scrolled into view has no reveal
      // class. Add it now, so the entry does not return invisible.
      if (shown) {
        entry.classList.add('in');
        visible.push(entry);
      }
    });

    if (visible.length) {
      visible[0].classList.add('rail-start');
      visible[visible.length - 1].classList.add('rail-end');
    }

    if (count) {
      count.textContent = `${visible.length} ${visible.length === 1 ? 'entry' : 'entries'}`;
    }

    buttons.forEach((button) => {
      const current = button.dataset.filter === type;
      button.setAttribute('aria-pressed', String(current));
    });
  }

  bar.addEventListener('click', (event) => {
    const button = event.target.closest('[data-filter]');
    if (!button) return;
    apply(button.dataset.filter);
    writeUrl(button.dataset.filter, false);
  });

  // The back and forward buttons move through the choices.
  window.addEventListener('popstate', () => apply(typeFromUrl()));

  // A visit that arrives with ?type= starts on that filter. The first
  // write replaces the entry, so back leaves the page instead of
  // returning to the same list.
  const start = typeFromUrl();
  apply(start);
  writeUrl(start, true);
}
