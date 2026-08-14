/* Publication filter: narrows the list to one publication type.

   The controls are revealed by CSS only when JavaScript is present, so
   without it every entry simply stays on the page.

   Filtering breaks two things the rail relies on, and both are repaired
   here rather than in CSS, which cannot address "the first still-visible
   element": the line caps at the top and bottom of the rail, and the
   scroll-reveal state of entries that were hidden before they were ever
   scrolled past. */

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
      // An entry hidden before it ever scrolled into view never got its
      // reveal class; grant it now so it does not return invisible.
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
