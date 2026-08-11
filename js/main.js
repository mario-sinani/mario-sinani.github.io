/* Entry point: composes the site's features. Modules receive their
   dependencies here instead of reaching into each other. */

import { effectiveTheme, initTheme } from './theme.js';
import { initFlowField } from './flowfield.js';

const flow = initFlowField(
  document.getElementById('flowfield'),
  () => effectiveTheme() === 'dark'
);

initTheme(() => {
  if (flow) flow.repaint();
});
