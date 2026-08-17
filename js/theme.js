/* Theme: the page follows the colour scheme of the device until the
   visitor selects a theme. The button goes through the three modes in
   this order: system, light, dark. The visitor can always give the
   control back to the device.

   In the system mode the module sets no data-theme attribute, and the
   prefers-color-scheme rules in tokens.css select the palette. A mode
   that the visitor selects sets data-theme, and that attribute
   overrides the media query. The module keeps the mode in storage. The
   script in the head of the document applies the mode before the
   browser shows the page. The visitor then never sees the wrong
   theme. */

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

/** Give the theme that is on the screen. For "system", give the theme
    of the device. */
export function effectiveTheme() {
  if (mode !== 'system') return mode;
  return darkScheme.matches ? 'dark' : 'light';
}

/* Set the colour of the browser interface. In the system mode each
   meta element keeps the colour for its own scheme. A mode that the
   visitor selects overrides each meta element. The interface of the
   browser then matches the page. */
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
        // The module does not keep this mode in storage, but the
        // mode applies for this visit.
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

  // Apply the same mode in the other tabs of the site.
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return;
    mode = readStoredMode();
    apply();
    onChange();
  });

  apply();
}
