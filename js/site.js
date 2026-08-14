/* Site composition: the features every page shares. A page calls
   initSite and then adds its own features. */

import { initTheme } from './theme.js';
import { initReveal } from './reveal.js';
import { initEmail } from './email.js';
import { initNav } from './nav.js';

/**
 * @param {() => void} [onThemeChange] Runs after the theme changes.
 *   Use it to repaint theme-dependent canvases.
 */
export function initSite(onThemeChange = () => {}) {
  initTheme(onThemeChange);
  initReveal();
  initEmail();
  initNav();
}
