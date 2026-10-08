// Chain of custody for investigation cases (pure).
//
// Every change to a case (evidence, notes, analyst events, case details, exported reports) appends
// an entry to an append-only log. Each entry stores the SHA-256 of what it is about (`digest`) and
// is chained to the previous one (`prev` → `hash`), so editing, deleting or re-ordering anything
// afterwards — in the case file or the log itself — is detected by `verifyCustody`.
//
// Honest limits (shown in the UI): someone who can rewrite the whole case file can also rebuild a
// consistent chain. Keeping the head hash elsewhere (it is printed in every case report) is what
// lets you prove later that nothing changed.

import { createHash } from 'node:crypto';
import type { CaseNote, CustodyAction, CustodyEntry, CustodyProblem, CustodyVerification, Evidence, InvestigationCase, TimelineEvent } from '../shared/api';

export const GENESIS = '0'.repeat(64);

const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

/** JSON with sorted keys, so the same content always hashes the same. */
export function canonical(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
    .join(',')}}`;
}

export const evidenceDigest = (e: Evidence) => sha256(canonical({ id: e.id, kind: e.kind, value: e.value, label: e.label, source: e.source, addedAt: e.addedAt, details: e.details }));
export const noteDigest = (n: CaseNote) => sha256(canonical({ id: n.id, text: n.text }));
export const eventDigest = (e: TimelineEvent) => sha256(canonical({ id: e.id, time: e.time, title: e.title, detail: e.detail }));
export const caseDigest = (c: Pick<InvestigationCase, 'id' | 'name' | 'description' | 'tags' | 'status'>) =>
  sha256(canonical({ id: c.id, name: c.name, description: c.description, tags: c.tags, status: c.status }));
export const bytesDigest = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

export function entryHash(e: Omit<CustodyEntry, 'hash'>): string {
  return sha256(canonical({ seq: e.seq, time: e.time, action: e.action, actor: e.actor, subject: e.subject, digest: e.digest, detail: e.detail, prev: e.prev }));
}

export interface CustodyInput {
  action: CustodyAction;
  subject: string | null;
  digest: string | null;
  detail: string | null;
}

/** Appends one entry (mutates `log`) and returns it. */
export function appendCustody(log: CustodyEntry[], input: CustodyInput, actor: string, time: string): CustodyEntry {
  const last = log[log.length - 1];
  const base = { seq: log.length + 1, time, action: input.action, actor, subject: input.subject, digest: input.digest, detail: input.detail, prev: last ? last.hash : GENESIS };
  const entry: CustodyEntry = { ...base, hash: entryHash(base) };
  log.push(entry);
  return entry;
}

/** A case saved before custody existed: start the chain now and record what is in it at this moment. */
export function startCustody(c: InvestigationCase, actor: string, time: string): CustodyEntry[] {
  const log: CustodyEntry[] = [];
  appendCustody(log, { action: 'custody_started', subject: c.id, digest: caseDigest(c), detail: `evidence:${c.evidence.length} notes:${c.notes.length}` }, actor, time);
  for (const e of c.evidence) appendCustody(log, { action: 'evidence_recorded', subject: e.id, digest: evidenceDigest(e), detail: `${e.kind}:${e.value}`.slice(0, 300) }, actor, time);
  for (const n of c.notes) appendCustody(log, { action: 'note_recorded', subject: n.id, digest: noteDigest(n), detail: null }, actor, time);
  for (const ev of c.timeline.filter((x) => x.kind === 'event')) appendCustody(log, { action: 'event_recorded', subject: ev.id, digest: eventDigest(ev), detail: null }, actor, time);
  return log;
}

type Kind = 'evidence' | 'note' | 'event';
const ITEM_ACTION = /^(evidence|note|event)_(added|recorded|edited|removed)$/;

/** Re-checks the chain and compares the case's current contents with what the log recorded. */
export function verifyCustody(c: InvestigationCase): CustodyVerification {
  const log = c.custody ?? [];
  const problems: CustodyProblem[] = [];
  if (log.length === 0) return { intact: false, entries: 0, head: null, startedAt: null, fullHistory: false, problems: [{ type: 'no_log' }] };

  let prev = GENESIS;
  for (let i = 0; i < log.length; i++) {
    const e = log[i] as CustodyEntry;
    const { hash, ...rest } = e;
    if (e.seq !== i + 1 || e.prev !== prev || entryHash(rest) !== hash) {
      problems.push({ type: 'chain_broken', seq: i + 1 });
      break;
    }
    prev = hash;
  }

  // What the log says each item should look like now.
  const recorded = new Map<string, { kind: Kind; digest: string | null; removed: boolean }>();
  let caseState: string | null = null;
  for (const e of log) {
    const m = ITEM_ACTION.exec(e.action);
    if (m && e.subject) recorded.set(e.subject, { kind: m[1] as Kind, digest: e.digest, removed: m[2] === 'removed' });
    else if ((e.action === 'case_created' || e.action === 'custody_started' || e.action === 'case_edited') && e.digest) caseState = e.digest;
  }
  if (caseState && caseState !== caseDigest(c)) problems.push({ type: 'case_changed' });

  const current: Array<{ kind: Kind; id: string; digest: string }> = [
    ...c.evidence.map((e) => ({ kind: 'evidence' as Kind, id: e.id, digest: evidenceDigest(e) })),
    ...c.notes.map((n) => ({ kind: 'note' as Kind, id: n.id, digest: noteDigest(n) })),
    ...c.timeline.filter((x) => x.kind === 'event').map((ev) => ({ kind: 'event' as Kind, id: ev.id, digest: eventDigest(ev) })),
  ];
  const seen = new Set<string>();
  for (const item of current) {
    seen.add(item.id);
    const r = recorded.get(item.id);
    if (!r || r.removed || r.kind !== item.kind) problems.push({ type: 'unrecorded', kind: item.kind, subject: item.id });
    else if (r.digest !== item.digest) problems.push({ type: 'changed', kind: item.kind, subject: item.id });
  }
  for (const [id, r] of recorded) if (!r.removed && !seen.has(id)) problems.push({ type: 'missing', kind: r.kind, subject: id });

  const first = log[0] as CustodyEntry;
  return { intact: problems.length === 0, entries: log.length, head: (log[log.length - 1] as CustodyEntry).hash, startedAt: first.time, fullHistory: first.action === 'case_created', problems };
}
