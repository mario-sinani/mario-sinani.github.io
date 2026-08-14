/* Entry point for an individual paper page: the shared site features, the
   paper's own animated field and the citation copy button.

   Every paper page uses this same entry point; the field it animates is
   chosen by which canvas the page carries. */

import { effectiveTheme } from './theme.js';
import { initAeroelasticField } from './aeroelastic-field.js';
import { initSite } from './site.js';
import { initCite } from './cite.js';

const field = initAeroelasticField(
  document.getElementById('aerofield'),
  () => effectiveTheme() === 'dark'
);

initSite(() => {
  if (field) field.repaint();
});

initCite();
