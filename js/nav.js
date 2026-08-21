/* Navigation: operates the menu on a small screen. Without this module the
   links stay visible. */

const DESKTOP = '(min-width: 841px)';

export function initNav() {
  const toggle = document.getElementById('nav-toggle');
  const links = document.getElementById('nav-links');
  if (!toggle || !links) return;

  const isOpen = () => toggle.getAttribute('aria-expanded') === 'true';

  function setOpen(open) {
    toggle.setAttribute('aria-expanded', String(open));
    links.classList.toggle('is-open', open);
  }

  toggle.addEventListener('click', () => setOpen(!isOpen()));

  // Close the menu after a move to a section.
  links.addEventListener('click', (event) => {
    if (event.target.closest('a')) setOpen(false);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !isOpen()) return;
    setOpen(false);
    toggle.focus();
  });

  // Close the menu on a tap outside the header.
  document.addEventListener('click', (event) => {
    if (isOpen() && !event.target.closest('.site-nav')) setOpen(false);
  });

  // Above the breakpoint the links go back to one row. Remove the open
  // state, or the menu stays open when the width becomes narrow again.
  window.matchMedia(DESKTOP).addEventListener('change', (event) => {
    if (event.matches) setOpen(false);
  });
}
