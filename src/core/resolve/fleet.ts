import type { FieldStatus } from '../schema/observation';

const STATUS_RANK: Record<FieldStatus, number> = { Confirmado: 3, Reportado: 2, Estimado: 1, Desconocido: 0 };

export type FleetCount = {
  count: number;
  status: FieldStatus;
  observedAt: string; // ISO date
};

export type FleetReconciliation = {
  count: number;
  status: FieldStatus;
  conflict: boolean;
};

/**
 * Reconciles a fleet-level count claim ("tienen tres resonadores") with whatever count is
 * already on record. Per the plan: two observers reporting "3 RM" at the same hospital are
 * describing the *same* 3 — counts are never summed, only compared. Equal counts keep the
 * better-evidenced (or, tied, more recent) status; a disagreement is flagged as a conflict
 * so the UI can surface it, and resolves to whichever count has the stronger claim.
 */
export function reconcileCount(existing: FleetCount | null, incoming: FleetCount): FleetReconciliation {
  if (!existing) return { count: incoming.count, status: incoming.status, conflict: false };

  if (existing.count === incoming.count) {
    const useIncoming =
      STATUS_RANK[incoming.status] > STATUS_RANK[existing.status] ||
      (STATUS_RANK[incoming.status] === STATUS_RANK[existing.status] && incoming.observedAt >= existing.observedAt);
    const winner = useIncoming ? incoming : existing;
    return { count: winner.count, status: winner.status, conflict: false };
  }

  // Disagreement: the higher-evidenced claim wins the *displayed* count, tied breaks to
  // the more recent one — but this is always surfaced as a conflict, never silently
  // resolved, since one of the two observers is simply wrong.
  const incomingWins =
    STATUS_RANK[incoming.status] > STATUS_RANK[existing.status] ||
    (STATUS_RANK[incoming.status] === STATUS_RANK[existing.status] && incoming.observedAt >= existing.observedAt);
  const winner = incomingWins ? incoming : existing;
  return { count: winner.count, status: winner.status, conflict: true };
}
