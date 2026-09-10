import type { FieldStatus } from '../schema/observation';

const STATUS_RANK: Record<FieldStatus, number> = { Confirmado: 3, Reportado: 2, Estimado: 1, Desconocido: 0 };

export type ValueClaim<T> = {
  value: T;
  status: FieldStatus;
  observedAt: string; // ISO date
};

export type ConsolidationResult<T> = {
  value: T;
  status: FieldStatus;
  changed: boolean; // true if `incoming` won over `current`
};

/**
 * Decides which of two claims for the *same field* wins: the better-evidenced one, ties
 * broken by recency. Used when a new observation's claim lands on a piece of equipment
 * that already has a value for that field — this is the two-claim building block; ranking
 * more than two claims (once an equipment record accumulates a longer history) reduces to
 * repeated pairwise folds with this same rule, so no separate n-way implementation is
 * needed yet.
 */
export function chooseBetween<T>(current: ValueClaim<T> | null, incoming: ValueClaim<T>): ConsolidationResult<T> {
  if (!current) return { value: incoming.value, status: incoming.status, changed: true };

  const incomingWins =
    STATUS_RANK[incoming.status] > STATUS_RANK[current.status] ||
    (STATUS_RANK[incoming.status] === STATUS_RANK[current.status] && incoming.observedAt >= current.observedAt);

  return incomingWins
    ? { value: incoming.value, status: incoming.status, changed: true }
    : { value: current.value, status: current.status, changed: false };
}
