import { describe, expect, it } from 'vitest';
import { ageMidpointYears, extractCalendarYearFromEvidence, parseAge } from './age';

const NOW = new Date('2026-09-10T00:00:00Z');

describe('parseAge', () => {
  it('treats a single approximate figure as Estimado with exact year calculation', () => {
    const result = parseAge(
      { ageYearsMin: 8, ageYearsMax: 8, installYear: null, evidenceText: 'unos ocho años' },
      NOW
    );
    expect(result.status).toBe('Estimado');
    expect(result.installYearLo).toBe(2018); // 2026 - 8
    expect(result.installYearHi).toBe(2018); // 2026 - 8
  });

  it('treats an explicit range as Estimado', () => {
    const result = parseAge(
      { ageYearsMin: 8, ageYearsMax: 10, installYear: null, evidenceText: '8 to 10 years old' },
      NOW
    );
    expect(result.status).toBe('Estimado');
    expect(result.installYearLo).toBe(2016);
    expect(result.installYearHi).toBe(2018);
  });

  it('treats an explicit install year as Reportado by default', () => {
    const result = parseAge(
      { ageYearsMin: null, ageYearsMax: null, installYear: 2019, evidenceText: 'instalado en 2019' },
      NOW
    );
    expect(result.status).toBe('Reportado');
    expect(result.installYearLo).toBe(2019);
    expect(result.installYearHi).toBe(2019);
  });

  it('treats an install year backed by plate/verification language as Confirmado', () => {
    const result = parseAge(
      {
        ageYearsMin: null,
        ageYearsMax: null,
        installYear: 2019,
        evidenceText: 'confirmé en la placa que dice 2019',
      },
      NOW
    );
    expect(result.status).toBe('Confirmado');
  });

  it('returns Desconocido when nothing is provided', () => {
    const result = parseAge({ ageYearsMin: null, ageYearsMax: null, installYear: null, evidenceText: null }, NOW);
    expect(result.status).toBe('Desconocido');
    expect(result.installYearLo).toBeNull();
  });

  it('uses a spoken calendar year even when the model filled ageYears instead of installYear', () => {
    const result = parseAge(
      {
        ageYearsMin: 60,
        ageYearsMax: 60,
        installYear: null,
        evidenceText: 'Es un equipo marca Samsung de modelo FBA 24 del año 2005.',
      },
      NOW
    );
    expect(result.status).toBe('Reportado');
    expect(result.installYearLo).toBe(2005);
    expect(result.installYearHi).toBe(2005);
  });

  it('prefers the spoken calendar year over a conflicting structured installYear', () => {
    const result = parseAge(
      {
        ageYearsMin: null,
        ageYearsMax: null,
        installYear: 1966,
        evidenceText: 'instalado en 2005',
      },
      NOW
    );
    expect(result.installYearLo).toBe(2005);
    expect(result.status).toBe('Reportado');
  });
});

describe('extractCalendarYearFromEvidence', () => {
  it('does not treat a spoken age-in-years as a calendar year', () => {
    expect(extractCalendarYearFromEvidence('unos ocho años', 2026)).toBeNull();
  });
});

describe('ageMidpointYears', () => {
  it('computes the midpoint age from an install-year interval', () => {
    expect(ageMidpointYears(2016, 2018, NOW)).toBe(9); // midpoint year 2017 -> age 9
  });

  it('returns null when both bounds are null', () => {
    expect(ageMidpointYears(null, null, NOW)).toBeNull();
  });
});
