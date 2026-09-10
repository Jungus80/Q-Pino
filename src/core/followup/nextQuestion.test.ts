import { describe, expect, it } from 'vitest';
import { computeNextQuestion } from './nextQuestion';
import type { NormalizedEquipment } from '../schema/observation';

function eq(overrides: Partial<NormalizedEquipment> = {}): NormalizedEquipment {
  return {
    modality: 'MR',
    count: 2,
    manufacturer: 'Solara Health',
    model: 'Solara Magna X',
    ageYearsMin: null,
    ageYearsMax: null,
    installYear: 2018,
    serial: null,
    whichUnit: null,
    fieldStatus: { manufacturer: 'Reportado', model: 'Reportado', age: 'Reportado', count: 'Reportado' },
    evidence: [],
    installYearLo: 2018,
    installYearHi: 2018,
    catalogModelId: null,
    ...overrides,
  };
}

describe('computeNextQuestion', () => {
  it('returns null when nothing is missing', () => {
    expect(computeNextQuestion([eq()])).toBeNull();
  });

  it('prioritizes manufacturer over other missing fields', () => {
    const result = computeNextQuestion([
      eq({ fieldStatus: { manufacturer: 'Desconocido', model: 'Desconocido', age: 'Reportado', count: 'Reportado' } }),
    ]);
    expect(result?.field).toBe('manufacturer');
  });

  it('falls back to age when manufacturer is known but age is missing', () => {
    const result = computeNextQuestion([
      eq({ fieldStatus: { manufacturer: 'Reportado', model: 'Desconocido', age: 'Desconocido', count: 'Reportado' } }),
    ]);
    expect(result?.field).toBe('age');
  });

  it('picks the highest-value missing field across multiple equipment items', () => {
    const result = computeNextQuestion([
      eq({ modality: 'CT', fieldStatus: { manufacturer: 'Reportado', model: 'Desconocido', age: 'Reportado', count: 'Reportado' } }),
      eq({ modality: 'MR', fieldStatus: { manufacturer: 'Desconocido', model: 'Reportado', age: 'Reportado', count: 'Reportado' } }),
    ]);
    expect(result?.field).toBe('manufacturer');
    expect(result?.equipmentIndex).toBe(1);
  });

  it('returns null for an empty equipment list', () => {
    expect(computeNextQuestion([])).toBeNull();
  });
});
