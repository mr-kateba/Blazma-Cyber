import type { Vars } from '../core/i18n';

type T = (key: string, vars?: Vars) => string;

export function formatBytes(t: T, bytes: number, digits = 1): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'] as const;
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  const n = i === 0 ? String(v) : v.toFixed(v >= 100 ? 0 : digits);
  return `${n} ${t(`common.units.${units[i]}`)}`;
}

export function formatDateTime(locale: string, iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(d);
}

export function formatTime(locale: string, iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(d);
}

export function formatDuration(t: T, ms: number): string {
  if (ms < 1000) return t('common.duration.ms', { n: Math.round(ms) });
  const s = Math.floor(ms / 1000);
  if (s < 60) return t('common.duration.s', { n: (ms / 1000).toFixed(1) });
  const m = Math.floor(s / 60);
  if (m < 60) return t('common.duration.m', { m, s: s % 60 });
  const h = Math.floor(m / 60);
  if (h < 24) return t('common.duration.h', { h, m: m % 60 });
  return t('common.duration.d', { d: Math.floor(h / 24), h: h % 24 });
}

export function formatNumber(locale: string, n: number, digits = 0): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(n);
}

export function newTaskId(): string {
  return crypto.randomUUID();
}

/** Network speed from bytes per second, in bits like an Internet plan (kbps / Mbps / Gbps). */
export function formatBitRate(t: T, bytesPerSec: number): string {
  const bits = bytesPerSec * 8;
  const [v, unit] = bits >= 1e9 ? [bits / 1e9, 'Gbps'] : bits >= 1e6 ? [bits / 1e6, 'Mbps'] : [bits / 1e3, 'kbps'];
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${t(`common.units.${unit}`)}`;
}
