/* Entry point for the home page: the shared site features plus the hero
   flow field, which exists only here. Modules receive their dependencies
   here instead of reaching into each other. */

import { effectiveTheme } from './theme.js';
import { initFlowField } from './flowfield.js';
import { initSite } from './site.js';

const flow = initFlowField(
  document.getElementById('flowfield'),
  () => effectiveTheme() === 'dark'
);

initSite(() => {
  if (flow) flow.repaint();
});
