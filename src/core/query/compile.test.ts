import { describe, expect, it } from 'vitest';
import { compileStructuralQuery, applyComputedFilters, aggregateQuery, type QueryEquipmentRow } from './compile';
import { EMPTY_QUERY_DSL, type QueryDsl } from './dsl';

const NOW = new Date('2026-09-10T00:00:00Z');

function row(overrides: Partial<QueryEquipmentRow> = {}): QueryEquipmentRow {
  return {
    institutionId: 'inst-1',
    institutionName: 'DemoCare Pacific',
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
    countryIso: 'BR',
    city: 'São Paulo',
    ...overrides,
  };
}

describe('compileStructuralQuery', () => {
  it('binds every DSL value as a parameter, never as SQL text', () => {
    const dsl: QueryDsl = { ...EMPTY_QUERY_DSL, country: ['BR'], modality: ['MR'] };
    const { sql, params } = compileStructuralQuery(dsl);
    expect(sql).not.toContain('BR');
    expect(sql).not.toContain("'MR'");
    expect(sql).toContain('i.country_iso IN (?)');
    expect(sql).toContain('e.modality IN (?)');
    expect(params).toEqual(['BR', 'MR']);
  });

  it('produces no WHERE clause for an empty DSL', () => {
    const { sql, params } = compileStructuralQuery(EMPTY_QUERY_DSL);
    expect(sql).not.toContain('WHERE');
    expect(params).toEqual([]);
  });

  it('rejects an attempted SQL-injection payload by treating it as a plain string parameter', () => {
    const dsl: QueryDsl = { ...EMPTY_QUERY_DSL, city: ["'; DROP TABLE institutions; --"] };
    const { sql, params } = compileStructuralQuery(dsl);
    expect(sql).toContain('i.city IN (?)');
    expect(sql).not.toContain('DROP TABLE');
    expect(params).toEqual(["'; DROP TABLE institutions; --"]);
  });
});

describe('applyComputedFilters', () => {
  it('filters by computed age range', () => {
    const rows = [row({ installYearLo: 2016, installYearHi: 2016 }), row({ installYearLo: 2024, installYearHi: 2024 })];
    const result = applyComputedFilters(rows, { ...EMPTY_QUERY_DSL, minAge: 5 }, NOW);
    expect(result).toHaveLength(1);
    expect(result[0].installYearLo).toBe(2016);
  });

  it('filters incomplete records', () => {
    const rows = [row(), row({ statusModel: 'Desconocido' })];
    const result = applyComputedFilters(rows, { ...EMPTY_QUERY_DSL, incomplete: true }, NOW);
    expect(result).toHaveLength(1);
    expect(result[0].statusModel).toBe('Desconocido');
  });

  it('filters stale records (>365 days unverified)', () => {
    const rows = [row({ lastVerifiedAt: '2026-08-01T00:00:00Z' }), row({ lastVerifiedAt: '2024-01-01T00:00:00Z' })];
    const result = applyComputedFilters(rows, { ...EMPTY_QUERY_DSL, stale: true }, NOW);
    expect(result).toHaveLength(1);
    expect(result[0].lastVerifiedAt).toBe('2024-01-01T00:00:00Z');
  });

  it('filters by minimum confidence', () => {
    const rows = [
      row({ statusManufacturer: 'Confirmado', statusModel: 'Confirmado', statusAge: 'Confirmado', statusCount: 'Confirmado' }),
      row({ statusManufacturer: 'Desconocido', statusModel: 'Desconocido', statusAge: 'Desconocido', statusCount: 'Desconocido' }),
    ];
    const result = applyComputedFilters(rows, { ...EMPTY_QUERY_DSL, minConfidence: 50 }, NOW);
    expect(result).toHaveLength(1);
  });
});

describe('aggregateQuery', () => {
  it('returns null when no groupBy is set', () => {
    expect(aggregateQuery([row()], EMPTY_QUERY_DSL, NOW)).toBeNull();
  });

  it('groups by modality and sums counts', () => {
    const rows = [row({ modality: 'MR', count: 2 }), row({ modality: 'MR', count: 1 }), row({ modality: 'CT', count: 3 })];
    const groups = aggregateQuery(rows, { ...EMPTY_QUERY_DSL, groupBy: 'modality', metric: 'count' }, NOW);
    expect(groups).toEqual([
      { key: 'MR', value: 3 },
      { key: 'CT', value: 3 },
    ]);
  });

  it('groups by country and averages age', () => {
    const rows = [
      row({ countryIso: 'BR', installYearLo: 2016, installYearHi: 2016 }),
      row({ countryIso: 'BR', installYearLo: 2020, installYearHi: 2020 }),
    ];
    const groups = aggregateQuery(rows, { ...EMPTY_QUERY_DSL, groupBy: 'country', metric: 'avgAge' }, NOW);
    expect(groups).toEqual([{ key: 'BR', value: 8 }]);
  });
});
