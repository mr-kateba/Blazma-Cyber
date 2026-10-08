import { execFile, spawn } from 'node:child_process';
import { join } from 'node:path';

/**
 * Runs a FIXED, source-controlled PowerShell script and parses its JSON output.
 *
 * Security rules (see SECURITY.md):
 *  - Scripts are constants defined in this codebase. User input is NEVER concatenated into them.
 *  - When a script needs user-supplied data (e.g. a file path), it is passed through environment
 *    variables (BLAZMA_ARG_*) and read with $env:..., so it is data, never code.
 *  - powershell.exe is invoked by absolute path (no PATH hijacking), without a shell,
 *    with -NoProfile (no user profile code) and a hard timeout.
 */
export interface PsOptions {
  timeoutMs?: number;
  args?: Record<string, string>;
}

export type PsResult<T> = { ok: true; data: T } | { ok: false; error: string; detail?: string };

export function powershellPath(): string {
  const root = process.env.SystemRoot || 'C:\\Windows';
  return join(root, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
}

/** Scripts are passed as one argv element; they must not contain double quotes (Windows argv quoting). */
export function assertSafeScript(script: string): void {
  if (script.includes('"')) throw new Error('script_contains_double_quote');
}

const PRELUDE = "$ProgressPreference='SilentlyContinue'; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8;";

export function runPowerShellJson<T>(script: string, opts: PsOptions = {}): Promise<PsResult<T>> {
  if (process.platform !== 'win32') return Promise.resolve({ ok: false, error: 'unsupported_platform' });
  assertSafeScript(script);

  const env = psEnv(opts.args);

  return new Promise((resolve) => {
    execFile(
      powershellPath(),
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', PRELUDE + script],
      { timeout: opts.timeoutMs ?? 20000, windowsHide: true, maxBuffer: 16 * 1024 * 1024, env, encoding: 'utf8' },
      (err, stdout, stderr) => {
        if (err) {
          const e = err as NodeJS.ErrnoException & { killed?: boolean };
          if (e.killed) return resolve({ ok: false, error: 'timeout' });
          if (e.code === 'ENOENT') return resolve({ ok: false, error: 'powershell_missing' });
          return resolve({ ok: false, error: 'powershell_failed', detail: String(stderr || e.message).slice(0, 500) });
        }
        const text = stdout.trim();
        if (!text) return resolve({ ok: false, error: 'empty_output' });
        try {
          resolve({ ok: true, data: JSON.parse(text) as T });
        } catch {
          resolve({ ok: false, error: 'invalid_output', detail: text.slice(0, 200) });
        }
      },
    );
  });
}

/**
 * Clean environment for PowerShell children, with args as BLAZMA_ARG_*. When Blazma is started from
 * PowerShell 7 (pwsh), PSModulePath points at PowerShell 7 modules; Windows PowerShell 5.1 would then
 * try to load those (e.g. Microsoft.PowerShell.Security) and fail, so Get-AuthenticodeSignature
 * silently returned nothing. Without the variable, 5.1 rebuilds its own default module path.
 * (Found on a real Windows CI runner.)
 */
function psEnv(args: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const k of Object.keys(env)) if (k.toUpperCase() === 'PSMODULEPATH') delete env[k];
  for (const [k, v] of Object.entries(args)) {
    if (!/^[A-Z0-9_]+$/.test(k)) throw new Error('invalid_arg_name');
    env[`BLAZMA_ARG_${k}`] = v;
  }
  return env;
}

/**
 * Runs a FIXED long-lived PowerShell script (same rules as runPowerShellJson) and hands every output
 * line to `onLine`. For samplers that would otherwise start one PowerShell per second.
 */
export function spawnPowerShellLines(script: string, onLine: (line: string) => void, onExit: () => void, args?: Record<string, string>): { stop: () => void } {
  assertSafeScript(script);
  const child = spawn(powershellPath(), ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', PRELUDE + script], { windowsHide: true, env: psEnv(args), stdio: ['ignore', 'pipe', 'ignore'] });
  let buf = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    buf += chunk;
    if (buf.length > 1_000_000) buf = ''; // a runaway line is dropped, never buffered forever
    let i: number;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (line) onLine(line);
    }
  });
  child.on('error', onExit);
  child.on('exit', onExit);
  return { stop: () => void child.kill() };
}
