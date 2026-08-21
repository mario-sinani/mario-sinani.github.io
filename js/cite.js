/* Cite: copies a BibTeX record to the clipboard. The record is in a
   <details> element, which opens without a script. CSS hides the copy
   button until the js class is on the page. */

const RESET_DELAY = 1800;

export async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  // A hidden textarea is the fallback for an http:// origin and an old
  // browser.
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
    const label = button.querySelector('.copy-label');
    const idle = label ? label.textContent : '';
    let timer = 0;

    button.addEventListener('click', async () => {
      /* Read the target at the click: the format tabs can point the button
         at an other record. */
      const source = document.getElementById(button.dataset.copy);
      if (!source) return;
      try {
        await copyText(source.textContent.trim());
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

/* Format tabs: one citation in more than one style. A tab shows its record
   and points the copy button at it. Without a script only BibTeX shows. */
export function initCiteFormats() {
  document.querySelectorAll('.cite-tabs').forEach((tabs) => {
    const body = tabs.closest('.cite-body');
    const button = body ? body.querySelector('.copy-btn') : null;

    tabs.addEventListener('click', (event) => {
      const tab = event.target.closest('[data-format]');
      if (!tab) return;
      tabs.querySelectorAll('[data-format]').forEach((other) => {
        const active = other === tab;
        other.setAttribute('aria-pressed', String(active));
        const record = document.getElementById(other.dataset.format);
        if (record) record.hidden = !active;
      });
      if (button) button.dataset.copy = tab.dataset.format;
    });
  });
}
