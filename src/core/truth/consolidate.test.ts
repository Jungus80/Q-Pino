import { describe, expect, it } from 'vitest';
import { chooseBetween } from './consolidate';

describe('chooseBetween', () => {
  it('accepts the incoming claim when nothing exists yet', () => {
    const result = chooseBetween(null, { value: 'Solara Health', status: 'Reportado', observedAt: '2026-01-01' });
    expect(result).toEqual({ value: 'Solara Health', status: 'Reportado', changed: true });
  });

  it('keeps the current value when it is better-evidenced', () => {
    const current = { value: 'Solara Health', status: 'Confirmado' as const, observedAt: '2026-01-01' };
    const incoming = { value: 'Meridian Diagnostics', status: 'Estimado' as const, observedAt: '2026-02-01' };
    const result = chooseBetween(current, incoming);
    expect(result.value).toBe('Solara Health');
    expect(result.changed).toBe(false);
  });

  it('replaces the current value when the incoming claim is better-evidenced', () => {
    const current = { value: 'Solara Health', status: 'Estimado' as const, observedAt: '2026-01-01' };
    const incoming = { value: 'Solara Health', status: 'Confirmado' as const, observedAt: '2026-02-01' };
    const result = chooseBetween(current, incoming);
    expect(result.status).toBe('Confirmado');
    expect(result.changed).toBe(true);
  });

  it('breaks a tie in status by recency, favoring the newer claim', () => {
    const current = { value: 'A', status: 'Reportado' as const, observedAt: '2026-01-01' };
    const incoming = { value: 'B', status: 'Reportado' as const, observedAt: '2026-02-01' };
    const result = chooseBetween(current, incoming);
    expect(result.value).toBe('B');
    expect(result.changed).toBe(true);
  });
});
