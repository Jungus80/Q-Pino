import { describe, expect, it } from 'vitest';
import { normalizeObservation } from './pipeline';
import type { ExtractedObservation } from '../schema/observation';

const NOW = new Date('2026-09-10T00:00:00Z');

function baseExtraction(overrides: Partial<ExtractedObservation> = {}): ExtractedObservation {
  return {
    institution: {
      name: 'Hospital DemoCare Pacific',
      site: null,
      city: 'Ciudad de Panamá',
      country: 'Panamá',
      evidence: ['Hospital DemoCare Pacific', 'Ciudad de Panamá'],
    },
    equipment: [],
    comments: null,
    missing: [],
    ...overrides,
  };
}

const TRANSCRIPT =
  'Estoy en Hospital DemoCare Pacific, en Ciudad de Panamá. Tienen dos resonadores Solara, uno parece de unos ocho años.';

describe('normalizeObservation — institution', () => {
  it('keeps institution fields whose evidence is anchored in the transcript', () => {
    const { institution } = normalizeObservation(baseExtraction(), TRANSCRIPT, NOW);
    expect(institution.name).toBe('Hospital DemoCare Pacific');
    expect(institution.countryIso).toBe('PA');
    expect(institution.region).toBe('LATAM');
  });

  it('discards the institution name when its evidence is not in the transcript (hallucination guard)', () => {
    const extraction = baseExtraction({
      institution: {
        name: 'Some Other Hospital',
        site: null,
        city: null,
        country: null,
        evidence: ['text that never appeared'],
      },
    });
    const { institution } = normalizeObservation(extraction, TRANSCRIPT, NOW);
    expect(institution.name).toBeNull();
  });
});

describe('normalizeObservation — equipment', () => {
  it('discards an unanchored manufacturer value', () => {
    const extraction = baseExtraction({
      equipment: [
        {
          modality: 'MR',
          count: 2,
          manufacturer: 'Meridian Diagnostics', // not actually in the transcript
          model: null,
          ageYearsMin: null,
          ageYearsMax: null,
          installYear: null,
          serial: null,
          whichUnit: null,
          fieldStatus: { manufacturer: 'Reportado', model: 'Desconocido', age: 'Desconocido', count: 'Reportado' },
          evidence: ['dos resonadores Solara'],
        },
      ],
    });
    const { equipment } = normalizeObservation(extraction, TRANSCRIPT, NOW);
    expect(equipment[0].manufacturer).toBeNull();
  });

  it('enriches manufacturer via the catalog when a model is anchored and recognized', () => {
    const extraction = baseExtraction({
      equipment: [
        {
          modality: 'MR',
          count: 1,
          manufacturer: null,
          model: 'Solara Magna X',
          ageYearsMin: null,
          ageYearsMax: null,
          installYear: null,
          serial: null,
          whichUnit: null,
          fieldStatus: { manufacturer: 'Desconocido', model: 'Reportado', age: 'Desconocido', count: 'Reportado' },
          evidence: ['un Solara Magna X'],
        },
      ],
    });
    const transcript = TRANSCRIPT + ' Es un Solara Magna X.';
    const { equipment } = normalizeObservation(extraction, transcript, NOW);
    expect(equipment[0].manufacturer).toBe('Solara Health');
    expect(equipment[0].catalogModelId).toBe('solara-magna-x');
  });

  it('classifies a hedged age as Estimado and computes an install-year interval', () => {
    const extraction = baseExtraction({
      equipment: [
        {
          modality: 'MR',
          count: 1,
          manufacturer: null,
          model: null,
          ageYearsMin: 8,
          ageYearsMax: 8,
          installYear: null,
          serial: null,
          whichUnit: 'uno de los resonadores',
          fieldStatus: { manufacturer: 'Desconocido', model: 'Desconocido', age: 'Reportado', count: 'Desconocido' },
          evidence: ['uno parece de unos ocho años'],
        },
      ],
    });
    const { equipment } = normalizeObservation(extraction, TRANSCRIPT, NOW);
    expect(equipment[0].fieldStatus.age).toBe('Estimado');
    expect(equipment[0].installYearLo).toBe(2016);
    expect(equipment[0].installYearHi).toBe(2020);
  });
});
