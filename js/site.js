/* Site composition: the features every page carries. Pages call this and
   then add whatever is theirs alone, so the shared wiring lives in exactly
   one place and a new page cannot forget half of it. */

import { initTheme } from './theme.js';
import { initReveal } from './reveal.js';
import { initEmail } from './email.js';
import { initNav } from './nav.js';

/**
 * @param {() => void} [onThemeChange] Runs after the palette changes, for
 *   anything a page paints itself from the current theme colours.
 */
export function initSite(onThemeChange = () => {}) {
  initTheme(onThemeChange);
  initReveal();
  initEmail();
  initNav();
}
