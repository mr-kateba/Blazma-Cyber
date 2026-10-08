// Live network speed for the dashboard. Started on demand and stopped after a short idle period, so
// nothing samples in the background when nobody is looking. Windows: one long-lived PowerShell that
// prints the physical, connected adapters' byte counters every second (locale-independent objects).
// Linux: /proc/net/dev. Elsewhere: unavailable.

import { readFile } from 'node:fs/promises';
import type { ThroughputStatus } from '../../shared/api';
import { parseProcNetDev, parseWindowsSample, ratesBetween, type CounterSample } from '../../core/throughput';
import { spawnPowerShellLines } from './powershell';

const SAMPLER = `
$ErrorActionPreference = 'SilentlyContinue'
while ($true) {
  $names = @(Get-NetAdapter -Physical | Where-Object { $_.Status -eq 'Up' } | ForEach-Object { $_.Name })
  $rows = @()
  if ($names.Count -gt 0) { $rows = @(Get-NetAdapterStatistics -Name $names | ForEach-Object { @{ n = [string]$_.Name; rx = [double]$_.ReceivedBytes; tx = [double]$_.SentBytes } }) }
  @{ t = [double][DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(); a = $rows } | ConvertTo-Json -Compress -Depth 3
  Start-Sleep -Milliseconds 1000
}`;

const IDLE_STOP_MS = 15_000;

export class ThroughputMonitor {
  private prev: CounterSample | null = null;
  private last: ThroughputStatus | null = null;
  private stopSampler: (() => void) | null = null;
  private linuxTimer: NodeJS.Timeout | null = null;
  private idleTimer: NodeJS.Timeout | null = null;
  private failed: string | null = null;

  /** Latest rates; (re)starts sampling and keeps it alive while the dashboard keeps asking. */
  status(): ThroughputStatus {
    if (process.platform !== 'win32' && process.platform !== 'linux') return { available: false, reason: 'unsupported_platform', rx: null, tx: null, adapters: [] };
    if (this.failed) return { available: false, reason: this.failed, rx: null, tx: null, adapters: [] };
    this.ensureRunning();
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.stop(), IDLE_STOP_MS);
    this.idleTimer.unref();
    return this.last ?? { available: true, rx: null, tx: null, adapters: [] };
  }

  private take(sample: CounterSample): void {
    if (this.prev) {
      const r = ratesBetween(this.prev, sample);
      this.last = { available: true, rx: r.rx, tx: r.tx, adapters: r.adapters };
    }
    this.prev = sample;
  }

  private ensureRunning(): void {
    if (this.stopSampler || this.linuxTimer) return;
    this.prev = null;
    this.last = null;
    if (process.platform === 'linux') {
      const tick = () =>
        void readFile('/proc/net/dev', 'utf8').then(
          (txt) => this.take(parseProcNetDev(txt, Date.now())),
          () => (this.failed = 'throughput_unavailable'),
        );
      tick();
      this.linuxTimer = setInterval(tick, 1000);
      this.linuxTimer.unref();
      return;
    }
    const started = Date.now();
    const handle = spawnPowerShellLines(
      SAMPLER,
      (line) => {
        const s = parseWindowsSample(line);
        if (s) this.take(s);
      },
      () => {
        // A sampler that dies at once (no PowerShell / no NetAdapter module) is reported, not restarted.
        if (this.stopSampler && Date.now() - started < 5000 && !this.prev) this.failed = 'throughput_unavailable';
        this.stopSampler = null;
      },
    );
    this.stopSampler = handle.stop;
  }

  stop(): void {
    this.stopSampler?.();
    this.stopSampler = null;
    if (this.linuxTimer) clearInterval(this.linuxTimer);
    this.linuxTimer = null;
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }
}
