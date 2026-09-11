import { describe, expect, it } from 'vitest';
import { buildDeterministicAnswer, computeQueryAnswer, formatAnswerForSummary, summaryIsGrounded } from './answer';
import { EMPTY_QUERY_DSL, type QueryDsl } from './dsl';
import type { QueryEquipmentRow } from './compile';

const NOW = new Date('2026-09-10T00:00:00Z');

function row(overrides: Partial<QueryEquipmentRow> = {}): QueryEquipmentRow {
  return {
    institutionId: 'inst-1',
    institutionName: 'Hospital Andino Sur',
    modality: 'MR',
    manufacturer: 'Solara Health',
    count: 1,
    installYearLo: 2016,
    installYearHi: 2016,
    statusManufacturer: 'Reportado',
    statusModel: 'Reportado',
    statusAge: 'Reportado',
    statusCount: 'Reportado',
    lastVerifiedAt: '2026-08-01T00:00:00Z',
    countryIso: 'CO',
    city: 'Bogotá',
    region: 'LATAM',
    ...overrides,
  };
}

const ROWS = [
  row({ institutionId: 'a', institutionName: 'Hospital Andino Sur', countryIso: 'CO', count: 2, installYearLo: 2015, installYearHi: 2015 }),
  row({ institutionId: 'a', institutionName: 'Hospital Andino Sur', countryIso: 'CO', modality: 'CT', installYearLo: 2011, installYearHi: 2011 }),
  row({ institutionId: 'b', institutionName: 'Clínica Litoral Norte', countryIso: 'BR', city: 'São Paulo', modality: 'US', count: 4, installYearLo: 2021, installYearHi: 2021 }),
];
const dsl = (overrides: Partial<QueryDsl>): QueryDsl => ({ ...EMPTY_QUERY_DSL, ...overrides });

describe('computeQueryAnswer', () => {
  it('computes the requested metric even without a breakdown — regression for an invented average', () => {
    // Structural filters (modality here) are applied by SQL before this runs.
    const mrRows = ROWS.filter((r) => r.modality === 'MR');
    const answer = computeQueryAnswer(mrRows, dsl({ modality: ['MR'], metric: 'avgAge' }), NOW);
    expect(answer.groups).toBeNull();
    expect(answer.overall).toBe(11);
    expect(answer.equipmentTotal).toBe(2);
  });

  it('applies top-N to groups but reports how many groups exist', () => {
    const answer = computeQueryAnswer(ROWS, dsl({ groupBy: 'country', limit: 1 }), NOW);
    expect(answer.groups).toHaveLength(1);
    expect(answer.groupsTotal).toBe(2);
    expect(answer.groups?.[0]).toMatchObject({ label: 'Brasil', value: 4 });
  });

  it('lists clients by equipment count, with a per-modality breakdown', () => {
    const answer = computeQueryAnswer(ROWS, EMPTY_QUERY_DSL, NOW);
    expect(answer.institutions.map((i) => [i.name, i.equipmentCount])).toEqual([
      ['Clínica Litoral Norte', 4],
      ['Hospital Andino Sur', 3],
    ]);
    expect(answer.byModality).toEqual([
      { modality: 'US', count: 4 },
      { modality: 'MR', count: 2 },
      { modality: 'CT', count: 1 },
    ]);
  });
});

describe('buildDeterministicAnswer', () => {
  it('says "no results" with the filters when nothing matches', () => {
    const d = dsl({ country: ['PE'], modality: ['MR'] });
    const text = buildDeterministicAnswer(computeQueryAnswer([], d, NOW), d);
    expect(text).toContain('No encontré');
    expect(text).toContain('Perú');
  });

  it('names groups with readable labels and units', () => {
    const d = dsl({ groupBy: 'country', metric: 'avgAge' });
    const text = buildDeterministicAnswer(computeQueryAnswer(ROWS, d, NOW), d);
    expect(text).toContain('Colombia: 12.3 años');
    expect(text).not.toMatch(/\bCO\b/);
  });

  it('answers a single-client question with what that client has', () => {
    const d = dsl({ institution: ['Hospital Andino Sur'] });
    const text = buildDeterministicAnswer(computeQueryAnswer(ROWS.slice(0, 2), d, NOW), d);
    expect(text).toContain('Hospital Andino Sur (2 resonadores y 1 tomógrafo)');
  });
});

describe('summaryIsGrounded', () => {
  const d = dsl({ groupBy: 'country' });
  const answer = computeQueryAnswer(ROWS, d, NOW);
  const block = formatAnswerForSummary(answer, d);

  it('gives the model the unit and the applied filters', () => {
    expect(block).toContain('Métrica pedida: Cantidad de equipos');
    expect(block).toContain('Filtros aplicados: ninguno');
    expect(block).toContain('- Brasil: 4 equipos');
  });

  it('accepts prose whose numbers all come from the data', () => {
    expect(summaryIsGrounded('Tenemos 7 equipos en 2 clientes: 4 en Brasil y 3 en Colombia.', block, 'Equipos por país')).toBe(true);
  });

  it('rejects an invented figure', () => {
    expect(summaryIsGrounded('Tenemos 9 equipos, la mayoría en Brasil.', block, 'Equipos por país')).toBe(false);
  });

  it('allows rounding of a computed decimal', () => {
    const avg = dsl({ metric: 'avgAge' });
    const avgBlock = formatAnswerForSummary(computeQueryAnswer(ROWS, avg, NOW), avg);
    expect(avgBlock).toContain('8.1 años');
    expect(summaryIsGrounded('Los equipos tienen en promedio unos 8 años.', avgBlock, 'antigüedad promedio')).toBe(true);
  });

  it('rejects an empty reply', () => {
    expect(summaryIsGrounded('  ', block, 'Equipos por país')).toBe(false);
  });
});
