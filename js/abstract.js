/* Abstracts: clamps each abstract to a few lines behind a toggle, so a long
   list stays scannable - most of all on a phone, where one abstract fills
   the screen.

   The clamp itself is a CSS rule gated on the `js` class, so without this
   module every abstract simply renders in full. An abstract short enough to
   fit unclamped loses its toggle, which is why the measurement waits for the
   webfonts: measuring against the fallback face reports the wrong height. */

const CLAMP_CLASS = 'is-clamped';

function fontsReady() {
  return document.fonts && document.fonts.ready
    ? document.fonts.ready
    : Promise.resolve();
}

export function initAbstracts() {
  const blocks = Array.from(document.querySelectorAll('.pub-abstract'));
  if (!blocks.length) return;

  fontsReady().then(() => {
    blocks.forEach((block) => {
      const text = block.querySelector('p');
      const toggle = block.querySelector('.abstract-toggle');
      if (!text || !toggle) return;

      // Overflowing is what makes the toggle worth showing at all.
      if (text.scrollHeight <= text.clientHeight + 1) {
        block.classList.remove(CLAMP_CLASS);
        toggle.hidden = true;
        return;
      }

      const more = toggle.dataset.more || 'Show more';
      const less = toggle.dataset.less || 'Show less';

      toggle.addEventListener('click', () => {
        const clamped = block.classList.toggle(CLAMP_CLASS);
        toggle.setAttribute('aria-expanded', String(!clamped));
        toggle.textContent = clamped ? more : less;
      });
    });
  });
}
