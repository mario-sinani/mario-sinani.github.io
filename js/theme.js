/* Theme: the page follows the device colour scheme unless the visitor picks
   otherwise. Three modes cycle in order - system, light, dark - so an
   explicit choice can always be handed back to the device.

   "system" stores nothing on the document: no data-theme attribute is
   stamped, which lets the prefers-color-scheme rules in tokens.css decide.
   An explicit mode stamps data-theme and wins over the media query. The
   choice is persisted and re-applied before first paint by the inline
   script in the document head, so there is no flash of the wrong theme. */

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
    // Storage is unavailable (private browsing); follow the device instead.
  }
  return 'system';
}

function nextMode() {
  return MODES[(MODES.indexOf(mode) + 1) % MODES.length];
}

/** The theme actually on screen, with "system" resolved against the device. */
export function effectiveTheme() {
  if (mode !== 'system') return mode;
  return darkScheme.matches ? 'dark' : 'light';
}

/* Browser UI tint. In system mode each meta keeps the colour for its own
   scheme; an explicit choice overrides every meta so the browser chrome
   matches the page even when it disagrees with the device. */
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
  // data-theme-mode drives which icon the button shows. It is also set by
  // the inline head script, so the right icon is painted from the start.
  root.dataset.themeMode = mode;
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
        // Not persisted, but the choice still applies for this visit.
      }
      apply();
      onChange();
    });
  }

  // While following the device, react to it changing under us.
  darkScheme.addEventListener('change', () => {
    if (mode !== 'system') return;
    syncThemeColor();
    onChange();
  });

  // Keep other tabs of the site in step with the choice made here.
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return;
    mode = readStoredMode();
    apply();
    onChange();
  });

  apply();
}
