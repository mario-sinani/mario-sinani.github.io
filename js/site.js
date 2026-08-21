/* Site composition: the features that all pages use. A page calls initSite,
   then adds its own. */

import { initTheme } from './theme.js';
import { initReveal } from './reveal.js';
import { initEmail } from './email.js';
import { initNav } from './nav.js';

/**
 * @param {() => void} [onThemeChange] Runs after a change of the theme.
 *   Use it to draw again a canvas that uses the colours of the theme.
 */
export function initSite(onThemeChange = () => {}) {
  initTheme(onThemeChange);
  initReveal();
  initEmail();
  initNav();
}
