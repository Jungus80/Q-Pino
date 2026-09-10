import { describe, expect, it } from 'vitest';
import { reconcileCount } from './fleet';

describe('reconcileCount', () => {
  it('accepts the incoming count when nothing exists yet', () => {
    const result = reconcileCount(null, { count: 3, status: 'Reportado', observedAt: '2026-01-01' });
    expect(result).toEqual({ count: 3, status: 'Reportado', conflict: false });
  });

  it('never sums — two independent reports of the same count stay at that count', () => {
    const existing = { count: 2, status: 'Reportado' as const, observedAt: '2026-01-01' };
    const incoming = { count: 2, status: 'Reportado' as const, observedAt: '2026-02-01' };
    const result = reconcileCount(existing, incoming);
    expect(result.count).toBe(2);
    expect(result.conflict).toBe(false);
  });

  it('upgrades status when a matching count is confirmed more strongly', () => {
    const existing = { count: 2, status: 'Estimado' as const, observedAt: '2026-01-01' };
    const incoming = { count: 2, status: 'Confirmado' as const, observedAt: '2026-01-02' };
    const result = reconcileCount(existing, incoming);
    expect(result.status).toBe('Confirmado');
  });

  it('flags a conflict when counts disagree, and picks the better-evidenced one', () => {
    const existing = { count: 2, status: 'Reportado' as const, observedAt: '2026-01-01' };
    const incoming = { count: 4, status: 'Estimado' as const, observedAt: '2026-02-01' };
    const result = reconcileCount(existing, incoming);
    expect(result.conflict).toBe(true);
    expect(result.count).toBe(2); // Reportado beats Estimado
  });

  it('breaks a same-status conflict by recency', () => {
    const existing = { count: 2, status: 'Reportado' as const, observedAt: '2026-01-01' };
    const incoming = { count: 4, status: 'Reportado' as const, observedAt: '2026-02-01' };
    const result = reconcileCount(existing, incoming);
    expect(result.conflict).toBe(true);
    expect(result.count).toBe(4);
  });
});
