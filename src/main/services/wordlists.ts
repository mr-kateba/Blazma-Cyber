// "My wordlists": files the user chose for password recovery, remembered with their size and line
// count, plus the list John the Ripper ships (run/password.lst) when John is configured. Blazma only
// remembers paths and reads the files to count lines — it never copies, edits or deletes them.

import { createReadStream, existsSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import type { WordlistEntry } from '../../shared/api';
import { validateAbsolutePath } from '../../core/validation';
import { readJson, writeJson } from './json-store';
import { subDir } from './paths';

export class WordlistError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

interface Stored {
  id: string;
  path: string;
  /** Line count cached for this size + modification time. */
  lines?: number;
  size?: number;
  mtimeMs?: number;
}

const MAX_SAVED = 50;

/** Counts lines by streaming (a 15 GB list never sits in memory). A last line without "\n" counts. */
export function countLines(path: string): Promise<number> {
  return new Promise((resolve, reject) => {
    let n = 0;
    let last = 10;
    const s = createReadStream(path, { highWaterMark: 1 << 20 });
    s.on('data', (chunk) => {
      const b = chunk as Buffer;
      for (let i = b.indexOf(10); i !== -1; i = b.indexOf(10, i + 1)) n++;
      if (b.length) last = b[b.length - 1] as number;
    });
    s.on('error', reject);
    s.on('end', () => resolve(last === 10 ? n : n + 1));
  });
}

export class WordlistService {
  private readonly file = join(subDir('state'), 'wordlists.json');

  constructor(private readonly johnPath: () => string | null) {}

  private load(): Stored[] {
    const v = readJson<Stored[]>(this.file, []);
    return Array.isArray(v) ? v.filter((x) => x && typeof x.id === 'string' && typeof x.path === 'string') : [];
  }

  private async describe(s: Stored, builtin: boolean, store: Stored[] | null): Promise<WordlistEntry> {
    const base = { id: s.id, name: basename(s.path), path: s.path, builtin };
    if (!existsSync(s.path)) return { ...base, exists: false, sizeBytes: null, lines: null };
    const st = statSync(s.path);
    if (!st.isFile()) return { ...base, exists: false, sizeBytes: null, lines: null };
    let lines = s.size === st.size && s.mtimeMs === st.mtimeMs && typeof s.lines === 'number' ? s.lines : null;
    if (lines === null) {
      try {
        lines = await countLines(s.path);
        if (store) Object.assign(s, { lines, size: st.size, mtimeMs: st.mtimeMs });
      } catch {
        lines = null; // unreadable right now: shown as unknown, never guessed
      }
    }
    return { ...base, exists: true, sizeBytes: st.size, lines };
  }

  async list(): Promise<WordlistEntry[]> {
    const saved = this.load();
    const out: WordlistEntry[] = [];
    const john = this.johnPath();
    const shipped = john ? join(dirname(john), 'password.lst') : null;
    if (shipped && existsSync(shipped) && !saved.some((s) => s.path.toLowerCase() === shipped.toLowerCase())) {
      out.push(await this.describe({ id: 'john-builtin', path: shipped }, true, null));
    }
    for (const s of saved) out.push(await this.describe(s, false, saved));
    writeJson(this.file, saved); // keeps refreshed line counts
    return out;
  }

  async add(path: unknown): Promise<WordlistEntry[]> {
    const v = validateAbsolutePath(path);
    if (!v.ok) throw new WordlistError('invalid_input');
    const p = path as string;
    if (!existsSync(p) || !statSync(p).isFile()) throw new WordlistError('wordlist_not_found');
    const saved = this.load();
    if (!saved.some((s) => s.path.toLowerCase() === p.toLowerCase())) {
      if (saved.length >= MAX_SAVED) throw new WordlistError('wordlists_full');
      saved.push({ id: `wl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, path: p });
      writeJson(this.file, saved);
    }
    return this.list();
  }

  /** Forgets a saved list (the file itself is left alone). */
  async remove(id: unknown): Promise<WordlistEntry[]> {
    writeJson(this.file, this.load().filter((s) => s.id !== id));
    return this.list();
  }

  clearAll(): void {
    writeJson(this.file, []);
  }
}
