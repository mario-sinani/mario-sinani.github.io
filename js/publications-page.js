/* Entry point for the publications page: the shared features, and the ones
   only this page has. */

import { initSite } from './site.js';
import { initPubFilter } from './pub-filter.js';
import { initAbstracts } from './abstract.js';
import { initCite, initCiteFormats, copyText } from './cite.js';

initSite();
initPubFilter();
initAbstracts();
initCite();
initCiteFormats();

/* Copy all: one click puts every BibTeX record on the clipboard. The
   download link beside it is a plain file and needs no script. */
const RESET_DELAY = 1800;
const copyAll = document.getElementById('copy-all-bib');
if (copyAll) {
  const label = copyAll.querySelector('[role="status"]');
  const idle = label ? label.textContent : '';
  let timer = 0;
  copyAll.addEventListener('click', async () => {
    const records = Array.from(document.querySelectorAll('pre[id^="bib-"] code'))
      .map((code) => code.textContent.trim());
    try {
      await copyText(records.join('\n\n') + '\n');
    } catch (e) {
      if (label) label.textContent = 'Press Ctrl+C';
      return;
    }
    if (!label) return;
    label.textContent = 'Copied';
    clearTimeout(timer);
    timer = setTimeout(() => { label.textContent = idle; }, RESET_DELAY);
  });
}
