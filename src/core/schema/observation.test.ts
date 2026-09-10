import { describe, expect, it } from 'vitest';
import { extractedObservationSchema } from './observation';

function rawEquipment(overrides: Record<string, unknown> = {}) {
  return {
    modality: 'MR',
    count: -1,
    manufacturer: '',
    model: '',
    ageYearsMin: -1,
    ageYearsMax: -1,
    installYear: -1,
    serial: '',
    whichUnit: '',
    fieldStatus: { manufacturer: 'Desconocido', model: 'Desconocido', age: 'Desconocido', count: 'Desconocido' },
    evidence: [],
    ...overrides,
  };
}

function rawObservation(equipment: Record<string, unknown>[] = []) {
  return {
    institution: { name: '', site: '', city: '', country: '', evidence: [] },
    equipment,
    comments: '',
    missing: [],
  };
}

describe('extractedObservationSchema — sentinel handling', () => {
  it('converts empty-string sentinels to null', () => {
    const result = extractedObservationSchema.parse(rawObservation());
    expect(result.institution.name).toBeNull();
    expect(result.institution.city).toBeNull();
    expect(result.comments).toBeNull();
  });

  it('converts -1 sentinels to null on numeric fields', () => {
    const result = extractedObservationSchema.parse(rawObservation([rawEquipment()]));
    expect(result.equipment[0].count).toBeNull();
    expect(result.equipment[0].ageYearsMin).toBeNull();
    expect(result.equipment[0].installYear).toBeNull();
  });

  it('passes through real values unchanged', () => {
    const result = extractedObservationSchema.parse(
      rawObservation([rawEquipment({ count: 2, manufacturer: 'Solara Health', installYear: 2018 })])
    );
    expect(result.equipment[0].count).toBe(2);
    expect(result.equipment[0].manufacturer).toBe('Solara Health');
    expect(result.equipment[0].installYear).toBe(2018);
  });

  it('rejects an out-of-range value that is not the -1 sentinel', () => {
    expect(() => extractedObservationSchema.parse(rawObservation([rawEquipment({ installYear: 500 })]))).toThrow();
  });
});
