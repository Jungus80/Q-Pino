import { describe, expect, it } from 'vitest';
import { assignToSlot, hasHardConflict, matchScore, type AssetSlot, type NewAssetClaim } from './asset';

function slot(overrides: Partial<AssetSlot> = {}): AssetSlot {
  return {
    id: 's1',
    manufacturer: null,
    model: null,
    serial: null,
    installYearLo: null,
    installYearHi: null,
    statusManufacturer: 'Desconocido',
    statusModel: 'Desconocido',
    statusAge: 'Desconocido',
    whichUnit: null,
    catalogModelId: null,
    ...overrides,
  };
}

function claim(overrides: Partial<NewAssetClaim> = {}): NewAssetClaim {
  return {
    manufacturer: null,
    model: null,
    serial: null,
    installYearLo: null,
    installYearHi: null,
    statusManufacturer: 'Desconocido',
    statusModel: 'Desconocido',
    statusAge: 'Desconocido',
    whichUnit: null,
    catalogModelId: null,
    ...overrides,
  };
}

describe('hasHardConflict', () => {
  it('blocks on a serial mismatch', () => {
    expect(hasHardConflict(claim({ serial: 'ABC123' }), slot({ serial: 'XYZ999' }))).toBe(true);
  });

  it('blocks on a confident manufacturer mismatch', () => {
    const result = hasHardConflict(
      claim({ manufacturer: 'Solara Health', statusManufacturer: 'Confirmado' }),
      slot({ manufacturer: 'Meridian Diagnostics', statusManufacturer: 'Confirmado' })
    );
    expect(result).toBe(true);
  });

  it('does not block on manufacturer mismatch when one side is only Estimado', () => {
    const result = hasHardConflict(
      claim({ manufacturer: 'Solara', statusManufacturer: 'Estimado' }),
      slot({ manufacturer: 'Meridian', statusManufacturer: 'Confirmado' })
    );
    expect(result).toBe(false);
  });

  it('blocks on non-overlapping confident install-year intervals', () => {
    const result = hasHardConflict(
      claim({ installYearLo: 2010, installYearHi: 2012, statusAge: 'Reportado' }),
      slot({ installYearLo: 2020, installYearHi: 2022, statusAge: 'Reportado' })
    );
    expect(result).toBe(true);
  });

  it('allows overlapping install-year intervals', () => {
    const result = hasHardConflict(
      claim({ installYearLo: 2016, installYearHi: 2020, statusAge: 'Reportado' }),
      slot({ installYearLo: 2018, installYearHi: 2022, statusAge: 'Reportado' })
    );
    expect(result).toBe(false);
  });
});

describe('matchScore', () => {
  it('gives a perfect score for an exact serial match', () => {
    expect(matchScore(claim({ serial: 'SN-42' }), slot({ serial: 'SN-42' }))).toBe(1);
  });

  it('scores a recognized-same-catalog-model claim highly', () => {
    const score = matchScore(
      claim({ catalogModelId: 'solara-magna-x', manufacturer: 'Solara Health' }),
      slot({ catalogModelId: 'solara-magna-x', manufacturer: 'Solara Health' })
    );
    expect(score).toBeGreaterThan(0.8);
  });

  it('scores two unrelated bare claims (no shared fields) at 0', () => {
    expect(matchScore(claim(), slot())).toBe(0);
  });
});

describe('assignToSlot', () => {
  it('matches a claim to the only compatible slot', () => {
    const slots = [slot({ id: 's1', catalogModelId: 'solara-magna-x', manufacturer: 'Solara Health' })];
    const result = assignToSlot(claim({ catalogModelId: 'solara-magna-x', manufacturer: 'Solara Health' }), slots);
    expect(result).toEqual({ kind: 'matched', slotId: 's1', score: expect.any(Number) });
  });

  it('refuses to guess when two slots are near-equally plausible', () => {
    const slots = [
      slot({ id: 's1', installYearLo: 2017, installYearHi: 2019, statusAge: 'Reportado' }),
      slot({ id: 's2', installYearLo: 2017, installYearHi: 2019, statusAge: 'Reportado' }),
    ];
    const result = assignToSlot(claim({ installYearLo: 2016, installYearHi: 2020, statusAge: 'Estimado' }), slots);
    expect(result.kind).toBe('ambiguous');
    if (result.kind === 'ambiguous') {
      expect(result.candidateIds.sort()).toEqual(['s1', 's2']);
    }
  });

  it('returns no_match when every candidate is hard-conflicted', () => {
    const slots = [slot({ id: 's1', serial: 'SN-1' })];
    const result = assignToSlot(claim({ serial: 'SN-2' }), slots);
    expect(result).toEqual({ kind: 'no_match' });
  });

  it('returns no_match when there are no slots at all', () => {
    expect(assignToSlot(claim({ manufacturer: 'Solara' }), [])).toEqual({ kind: 'no_match' });
  });

  it('picks the clearly better of two candidates when one is much stronger', () => {
    const slots = [
      slot({ id: 'weak', whichUnit: 'sala 2' }),
      slot({ id: 'strong', catalogModelId: 'solara-magna-x', manufacturer: 'Solara Health', model: 'Solara Magna X' }),
    ];
    const result = assignToSlot(
      claim({ catalogModelId: 'solara-magna-x', manufacturer: 'Solara Health', model: 'Solara Magna X' }),
      slots
    );
    expect(result).toEqual({ kind: 'matched', slotId: 'strong', score: expect.any(Number) });
  });
});
