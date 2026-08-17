/* Abstracts: limit each abstract to three lines and add a toggle
   button. A long list is then easy to read quickly. This is most
   important on a phone, where one abstract fills the screen.

   A CSS rule sets the limit, and that rule needs the js class. If this
   module does not run, each abstract shows in full. An abstract that
   fits in three lines gets no toggle button. The module waits for the
   web fonts before it measures, because a substitute font gives the
   wrong height. */

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

      // Show the toggle button only if the text is higher than the
      // limit.
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
