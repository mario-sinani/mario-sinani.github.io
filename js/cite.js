/* Cite: copies a BibTeX record to the clipboard.

   The record sits in a <details> block. It opens, and the visitor can
   select it by hand, with no JavaScript. This module adds the copy
   button. CSS keeps that button hidden until the js class is present. */

const RESET_DELAY = 1800;

async function copy(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  // Fallback for http:// origins and older browsers: a hidden textarea.
  const scratch = document.createElement('textarea');
  scratch.value = text;
  scratch.setAttribute('readonly', '');
  scratch.style.position = 'fixed';
  scratch.style.opacity = '0';
  document.body.appendChild(scratch);
  scratch.select();
  document.execCommand('copy');
  document.body.removeChild(scratch);
}

export function initCite() {
  document.querySelectorAll('[data-copy]').forEach((button) => {
    const source = document.getElementById(button.dataset.copy);
    if (!source) return;

    const label = button.querySelector('.copy-label');
    const idle = label ? label.textContent : '';
    let timer = 0;

    button.addEventListener('click', async () => {
      try {
        await copy(source.textContent.trim());
      } catch (e) {
        if (label) label.textContent = 'Press Ctrl+C';
        return;
      }
      if (!label) return;
      label.textContent = 'Copied';
      button.classList.add('is-copied');
      clearTimeout(timer);
      timer = setTimeout(() => {
        label.textContent = idle;
        button.classList.remove('is-copied');
      }, RESET_DELAY);
    });
  });
}
