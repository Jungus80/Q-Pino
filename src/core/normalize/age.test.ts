import { describe, expect, it } from 'vitest';
import { ageMidpointYears, parseAge } from './age';

const NOW = new Date('2026-09-10T00:00:00Z');

describe('parseAge', () => {
  it('treats a single approximate figure as Estimado with a +/-2yr band', () => {
    const result = parseAge(
      { ageYearsMin: 8, ageYearsMax: 8, installYear: null, evidenceText: 'unos ocho años' },
      NOW
    );
    expect(result.status).toBe('Estimado');
    expect(result.installYearLo).toBe(2016); // 2026 - (8+2)
    expect(result.installYearHi).toBe(2020); // 2026 - (8-2)
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
});

describe('ageMidpointYears', () => {
  it('computes the midpoint age from an install-year interval', () => {
    expect(ageMidpointYears(2016, 2018, NOW)).toBe(9); // midpoint year 2017 -> age 9
  });

  it('returns null when both bounds are null', () => {
    expect(ageMidpointYears(null, null, NOW)).toBeNull();
  });
});
