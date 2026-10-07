// Window chrome (background + Windows caption buttons) that matches the selected theme.
import { nativeTheme, type BrowserWindow } from 'electron';
import type { Theme } from '../shared/api';

const CHROME = {
  dark: { background: '#121216', overlay: { color: '#121216', symbolColor: '#a0a0ab' } },
  midnight: { background: '#0a0a0d', overlay: { color: '#111115', symbolColor: '#a0a0ab' } },
  light: { background: '#f5f6f8', overlay: { color: '#fefefe', symbolColor: '#5a6070' } },
} as const;

let current: Theme = 'dark';

function resolved(theme: Theme): keyof typeof CHROME {
  if (theme === 'system') return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
  return theme;
}

/** Colours for a new window, and the source the renderer's prefers-color-scheme follows. */
export function windowChrome(theme: Theme) {
  current = theme;
  nativeTheme.themeSource = theme === 'system' ? 'system' : theme === 'light' ? 'light' : 'dark';
  return CHROME[resolved(theme)];
}

export function applyWindowTheme(win: BrowserWindow | null, theme: Theme = current): void {
  const c = windowChrome(theme);
  if (!win || win.isDestroyed()) return;
  win.setBackgroundColor(c.background);
  try {
    win.setTitleBarOverlay({ ...c.overlay, height: 60 });
  } catch {
    /* no caption-button overlay on this platform */
  }
}

/** In 'system' mode the caption buttons follow Windows switching between light and dark. */
export function followSystemTheme(getWin: () => BrowserWindow | null): void {
  nativeTheme.on('updated', () => {
    if (current === 'system') applyWindowTheme(getWin());
  });
}
