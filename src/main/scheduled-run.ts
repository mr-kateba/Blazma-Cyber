// A checkup started by the scheduled task. Blazma was either launched hidden just for it, or was
// already open (the task's second launch wakes this instance). The renderer runs the same checkup as
// the button does; when it saves the result, the outcome is shown as a Windows notification.

import { app, Notification, type BrowserWindow } from 'electron';
import type { CheckupSummary } from '../core/checkup';
import { logger } from './services/logger';

const SAFETY_QUIT_MS = 30 * 60_000; // a hidden run that never finishes still ends
const LINGER_MS = 3 * 60_000; // keep a hidden instance alive briefly so the notification can be clicked

export class ScheduledRun {
  private pending = false;
  private handedOut = false;
  private quitTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly getWindow: () => BrowserWindow | null,
    /** Launched only for this run (no window shown yet). */
    private hiddenLaunch: boolean,
  ) {
    if (hiddenLaunch) this.armQuit(SAFETY_QUIT_MS);
  }

  /** The task fired: ask the renderer to run the checkup (pulled at start-up, pushed when running). */
  request(): void {
    this.pending = true;
    this.handedOut = false;
    logger.info('scheduled_checkup_started', { hidden: this.hiddenLaunch });
    const w = this.getWindow();
    w?.webContents.setBackgroundThrottling(false);
    w?.webContents.send('checkup:scheduled');
  }

  /** True once per request, so a re-rendered page never runs it twice. */
  take(): boolean {
    if (!this.pending || this.handedOut) return false;
    this.handedOut = true;
    return true;
  }

  /** The checkup finished and was saved. */
  finished(s: CheckupSummary, t: (k: string, v?: Record<string, string | number>) => string): void {
    if (!this.pending) return;
    this.pending = false;
    this.getWindow()?.webContents.setBackgroundThrottling(true);
    const count = s.areas.filter((a) => a.state === 'attention' || a.state === 'problem').length;
    logger.info('scheduled_checkup_done', { verdict: s.verdict, areas: count });
    if (Notification.isSupported()) {
      const n = new Notification({ title: t(`checkup.notify.${s.verdict}`, { n: count }), body: t('checkup.notify.body') });
      n.on('click', () => this.show());
      n.show();
    }
    if (this.hiddenLaunch && !this.getWindow()?.isVisible()) this.armQuit(LINGER_MS);
  }

  /** Brings the window up (notification click, or the user starting Blazma normally). */
  show(): void {
    const w = this.getWindow();
    if (!w) return;
    this.hiddenLaunch = false;
    this.clearQuit();
    if (w.isMinimized()) w.restore();
    w.show();
    w.focus();
  }

  private armQuit(ms: number): void {
    this.clearQuit();
    this.quitTimer = setTimeout(() => {
      if (this.hiddenLaunch && !this.getWindow()?.isVisible()) app.quit();
    }, ms);
    this.quitTimer.unref();
  }
  private clearQuit(): void {
    if (this.quitTimer) clearTimeout(this.quitTimer);
    this.quitTimer = null;
  }
}
