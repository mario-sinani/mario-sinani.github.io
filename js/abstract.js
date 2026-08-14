/* Abstracts: clamp each abstract to three lines and add a toggle, so a
   long list stays easy to scan. This is most important on a phone, where
   one abstract fills the screen.

   The clamp is a CSS rule that needs the js class. Without this module
   each abstract shows in full. An abstract that fits without a clamp
   loses its toggle. The measurement waits for the webfonts, because the
   fallback face gives the wrong height. */

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

      // Show the toggle only if the text overflows the clamp.
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
