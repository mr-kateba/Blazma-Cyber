import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let dataDir: string;
vi.mock('electron', () => ({
  app: { getPath: () => dataDir, getVersion: () => '0.1.0' },
  safeStorage: {},
  shell: { openPath: async () => '', showItemInFolder: () => {} },
  BrowserWindow: class {},
}));

import en from '../locales/en.json';
import { createTranslator, type Dict } from '../src/core/i18n';
import { appendCustody, canonical, GENESIS, startCustody, verifyCustody } from '../src/core/custody';
import { problemText } from '../src/core/custody-text';
import { buildHtmlReport, buildJsonReport } from '../src/core/report';
import { CaseService } from '../src/main/services/cases';
import { ReportService } from '../src/main/services/reports';
import type { InvestigationCase } from '../src/shared/api';

beforeAll(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'blazma-custody-'));
});
afterAll(() => rmSync(dataDir, { recursive: true, force: true }));

const caseFile = (id: string) => join(dataDir, 'cases', `${id}.json`);
const readCase = (id: string) => JSON.parse(readFileSync(caseFile(id), 'utf8')) as InvestigationCase;
const writeCase = (c: InvestigationCase) => writeFileSync(caseFile(c.id), JSON.stringify(c));

function populated(svc: CaseService) {
  const c = svc.create('Custody', 'desc', ['x']);
  svc.addEvidence(c.id, { kind: 'hash', value: 'a'.repeat(64), source: 'fileAnalyzer', details: { verdict: 'suspicious' } });
  svc.addEvidence(c.id, { kind: 'ip', value: '203.0.113.9', source: 'ipIntel' });
  const n = svc.addNote(c.id, 'first');
  svc.updateNote(c.id, n.notes[0]!.id, 'first, edited');
  svc.addEvent(c.id, 'Called the ISP', null, null);
  return svc.update(c.id, { status: 'closed' });
}

describe('chain of custody', () => {
  it('canonical JSON ignores key order', () => {
    expect(canonical({ b: 1, a: [{ d: 2, c: null }] })).toBe(canonical({ a: [{ c: null, d: 2 }], b: 1 }));
  });

  it('records every change of a case in a chain that verifies', () => {
    const svc = new CaseService();
    const c = populated(svc);
    const log = c.custody!;
    expect(log.map((e) => e.action)).toEqual(['case_created', 'evidence_added', 'evidence_added', 'note_added', 'note_edited', 'event_added', 'case_edited']);
    expect(log[0]!.prev).toBe(GENESIS);
    expect(log[0]!.actor).toMatch(/@/);
    for (let i = 1; i < log.length; i++) expect(log[i]!.prev).toBe(log[i - 1]!.hash);
    const v = svc.verifyCustody(c.id);
    expect(v).toMatchObject({ intact: true, entries: 7, fullHistory: true, problems: [] });
    expect(v.head).toBe(log[6]!.hash);
  });

  it('records removals instead of hiding them', () => {
    const svc = new CaseService();
    const c = populated(svc);
    const ev = c.evidence[1]!;
    const after = svc.removeEvidence(c.id, ev.id);
    const last = after.custody!.at(-1)!;
    expect(last).toMatchObject({ action: 'evidence_removed', subject: ev.id, detail: 'ip:203.0.113.9' });
    expect(svc.verifyCustody(c.id).intact).toBe(true);
    expect(() => svc.removeEvidence(c.id, ev.id)).toThrow('evidence_not_found');
  });

  it('detects evidence edited, added or deleted outside Blazma', () => {
    const svc = new CaseService();
    const c = populated(svc);

    const edited = readCase(c.id);
    edited.evidence[0]!.value = 'b'.repeat(64);
    writeCase(edited);
    expect(svc.verifyCustody(c.id).problems).toEqual([{ type: 'changed', kind: 'evidence', subject: c.evidence[0]!.id }]);

    const added = readCase(c.id);
    added.evidence[0]!.value = 'a'.repeat(64);
    added.evidence.push({ id: 'e-planted', kind: 'url', value: 'https://example.com/', label: null, source: 'manual', addedAt: new Date().toISOString(), details: null });
    writeCase(added);
    expect(svc.verifyCustody(c.id).problems).toEqual([{ type: 'unrecorded', kind: 'evidence', subject: 'e-planted' }]);

    const deleted = readCase(c.id);
    deleted.evidence = deleted.evidence.filter((e) => e.id !== 'e-planted' && e.id !== c.evidence[1]!.id);
    writeCase(deleted);
    expect(svc.verifyCustody(c.id).problems).toEqual([{ type: 'missing', kind: 'evidence', subject: c.evidence[1]!.id }]);
  });

  it('detects a log that was edited, truncated or re-ordered', () => {
    const svc = new CaseService();
    const c = populated(svc);
    const tampered = readCase(c.id);
    tampered.custody![2]!.time = '2020-01-01T00:00:00.000Z';
    writeCase(tampered);
    expect(svc.verifyCustody(c.id).problems[0]).toEqual({ type: 'chain_broken', seq: 3 });

    const swapped = readCase(c.id);
    swapped.custody = [...c.custody!];
    [swapped.custody[1], swapped.custody[2]] = [swapped.custody[2]!, swapped.custody[1]!];
    writeCase(swapped);
    expect(svc.verifyCustody(c.id).problems[0]).toEqual({ type: 'chain_broken', seq: 2 });

    // Dropping the last entries (e.g. hiding the note edit) leaves content the log doesn't match.
    const cut = readCase(c.id);
    cut.custody = c.custody!.slice(0, 4);
    writeCase(cut);
    const v = svc.verifyCustody(c.id);
    expect(v.intact).toBe(false);
    expect(v.head).not.toBe(c.custody!.at(-1)!.hash);
  });

  it('detects edited case details', () => {
    const svc = new CaseService();
    const c = populated(svc);
    const x = readCase(c.id);
    x.name = 'Renamed quietly';
    writeCase(x);
    expect(svc.verifyCustody(c.id).problems).toEqual([{ type: 'case_changed' }]);
  });

  it('starts the chain for a case saved by an older version, and says so', () => {
    const svc = new CaseService();
    const c = populated(svc);
    const legacy = readCase(c.id);
    delete legacy.custody;
    writeCase(legacy);
    const opened = svc.get(c.id);
    expect(opened.custody!.map((e) => e.action)).toEqual(['custody_started', 'evidence_recorded', 'evidence_recorded', 'note_recorded', 'event_recorded']);
    const v = svc.verifyCustody(c.id);
    expect(v).toMatchObject({ intact: true, fullHistory: false });
    // Pure helper gives the same result.
    expect(verifyCustody({ ...legacy, custody: startCustody(legacy, 'u@h', '2026-01-01T00:00:00.000Z') }).intact).toBe(true);
  });

  it('records exported case reports with the SHA-256 of the file', async () => {
    const svc = new CaseService();
    const reports = new ReportService();
    const c = populated(svc);
    const rec = await reports.generate(svc.get(c.id), { format: 'json', language: 'en' });
    expect(rec.sha256).toMatch(/^[0-9a-f]{64}$/);
    svc.recordExport(rec.caseId, rec.format, rec.sha256!);
    const last = svc.get(c.id).custody!.at(-1)!;
    expect(last).toMatchObject({ action: 'report_exported', digest: rec.sha256, detail: 'json' });
    expect(svc.verifyCustody(c.id).intact).toBe(true);
    const json = JSON.parse(readFileSync(rec.path, 'utf8'));
    expect(json.custody.verification.intact).toBe(true);
    expect(json.custody.entries).toHaveLength(7);
  });

  it('prints the custody state, problems and head hash in the HTML report (escaped)', () => {
    const t = createTranslator(en as unknown as Dict, en as unknown as Dict);
    const svc = new CaseService();
    const c = populated(svc);
    const broken = { ...svc.get(c.id), name: 'x' };
    const html = buildHtmlReport(broken, { format: 'html', language: 'en', includeMachineInfo: false, includeNotes: true, includeTimeline: true }, t, new Date().toISOString(), null);
    expect(html).toContain('Chain of custody');
    expect(html).toContain('Not intact');
    expect(html).toContain(problemText({ type: 'case_changed' }, t));
    expect(html).toContain(c.custody!.at(-1)!.hash);
    expect(buildJsonReport(c, { format: 'json', language: 'en', includeMachineInfo: false, includeNotes: true, includeTimeline: true }, 'now', null)).toContain('"custody"');
  });

  it('appendCustody chains from the previous entry', () => {
    const log: InvestigationCase['custody'] = [];
    const a = appendCustody(log, { action: 'note_added', subject: 'n1', digest: null, detail: null }, 'u@h', 't1');
    const b = appendCustody(log, { action: 'note_removed', subject: 'n1', digest: null, detail: null }, 'u@h', 't2');
    expect(a.seq).toBe(1);
    expect(b.prev).toBe(a.hash);
    expect(b.hash).not.toBe(a.hash);
  });
});
