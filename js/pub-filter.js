/* Publication filter: shows one type of publication at a time. CSS
   shows the controls only if JavaScript is available, and each entry
   stays on the page if no script runs.

   The filter corrects the two things CSS cannot, because CSS has no
   selector for the first visible element: the caps of the rail, and the
   reveal state of an entry that was hidden before it came into view.

   The choice goes in the address bar as ?type=journal, so a filtered
   list is a link the visitor can send or keep. The "all" state writes no
   parameter. */

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

  /** The type in the address bar, or "all" if the address bar gives no
      known type. */
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
      // An entry that was not visible before it came into view has no
      // reveal class. Add the class now, because the entry must not
      // come back invisible.
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

  // A visit that comes with ?type= starts with that filter. The first
  // write replaces the history entry. The back button then leaves the
  // page, and it does not give the same list again.
  const start = typeFromUrl();
  apply(start);
  writeUrl(start, true);
}
