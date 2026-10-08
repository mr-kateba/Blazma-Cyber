import { describe, expect, it, vi } from 'vitest';
import { tmpdir } from 'node:os';

vi.mock('electron', () => ({ app: { getPath: () => tmpdir() }, safeStorage: {} }));

import { loadSettings, sanitizeSettings, SETTINGS_SCHEMA } from '../src/main/services/settings';
import { DEFAULT_SETTINGS } from '../src/shared/api';

describe('settings validation', () => {
  it('defaults to online lookups (still only on demand) and no language chosen', () => {
    expect(DEFAULT_SETTINGS.offlineMode).toBe(false);
    expect(DEFAULT_SETTINGS.language).toBeNull();
  });
  it('accepts valid values and drops unknown keys', () => {
    const s = sanitizeSettings({ language: 'ar', offlineMode: false, evil: '<script>', __proto__: { x: 1 } }, DEFAULT_SETTINGS);
    expect(s.language).toBe('ar');
    expect(s.offlineMode).toBe(false);
    expect(s).not.toHaveProperty('evil');
  });
  it('rejects invalid values, keeping the previous ones', () => {
    const s = sanitizeSettings({ language: 'fr', theme: 'pink', offlineMode: 'no', logLevel: 'TRACE' }, DEFAULT_SETTINGS);
    expect(s).toEqual(DEFAULT_SETTINGS);
  });
  it('handles garbage input', () => {
    expect(sanitizeSettings(null, DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings('x', DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS);
  });
});

describe('settings migration', () => {
  it('a first launch gets the defaults without a migration', () => {
    expect(loadSettings({})).toEqual({ settings: DEFAULT_SETTINGS, migrated: false });
  });
  it('moves settings saved by 1.1.6 and earlier (Offline Mode on by default) to online once', () => {
    const old = { ...DEFAULT_SETTINGS, language: 'ar', offlineMode: true, theme: 'light' };
    const { settings, migrated } = loadSettings(old);
    expect(migrated).toBe(true);
    expect(settings.offlineMode).toBe(false);
    expect(settings.language).toBe('ar');
    expect(settings.theme).toBe('light');
  });
  it('keeps Offline Mode when the user turned it on after the migration', () => {
    const { settings, migrated } = loadSettings({ ...DEFAULT_SETTINGS, offlineMode: true, schema: SETTINGS_SCHEMA });
    expect(migrated).toBe(false);
    expect(settings.offlineMode).toBe(true);
  });
});
