/* Navigation: drives the small-screen menu disclosure. The button itself is
   revealed by CSS only when JavaScript is present, so the links stay visible
   and usable if this module never runs. */

const DESKTOP = '(min-width: 761px)';

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

  // Jumping to a section should leave the menu closed behind it.
  links.addEventListener('click', (event) => {
    if (event.target.closest('a')) setOpen(false);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !isOpen()) return;
    setOpen(false);
    toggle.focus();
  });

  // A tap anywhere outside the header dismisses the menu.
  document.addEventListener('click', (event) => {
    if (isOpen() && !event.target.closest('.site-nav')) setOpen(false);
  });

  // Widening past the breakpoint restores the inline row; drop the open
  // state so returning to a narrow width starts closed.
  window.matchMedia(DESKTOP).addEventListener('change', (event) => {
    if (event.matches) setOpen(false);
  });
}
