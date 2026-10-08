import { join } from 'node:path';
import { DEFAULT_SETTINGS, type Settings } from '../../shared/api';
import { isLang } from '../../core/i18n';
import { validateAbsolutePath } from '../../core/validation';
import { readJson, writeJson } from './json-store';
import { subDir } from './paths';

const VALIDATORS: { [K in keyof Settings]: (v: unknown) => boolean } = {
  language: (v) => v === null || isLang(v),
  uiMode: (v) => v === 'simple' || v === 'expert',
  theme: (v) => v === 'dark' || v === 'midnight' || v === 'light' || v === 'system',
  startPage: (v) => v === 'dashboard' || v === 'file-analyzer' || v === 'hash-lab' || v === 'privacy',
  offlineMode: (v) => typeof v === 'boolean',
  keepHistory: (v) => typeof v === 'boolean',
  notifications: (v) => typeof v === 'boolean',
  logLevel: (v) => v === 'INFO' || v === 'DEBUG',
  reportLanguage: (v) => isLang(v),
  yaraPath: (v) => v === null || (typeof v === 'string' && validateAbsolutePath(v).ok),
  johnPath: (v) => v === null || (typeof v === 'string' && validateAbsolutePath(v).ok),
  hashcatPath: (v) => v === null || (typeof v === 'string' && validateAbsolutePath(v).ok),
  defenderOnAnalyze: (v) => typeof v === 'boolean',
  yaraOnAnalyze: (v) => typeof v === 'boolean',
  capaOnAnalyze: (v) => typeof v === 'boolean',
  dieOnAnalyze: (v) => typeof v === 'boolean',
  watchDownloads: (v) => typeof v === 'boolean',
};

/** Keeps only known keys with valid values; used for both loaded files and IPC patches. */
export function sanitizeSettings(input: unknown, base: Settings): Settings {
  const out: Settings = { ...base };
  if (!input || typeof input !== 'object') return out;
  for (const key of Object.keys(VALIDATORS) as Array<keyof Settings>) {
    const v = (input as Record<string, unknown>)[key];
    if (v !== undefined && VALIDATORS[key](v)) (out as unknown as Record<string, unknown>)[key] = v;
  }
  return out;
}

/** Bumped when a stored setting needs a one-time migration. */
export const SETTINGS_SCHEMA = 2;

/** Settings read from disk. Schema 1 (≤ 1.1.6) shipped with Offline Mode on by default; the owner
 *  made online lookups the default in 1.1.7, so those stored values move to online once. */
export function loadSettings(raw: unknown): { settings: Settings; migrated: boolean } {
  const settings = sanitizeSettings(raw, DEFAULT_SETTINGS);
  const existing = !!raw && typeof raw === 'object' && Object.keys(raw).length > 0;
  const schema = existing ? (raw as Record<string, unknown>).schema : SETTINGS_SCHEMA;
  if (!existing || schema === SETTINGS_SCHEMA) return { settings, migrated: false };
  settings.offlineMode = false;
  return { settings, migrated: true };
}

export class SettingsService {
  private current: Settings;
  private readonly file = join(subDir('state'), 'settings.json');

  constructor() {
    const { settings, migrated } = loadSettings(readJson(this.file, {}));
    this.current = settings;
    if (migrated) this.save();
    if (process.env.BLAZMA_FORCE_OFFLINE === '1') this.current.offlineMode = true;
  }

  private save(): void {
    writeJson(this.file, { ...this.current, schema: SETTINGS_SCHEMA });
  }

  get(): Settings {
    return { ...this.current };
  }

  update(patch: unknown): Settings {
    this.current = sanitizeSettings(patch, this.current);
    if (process.env.BLAZMA_FORCE_OFFLINE === '1') this.current.offlineMode = true;
    this.save();
    return this.get();
  }
}
