/* Publication filter: shows one publication type at a time.

   CSS shows the controls only when JavaScript is available. Without it,
   every entry stays on the page.

   The filter repairs two things that CSS cannot: CSS has no selector for
   "the first visible element". The two are the rail caps at the top and
   the bottom of the list, and the reveal state of an entry that was
   hidden before it scrolled into view. */

const ALL = 'all';

export function initPubFilter() {
  const bar = document.getElementById('pub-filter');
  const list = document.getElementById('pub-list');
  if (!bar || !list) return;

  const buttons = Array.from(bar.querySelectorAll('[data-filter]'));
  const entries = Array.from(list.querySelectorAll('.pub'));
  const count = document.getElementById('pub-count');

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
    if (button) apply(button.dataset.filter);
  });

  apply(ALL);
}
