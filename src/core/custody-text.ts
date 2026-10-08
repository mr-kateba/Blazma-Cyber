// Words for chain-of-custody problems, shared by case reports (main) and the Cases page
// (renderer) — kept apart from core/custody.ts so the renderer never bundles node:crypto.

import type { CustodyProblem } from '../shared/api';
import type { Vars } from './i18n';

export function problemText(p: CustodyProblem, t: (key: string, vars?: Vars) => string): string {
  if (p.type === 'no_log' || p.type === 'case_changed') return t(`custody.problem.${p.type}`);
  if (p.type === 'chain_broken') return t('custody.problem.chain_broken', { seq: p.seq });
  return t(`custody.problem.${p.type}`, { kind: t(`custody.kind.${p.kind}`), subject: p.subject });
}
