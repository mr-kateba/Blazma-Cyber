// The scheduled checkup's Windows task: created, read back and removed with the ScheduledTasks
// PowerShell module (objects, locale-independent). The task XML comes from core/schedule.ts and
// reaches PowerShell only through BLAZMA_ARG_* variables.

import type { ScheduleStatus } from '../../shared/api';
import { buildTaskXml, parseTaskXml, taskMatches, TASK_FOLDER, TASK_NAME, type ScheduleConfig } from '../../core/schedule';
import { runPowerShellJson } from './powershell';

export class ScheduleError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

const QUERY = `
$t = Get-ScheduledTask -TaskPath $env:BLAZMA_ARG_FOLDER -TaskName $env:BLAZMA_ARG_NAME -ErrorAction SilentlyContinue
if (-not $t) { @{ found = $false } | ConvertTo-Json -Compress; return }
$i = $null
try { $i = $t | Get-ScheduledTaskInfo -ErrorAction Stop } catch { }
$x = [string](Export-ScheduledTask -TaskPath $env:BLAZMA_ARG_FOLDER -TaskName $env:BLAZMA_ARG_NAME -ErrorAction Stop)
function Iso($d) { if ($d -and ([datetime]$d).Year -gt 2000) { ([datetime]$d).ToString('o') } else { $null } }
@{ found = $true; state = [string]$t.State; xml = $x; next = $(if ($i) { Iso $i.NextRunTime } else { $null }); last = $(if ($i) { Iso $i.LastRunTime } else { $null }); result = $(if ($i) { [int64]$i.LastTaskResult } else { $null }) } | ConvertTo-Json -Compress`;

const REGISTER = `
$null = Register-ScheduledTask -TaskPath $env:BLAZMA_ARG_FOLDER -TaskName $env:BLAZMA_ARG_NAME -Xml $env:BLAZMA_ARG_XML -Force -ErrorAction Stop
@{ ok = $true } | ConvertTo-Json -Compress`;

const UNREGISTER = `
$t = Get-ScheduledTask -TaskPath $env:BLAZMA_ARG_FOLDER -TaskName $env:BLAZMA_ARG_NAME -ErrorAction SilentlyContinue
if ($t) { Unregister-ScheduledTask -TaskPath $env:BLAZMA_ARG_FOLDER -TaskName $env:BLAZMA_ARG_NAME -Confirm:$false -ErrorAction Stop }
@{ ok = $true } | ConvertTo-Json -Compress`;

/** Overridable only by the Windows integration test (so it never touches a real user's task). */
export interface TaskId {
  folder: string;
  name: string;
}
const DEFAULT_ID: TaskId = { folder: TASK_FOLDER, name: TASK_NAME };

interface QueryOut {
  found: boolean;
  state?: string;
  xml?: string;
  next?: string | null;
  last?: string | null;
  result?: number | null;
}

/** `exe` = the Blazma executable a task should start; null in a development build. */
export async function scheduleStatus(exe: string | null, id = DEFAULT_ID): Promise<ScheduleStatus> {
  if (process.platform !== 'win32') return { supported: false, reason: 'unsupported_platform', state: 'none', config: null, nextRun: null, lastRun: null, lastResult: null };
  if (!exe) return { supported: false, reason: 'schedule_dev_build', state: 'none', config: null, nextRun: null, lastRun: null, lastResult: null };
  const r = await runPowerShellJson<QueryOut>(QUERY, { args: { FOLDER: id.folder, NAME: id.name } });
  if (!r.ok) throw new ScheduleError(r.error);
  if (!r.data.found) return { supported: true, state: 'none', config: null, nextRun: null, lastRun: null, lastResult: null };
  const info = parseTaskXml(r.data.xml ?? '');
  const state = !taskMatches(info, exe) ? 'other_copy' : !info.config ? 'edited' : /disabled/i.test(r.data.state ?? '') ? 'disabled' : 'ok';
  return { supported: true, state, config: info.config, nextRun: r.data.next ?? null, lastRun: r.data.last ?? null, lastResult: typeof r.data.result === 'number' ? r.data.result : null };
}

export async function setSchedule(cfg: ScheduleConfig, exe: string | null, id = DEFAULT_ID): Promise<ScheduleStatus> {
  if (process.platform !== 'win32') throw new ScheduleError('unsupported_platform');
  if (!exe) throw new ScheduleError('schedule_dev_build');
  const r = await runPowerShellJson<{ ok: boolean }>(REGISTER, { args: { FOLDER: id.folder, NAME: id.name, XML: buildTaskXml(cfg, exe, new Date()) } });
  if (!r.ok) throw new ScheduleError(r.error === 'powershell_failed' ? 'schedule_failed' : r.error);
  return scheduleStatus(exe, id);
}

export async function removeSchedule(exe: string | null, id = DEFAULT_ID): Promise<ScheduleStatus> {
  if (process.platform !== 'win32') throw new ScheduleError('unsupported_platform');
  const r = await runPowerShellJson<{ ok: boolean }>(UNREGISTER, { args: { FOLDER: id.folder, NAME: id.name } });
  if (!r.ok) throw new ScheduleError(r.error === 'powershell_failed' ? 'schedule_failed' : r.error);
  return scheduleStatus(exe, id);
}
