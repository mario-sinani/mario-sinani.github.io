/* Cite: copies a BibTeX record to the clipboard.

   The citation itself sits in a <details> block, so it opens and can be
   selected by hand with no JavaScript at all. This module only adds the
   convenience of the copy button, which CSS keeps hidden until the `js`
   class says it will work. */

const RESET_DELAY = 1800;

async function copy(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  // http:// origins and older browsers: fall back to a detached textarea.
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
