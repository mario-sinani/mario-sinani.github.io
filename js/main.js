/* Entry point: composes the site's features. Modules receive their
   dependencies here instead of reaching into each other. */

import { initTheme } from './theme.js';

initTheme(() => {});
