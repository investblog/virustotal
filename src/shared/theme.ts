import type { Theme, ThemePreference } from './types';

const LS_KEY = 'vt_monitor_theme';

export function resolveTheme(pref: ThemePreference): Theme {
  if (pref === 'dark' || pref === 'light') return pref;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function getThemePreference(): ThemePreference {
  try {
    const val = localStorage.getItem(LS_KEY);
    if (val === 'dark' || val === 'light' || val === 'auto') return val;
  } catch { /* ignore */ }
  return 'auto';
}

export function getTheme(): Theme {
  return resolveTheme(getThemePreference());
}

export function setTheme(theme: Theme | null): void {
  if (theme) {
    document.documentElement.dataset.theme = theme;
  } else {
    delete document.documentElement.dataset.theme;
  }
}

export function setThemePreference(preference: ThemePreference): void {
  try { localStorage.setItem(LS_KEY, preference); } catch { /* ignore */ }
  setTheme(preference === 'auto' ? null : preference);

  try {
    void chrome.storage.sync.set({ theme: preference });
  } catch { /* ignore */ }
}

export function toggleTheme(): void {
  const current = getThemePreference();
  const order: ThemePreference[] = ['dark', 'light', 'auto'];
  const next = order[(order.indexOf(current) + 1) % order.length];
  setThemePreference(next);
}

export function initTheme(): void {
  const pref = getThemePreference();
  // Persist default so toggle cycle has a real starting point
  try { localStorage.setItem(LS_KEY, pref); } catch { /* ignore */ }
  setTheme(pref === 'auto' ? null : pref);

  try {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (getThemePreference() === 'auto') setTheme(null);
    });
  } catch { /* ignore */ }

  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync' && changes.theme) {
        const val = changes.theme.newValue as ThemePreference | undefined;
        if (val) {
          try { localStorage.setItem(LS_KEY, val); } catch { /* ignore */ }
          setTheme(val === 'auto' ? null : val);
        }
      }
    });
  } catch { /* ignore */ }
}
