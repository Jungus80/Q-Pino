import { describe, expect, it } from 'vitest';
import { computeConfidence } from './confidence';

const NOW = new Date('2026-09-10T00:00:00Z');

describe('computeConfidence', () => {
  it('scores a fully confirmed, freshly-verified record as Alta', () => {
    const result = computeConfidence(
      {
        fieldStatus: { manufacturer: 'Confirmado', model: 'Confirmado', age: 'Confirmado', count: 'Confirmado' },
        lastVerifiedAt: NOW.toISOString(),
      },
      NOW
    );
    expect(result.band).toBe('Alta');
    expect(result.score).toBeGreaterThan(85);
  });

  it('scores a fully unknown record as Baja', () => {
    const result = computeConfidence(
      {
        fieldStatus: { manufacturer: 'Desconocido', model: 'Desconocido', age: 'Desconocido', count: 'Desconocido' },
        lastVerifiedAt: NOW.toISOString(),
      },
      NOW
    );
    expect(result.band).toBe('Baja');
    expect(result.score).toBeLessThan(40);
  });

  it('decays with staleness', () => {
    const fresh = computeConfidence(
      { fieldStatus: { manufacturer: 'Reportado', model: 'Reportado', age: 'Reportado', count: 'Reportado' }, lastVerifiedAt: NOW.toISOString() },
      NOW
    );
    const stale = computeConfidence(
      {
        fieldStatus: { manufacturer: 'Reportado', model: 'Reportado', age: 'Reportado', count: 'Reportado' },
        lastVerifiedAt: new Date(NOW.getTime() - 400 * 86_400_000).toISOString(),
      },
      NOW
    );
    expect(stale.score).toBeLessThan(fresh.score);
  });

  it('rewards more independent confirmations with diminishing returns', () => {
    const one = computeConfidence(
      { fieldStatus: { manufacturer: 'Reportado', model: 'Reportado', age: 'Reportado', count: 'Reportado' }, lastVerifiedAt: NOW.toISOString(), independentConfirmations: 1 },
      NOW
    );
    const three = computeConfidence(
      { fieldStatus: { manufacturer: 'Reportado', model: 'Reportado', age: 'Reportado', count: 'Reportado' }, lastVerifiedAt: NOW.toISOString(), independentConfirmations: 3 },
      NOW
    );
    expect(three.score).toBeGreaterThan(one.score);
  });
});
