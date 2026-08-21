/* Theme: the page follows the device until a theme is chosen. The button
   goes through system, light and dark.

   The system mode sets no data-theme, and the prefers-color-scheme rules of
   tokens.css select the palette. A chosen mode sets data-theme, which
   overrides the media query. The script in the head applies the stored mode
   before the first paint. */

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
    // Storage is not available in a private window. Follow the device.
  }
  return 'system';
}

function nextMode() {
  return MODES[(MODES.indexOf(mode) + 1) % MODES.length];
}

/** Give the theme on the screen. For system, give the theme of the device. */
export function effectiveTheme() {
  if (mode !== 'system') return mode;
  return darkScheme.matches ? 'dark' : 'light';
}

/* Set the colour of the browser interface. In the system mode each meta
   element keeps the colour of its own scheme, and a chosen mode overrides
   both. */
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
  button.setAttribute('aria-label', `Color theme: ${mode}. Switch to ${nextMode()}.`);
  button.title = `Color theme: ${mode}`;
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
        // The module stores no mode here, but the mode holds for this
        // visit.
      }
      apply();
      onChange();
    });
  }

  // In the system mode, follow a change of the scheme of the device.
  darkScheme.addEventListener('change', () => {
    if (mode !== 'system') return;
    syncThemeColor();
    onChange();
  });

  // Apply the same mode in the other tabs.
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return;
    mode = readStoredMode();
    apply();
    onChange();
  });

  apply();
}
