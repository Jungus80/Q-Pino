import { describe, expect, it } from 'vitest';
import { compileStructuralQuery, applyComputedFilters, aggregateQuery, type QueryEquipmentRow } from './compile';
import { EMPTY_QUERY_DSL, type QueryDsl } from './dsl';
import { computeDashboard } from '../score/dashboard';

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
    region: 'LATAM',
    ...overrides,
  };
}

const dsl = (overrides: Partial<QueryDsl>): QueryDsl => ({ ...EMPTY_QUERY_DSL, ...overrides });

describe('compileStructuralQuery', () => {
  it('binds every DSL value as a parameter, never as SQL text', () => {
    const { sql, params } = compileStructuralQuery(dsl({ country: ['BR'], modality: ['MR'] }));
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

  it('treats an attempted SQL-injection payload as a plain string parameter', () => {
    const { sql, params } = compileStructuralQuery(dsl({ country: ["'; DROP TABLE institutions; --"] }));
    expect(sql).toContain('i.country_iso IN (?)');
    expect(sql).not.toContain('DROP TABLE');
    expect(params).toEqual(["'; DROP TABLE institutions; --"]);
  });

  it('compiles a region to its member countries, with i.region only as a fallback', () => {
    const { sql, params } = compileStructuralQuery(dsl({ region: ['Sudamérica'] }));
    expect(sql).toContain('i.country_iso IN (');
    expect(params).toContain('BR');
    expect(params).toContain('CO');
    expect(params).not.toContain('MX');
    expect(params[params.length - 1]).toBe('Sudamérica');
  });

  it('leaves free-text fields (city, manufacturer, institution) out of SQL — they are matched in JS', () => {
    const { sql, params } = compileStructuralQuery(dsl({ city: ['Bogotá'], manufacturer: ['Solara Health'], institution: ['Andino'] }));
    expect(sql).not.toContain('WHERE');
    expect(params).toEqual([]);
  });
});

describe('applyComputedFilters', () => {
  it('filters by computed age range', () => {
    const rows = [row({ installYearLo: 2016, installYearHi: 2016 }), row({ installYearLo: 2024, installYearHi: 2024 })];
    const result = applyComputedFilters(rows, dsl({ minAge: 5 }), NOW);
    expect(result).toHaveLength(1);
    expect(result[0].installYearLo).toBe(2016);
  });

  it('computes age from one known bound, like the Dashboard does', () => {
    const result = applyComputedFilters([row({ installYearLo: 2010, installYearHi: null })], dsl({ minAge: 10 }), NOW);
    expect(result).toHaveLength(1);
  });

  it('uses the Dashboard definition of incomplete (manufacturer/model/age unknown)', () => {
    const rows = [row({ id: 'a' } as never), row({ statusModel: 'Desconocido' }), row({ statusCount: 'Desconocido' })];
    const result = applyComputedFilters(rows, dsl({ incomplete: true }), NOW);
    expect(result).toHaveLength(1);
    expect(result[0].statusModel).toBe('Desconocido');
  });

  it('treats staleness per client: a recently verified client is not stale because of one old record', () => {
    const rows = [
      row({ institutionId: 'fresh', lastVerifiedAt: '2026-08-01T00:00:00Z' }),
      row({ institutionId: 'fresh', lastVerifiedAt: '2024-01-01T00:00:00Z' }),
      row({ institutionId: 'old', lastVerifiedAt: '2024-01-01T00:00:00Z' }),
    ];
    const result = applyComputedFilters(rows, dsl({ stale: true }), NOW);
    expect(result.map((r) => r.institutionId)).toEqual(['old']);
  });

  it('filters by minimum confidence', () => {
    const rows = [
      row({ statusManufacturer: 'Confirmado', statusModel: 'Confirmado', statusAge: 'Confirmado', statusCount: 'Confirmado' }),
      row({ statusManufacturer: 'Desconocido', statusModel: 'Desconocido', statusAge: 'Desconocido', statusCount: 'Desconocido' }),
    ];
    expect(applyComputedFilters(rows, dsl({ minConfidence: 50 }), NOW)).toHaveLength(1);
  });

  it('filters by maximum confidence (low-confidence records)', () => {
    const rows = [
      row({ statusManufacturer: 'Confirmado', statusModel: 'Confirmado', statusAge: 'Confirmado', statusCount: 'Confirmado' }),
      row({ statusManufacturer: 'Desconocido', statusModel: 'Desconocido', statusAge: 'Desconocido', statusCount: 'Desconocido' }),
    ];
    const result = applyComputedFilters(rows, dsl({ maxConfidence: 39 }), NOW);
    expect(result).toHaveLength(1);
    expect(result[0].statusModel).toBe('Desconocido');
  });

  it('matches cities accent- and case-insensitively, including unresolved stored text', () => {
    const rows = [row({ city: 'sao paulo' }), row({ city: 'SÃO PAULO' }), row({ city: 'Lima' })];
    expect(applyComputedFilters(rows, dsl({ city: ['São Paulo'] }), NOW)).toHaveLength(2);
  });

  it('matches manufacturers through the catalog — regression for "equipos Solara" returning 0', () => {
    const rows = [row({ manufacturer: 'Solara Health' }), row({ manufacturer: 'solara medical' }), row({ manufacturer: 'Meridian Diagnostics' })];
    expect(applyComputedFilters(rows, dsl({ manufacturer: ['Solara Health'] }), NOW)).toHaveLength(2);
    expect(applyComputedFilters(rows, dsl({ manufacturer: ['solara'] }), NOW)).toHaveLength(2);
  });

  it('matches a client by (partial) name, without matching a different client', () => {
    const rows = [
      row({ institutionId: 'a', institutionName: 'Hospital Andino Sur' }),
      row({ institutionId: 'b', institutionName: 'Clínica Andes Altos' }),
    ];
    expect(applyComputedFilters(rows, dsl({ institution: ['Andino Sur'] }), NOW).map((r) => r.institutionId)).toEqual(['a']);
    expect(applyComputedFilters(rows, dsl({ institution: ['hospital andino sur'] }), NOW).map((r) => r.institutionId)).toEqual(['a']);
  });

  it('filters renewal opportunities with the per-modality threshold (MR: 10 years)', () => {
    const rows = [row({ installYearLo: 2015, installYearHi: 2015 }), row({ installYearLo: 2020, installYearHi: 2020 })];
    const result = applyComputedFilters(rows, dsl({ renewalDue: true }), NOW);
    expect(result).toHaveLength(1);
    expect(result[0].installYearLo).toBe(2015);
  });
});

describe('aggregateQuery', () => {
  it('returns null when no groupBy is set', () => {
    expect(aggregateQuery([row()], EMPTY_QUERY_DSL, NOW)).toBeNull();
  });

  it('groups by modality, sums unit counts and labels groups for display', () => {
    const rows = [row({ modality: 'MR', count: 2 }), row({ modality: 'MR', count: 1 }), row({ modality: 'CT', count: 3 })];
    const groups = aggregateQuery(rows, dsl({ groupBy: 'modality' }), NOW);
    expect(groups).toMatchObject([
      { key: 'MR', label: 'Resonadores', value: 3 },
      { key: 'CT', label: 'Tomógrafos', value: 3 },
    ]);
  });

  it('labels country groups with the country name, not the ISO code', () => {
    const groups = aggregateQuery([row({ countryIso: 'BR' })], dsl({ groupBy: 'country' }), NOW);
    expect(groups?.[0]).toMatchObject({ key: 'BR', label: 'Brasil' });
  });

  it('averages age weighted by units', () => {
    const rows = [row({ count: 3, installYearLo: 2016, installYearHi: 2016 }), row({ count: 1, installYearLo: 2024, installYearHi: 2024 })];
    const groups = aggregateQuery(rows, dsl({ groupBy: 'country', metric: 'avgAge' }), NOW);
    expect(groups?.[0].value).toBe(8); // (10×3 + 2×1) / 4
  });

  it('reports null — not 0 — for a group without any known age, and sorts it last', () => {
    const rows = [row({ modality: 'US', installYearLo: null, installYearHi: null }), row({ modality: 'MR' })];
    const groups = aggregateQuery(rows, dsl({ groupBy: 'modality', metric: 'avgAge' }), NOW)!;
    expect(groups.map((g) => [g.key, g.value])).toEqual([
      ['MR', 10],
      ['US', null],
    ]);
  });

  it('counts distinct clients with metric "clients"', () => {
    const rows = [row({ institutionId: 'a', count: 5 }), row({ institutionId: 'a' }), row({ institutionId: 'b' })];
    expect(aggregateQuery(rows, dsl({ groupBy: 'country', metric: 'clients' }), NOW)?.[0].value).toBe(2);
  });

  it('merges manufacturer spellings into one catalog group', () => {
    const rows = [row({ manufacturer: 'Solara Health' }), row({ manufacturer: 'solara' }), row({ manufacturer: null })];
    const groups = aggregateQuery(rows, dsl({ groupBy: 'manufacturer' }), NOW)!;
    expect(groups.map((g) => [g.label, g.value])).toEqual([
      ['Solara Health', 2],
      ['Desconocido', 1],
    ]);
  });

  it('keeps age buckets in their natural order', () => {
    const rows = [row({ installYearLo: 2012, installYearHi: 2012, count: 5 }), row({ installYearLo: 2025, installYearHi: 2025 })];
    const groups = aggregateQuery(rows, dsl({ groupBy: 'ageBucket' }), NOW)!;
    expect(groups.map((g) => g.key)).toEqual(['0–3 años', '11+ años']);
  });

  it('sorts ascending when asked', () => {
    const rows = [row({ countryIso: 'BR', count: 5 }), row({ countryIso: 'MX', count: 1 })];
    expect(aggregateQuery(rows, dsl({ groupBy: 'country', order: 'asc' }), NOW)!.map((g) => g.key)).toEqual(['MX', 'BR']);
  });

  it('groups regions through the country, even when the stored region is missing', () => {
    const groups = aggregateQuery([row({ countryIso: 'ES', region: null })], dsl({ groupBy: 'region' }), NOW);
    expect(groups?.[0]).toMatchObject({ key: 'EU', label: 'Europa' });
  });
});

describe('consistency with the Dashboard', () => {
  // Same synthetic park, computed through both engines: Consultas must answer the
  // Dashboard's own questions with the Dashboard's own numbers.
  const rows: QueryEquipmentRow[] = [
    row({ institutionId: 'a', institutionName: 'A', countryIso: 'CO', modality: 'MR', count: 2, installYearLo: 2015, installYearHi: 2015 }),
    row({ institutionId: 'a', institutionName: 'A', countryIso: 'CO', modality: 'CT', count: 1, installYearLo: 2011, installYearHi: 2011, lastVerifiedAt: '2025-06-01T00:00:00Z' }),
    row({ institutionId: 'b', institutionName: 'B', countryIso: 'BR', modality: 'US', count: 3, installYearLo: 2021, installYearHi: 2021, statusModel: 'Desconocido' }),
    row({ institutionId: 'c', institutionName: 'C', countryIso: 'PE', modality: 'US', count: null, installYearLo: null, installYearHi: null, statusManufacturer: 'Desconocido', lastVerifiedAt: '2024-03-01T00:00:00Z' }),
  ];
  const dashboard = computeDashboard(
    [
      { id: 'a', name: 'A', countryIso: 'CO' },
      { id: 'b', name: 'B', countryIso: 'BR' },
      { id: 'c', name: 'C', countryIso: 'PE' },
    ],
    rows.map((r, i) => ({ ...r, id: `eq-${i}` })),
    NOW
  );
  const run = (overrides: Partial<QueryDsl>) => applyComputedFilters(rows, dsl(overrides), NOW);
  const clients = (rs: QueryEquipmentRow[]) => Array.from(new Set(rs.map((r) => r.institutionId))).sort();

  it('equipment by modality', () => {
    const groups = aggregateQuery(rows, dsl({ groupBy: 'modality' }), NOW)!;
    expect(Object.fromEntries(groups.map((g) => [g.key, g.value]))).toEqual(
      Object.fromEntries(dashboard.byModality.map((m) => [m.modality, m.count]))
    );
  });

  it('equipment by country', () => {
    const groups = aggregateQuery(rows, dsl({ groupBy: 'country' }), NOW)!;
    expect(Object.fromEntries(groups.map((g) => [g.key, g.value]))).toEqual(
      Object.fromEntries(dashboard.byCountry.map((c) => [c.countryIso, c.count]))
    );
  });

  it('stale clients', () => {
    expect(clients(run({ stale: true }))).toEqual(dashboard.staleClients.map((c) => c.institutionId).sort());
  });

  it('incomplete clients', () => {
    expect(clients(run({ incomplete: true }))).toEqual(dashboard.incompleteClients.map((c) => c.institutionId).sort());
  });

  it('renewal opportunities', () => {
    expect(run({ renewalDue: true })).toHaveLength(dashboard.renewalOpportunities.length);
  });

  it('age buckets', () => {
    const groups = aggregateQuery(rows, dsl({ groupBy: 'ageBucket' }), NOW)!;
    const fromDashboard = dashboard.byAgeBucket.filter((b) => b.count > 0);
    expect(groups.map((g) => [g.key, g.value])).toEqual(fromDashboard.map((b) => [b.bucket, b.count]));
  });
});
