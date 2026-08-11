/* Theme: resolves the effective color scheme and wires the manual toggle.
   An explicit choice is stamped on <html data-theme> and persisted to
   localStorage (read before first paint by the inline head script);
   otherwise the OS preference applies. */

const STORAGE_KEY = 'theme';
const root = document.documentElement;
const darkScheme = window.matchMedia('(prefers-color-scheme: dark)');

export function effectiveTheme() {
  const explicit = root.getAttribute('data-theme');
  if (explicit === 'light' || explicit === 'dark') return explicit;
  return darkScheme.matches ? 'dark' : 'light';
}

export function initTheme(onChange) {
  const toggle = document.getElementById('theme-toggle');
  if (toggle) {
    toggle.addEventListener('click', () => {
      const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch (e) {
        // Storage may be unavailable (private mode); the toggle still works
        // for the current visit.
      }
      onChange();
    });
  }
  darkScheme.addEventListener('change', onChange);
}
