import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let dataDir: string;
vi.mock('electron', () => ({ app: { getPath: () => dataDir }, safeStorage: {} }));

import { countLines, WordlistService } from '../src/main/services/wordlists';

let work: string;
beforeAll(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'blazma-wl-data-'));
  work = mkdtempSync(join(tmpdir(), 'blazma-wl-'));
});
afterAll(() => {
  rmSync(dataDir, { recursive: true, force: true });
  rmSync(work, { recursive: true, force: true });
});

const file = (name: string, body: string | Buffer) => {
  const p = join(work, name);
  writeFileSync(p, body);
  return p;
};

describe('wordlists', () => {
  it('counts lines exactly, with or without a final newline, CRLF included', async () => {
    expect(await countLines(file('a.txt', 'one\ntwo\nthree\n'))).toBe(3);
    expect(await countLines(file('b.txt', 'one\ntwo\nthree'))).toBe(3);
    expect(await countLines(file('c.txt', 'one\r\ntwo\r\n'))).toBe(2);
    expect(await countLines(file('d.txt', ''))).toBe(0);
    // Larger than one read chunk (1 MiB).
    expect(await countLines(file('big.txt', Buffer.alloc(3 * 1024 * 1024, 'x\n')))).toBe(3 * 512 * 1024);
  });

  it('remembers lists, counts them, shows a missing file honestly and forgets without deleting', async () => {
    const svc = new WordlistService(() => null);
    expect(await svc.list()).toEqual([]);
    const a = file('mine.txt', 'a\nb\n');
    let list = await svc.add(a);
    expect(list).toMatchObject([{ name: 'mine.txt', path: a, builtin: false, exists: true, lines: 2, sizeBytes: 4 }]);
    expect(await svc.add(a)).toHaveLength(1); // no duplicates
    rmSync(a);
    list = await svc.list();
    expect(list[0]).toMatchObject({ exists: false, lines: null, sizeBytes: null });
    writeFileSync(a, 'a\nb\nc\n'); // changed file → recounted, not the cached number
    expect((await svc.list())[0]!.lines).toBe(3);
    list = await svc.remove(list[0]!.id);
    expect(list).toEqual([]);
    expect(await countLines(a)).toBe(3); // the file itself is untouched
  });

  it("offers John's own password.lst when John is configured", async () => {
    const run = join(work, 'john', 'run');
    mkdirSync(run, { recursive: true });
    writeFileSync(join(run, 'password.lst'), '#!comment: John list\n123456\npassword\n');
    const svc = new WordlistService(() => join(run, 'john.exe'));
    const [builtin] = await svc.list();
    expect(builtin).toMatchObject({ id: 'john-builtin', builtin: true, exists: true, lines: 3 });
  });

  it('rejects anything that is not an existing file', async () => {
    const svc = new WordlistService(() => null);
    await expect(svc.add('relative/path.txt')).rejects.toThrow('invalid_input');
    await expect(svc.add(join(work, 'nope.txt'))).rejects.toThrow('wordlist_not_found');
    await expect(svc.add(work)).rejects.toThrow('wordlist_not_found');
  });
});
