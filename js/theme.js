/* Theme: the page follows the device colour scheme until the visitor
   selects a theme. The three modes cycle in this order: system, light,
   dark. The visitor can always return control to the device.

   In system mode the module sets no data-theme attribute, and the
   prefers-color-scheme rules in tokens.css decide. An explicit mode sets
   data-theme, which overrides the media query. The module stores the
   mode. The inline script in the document head applies it before first
   paint, so there is no flash of the wrong theme. */

const STORAGE_KEY = 'theme';
const MODES = ['system', 'light', 'dark'];

const root = document.documentElement;
const darkScheme = window.matchMedia('(prefers-color-scheme: dark)');

let mode = readStoredMode();
let button = null;
let themeColorMetas = [];
let systemThemeColors = [];

function readStoredMode() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (MODES.includes(stored)) return stored;
  } catch (e) {
    // Storage is not available in private browsing. Follow the device.
  }
  return 'system';
}

function nextMode() {
  return MODES[(MODES.indexOf(mode) + 1) % MODES.length];
}

/** Return the theme on screen. Resolve "system" against the device. */
export function effectiveTheme() {
  if (mode !== 'system') return mode;
  return darkScheme.matches ? 'dark' : 'light';
}

/* Set the browser UI tint. In system mode each meta keeps the colour
   for its own scheme. An explicit mode overrides every meta, so the
   browser chrome agrees with the page. */
function syncThemeColor() {
  if (!themeColorMetas.length) return;
  if (mode === 'system') {
    themeColorMetas.forEach((meta, i) => { meta.content = systemThemeColors[i]; });
    return;
  }
  const paper = getComputedStyle(root).getPropertyValue('--paper').trim();
  themeColorMetas.forEach((meta) => { meta.content = paper; });
}

function syncButton() {
  if (!button) return;
  button.setAttribute('aria-label', `Colour theme: ${mode}. Switch to ${nextMode()}.`);
  button.title = `Colour theme: ${mode}`;
}

function apply() {
  if (mode === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', mode);
  syncThemeColor();
  syncButton();
}

export function initTheme(onChange) {
  themeColorMetas = Array.from(document.querySelectorAll('meta[name="theme-color"]'));
  systemThemeColors = themeColorMetas.map((meta) => meta.content);
  button = document.getElementById('theme-toggle');

  if (button) {
    button.addEventListener('click', () => {
      mode = nextMode();
      try {
        localStorage.setItem(STORAGE_KEY, mode);
      } catch (e) {
        // The mode is not stored, but it applies for this visit.
      }
      apply();
      onChange();
    });
  }

  // In system mode, follow a change of the device scheme.
  darkScheme.addEventListener('change', () => {
    if (mode !== 'system') return;
    syncThemeColor();
    onChange();
  });

  // Apply the same mode in the site's other tabs.
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return;
    mode = readStoredMode();
    apply();
    onChange();
  });

  apply();
}
