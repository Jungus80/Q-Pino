import type { QueryDsl } from './dsl';
import type { FieldStatus, Modality } from '../schema/observation';
import { computeConfidence } from '../score/confidence';

// Structural filters (region/country/city/modality/manufacturer) compile to a
// parameterized SQL WHERE clause — every value from the DSL is bound as a `?` parameter,
// never interpolated into the string, so nothing the LLM produces (it only ever fills in
// QueryDsl fields, never SQL text — see QUERY_DSL_SCHEMA) can reach the query as syntax.
// Computed filters (age, confidence, staleness, completeness) depend on "now" and on
// src/core/score/confidence.ts, so they're applied in a second, pure JS pass instead of
// SQL — see applyComputedFilters below.
export function compileStructuralQuery(dsl: QueryDsl): { sql: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (dsl.region.length) {
    clauses.push(`i.region IN (${dsl.region.map(() => '?').join(',')})`);
    params.push(...dsl.region);
  }
  if (dsl.country.length) {
    clauses.push(`i.country_iso IN (${dsl.country.map(() => '?').join(',')})`);
    params.push(...dsl.country);
  }
  if (dsl.city.length) {
    clauses.push(`i.city IN (${dsl.city.map(() => '?').join(',')})`);
    params.push(...dsl.city);
  }
  if (dsl.modality.length) {
    clauses.push(`e.modality IN (${dsl.modality.map(() => '?').join(',')})`);
    params.push(...dsl.modality);
  }
  if (dsl.manufacturer.length) {
    clauses.push(`e.manufacturer IN (${dsl.manufacturer.map(() => '?').join(',')})`);
    params.push(...dsl.manufacturer);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const sql = `SELECT e.*, i.name AS institution_name, i.city AS institution_city,
    i.country_iso AS institution_country, i.region AS institution_region
    FROM equipment e JOIN institutions i ON e.institution_id = i.id ${where}`.trim();

  return { sql, params };
}

export type QueryEquipmentRow = {
  institutionId: string;
  institutionName: string;
  modality: Modality;
  manufacturer: string | null;
  count: number | null;
  installYearLo: number | null;
  installYearHi: number | null;
  statusManufacturer: FieldStatus;
  statusModel: FieldStatus;
  statusAge: FieldStatus;
  statusCount: FieldStatus;
  lastVerifiedAt: string;
  countryIso: string | null;
  city: string | null;
};

function ageYears(row: QueryEquipmentRow, now: Date): number | null {
  if (row.installYearLo === null || row.installYearHi === null) return null;
  const midYear = (row.installYearLo + row.installYearHi) / 2;
  return now.getFullYear() - midYear;
}

/** Applies the DSL's computed filters (age/confidence/incomplete/stale) — everything
 * that can't be expressed as a plain SQL WHERE clause because it depends on "now" or on
 * the confidence formula. */
export function applyComputedFilters(rows: QueryEquipmentRow[], dsl: QueryDsl, now: Date = new Date()): QueryEquipmentRow[] {
  return rows.filter((row) => {
    const age = ageYears(row, now);
    if (dsl.minAge !== undefined && (age === null || age < dsl.minAge)) return false;
    if (dsl.maxAge !== undefined && (age === null || age > dsl.maxAge)) return false;

    if (dsl.minConfidence !== undefined) {
      const confidence = computeConfidence(
        {
          fieldStatus: {
            manufacturer: row.statusManufacturer,
            model: row.statusModel,
            age: row.statusAge,
            count: row.statusCount,
          },
          lastVerifiedAt: row.lastVerifiedAt,
        },
        now
      );
      if (confidence.score < dsl.minConfidence) return false;
    }

    if (dsl.incomplete) {
      const statuses = [row.statusManufacturer, row.statusModel, row.statusAge, row.statusCount];
      if (!statuses.some((s) => s === 'Desconocido')) return false;
    }

    if (dsl.stale) {
      const daysSinceVerified = (now.getTime() - new Date(row.lastVerifiedAt).getTime()) / 86_400_000;
      if (daysSinceVerified < 365) return false;
    }

    return true;
  });
}

export type QueryGroup = { key: string; value: number };

/** Groups the filtered rows by dsl.groupBy and reduces with dsl.metric. Returns null
 * (ungrouped — the caller should just show the row list) when groupBy is unset. */
export function aggregateQuery(rows: QueryEquipmentRow[], dsl: QueryDsl, now: Date = new Date()): QueryGroup[] | null {
  if (!dsl.groupBy) return null;

  const keyOf = (row: QueryEquipmentRow): string => {
    switch (dsl.groupBy) {
      case 'country':
        return row.countryIso ?? 'Desconocido';
      case 'city':
        return row.city ?? 'Desconocido';
      case 'modality':
        return row.modality;
      case 'manufacturer':
        return row.manufacturer ?? 'Desconocido';
      default:
        return 'Desconocido';
    }
  };

  const buckets = new Map<string, QueryEquipmentRow[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const list = buckets.get(key) ?? [];
    list.push(row);
    buckets.set(key, list);
  }

  const groups: QueryGroup[] = Array.from(buckets.entries()).map(([key, groupRows]) => {
    if (dsl.metric === 'count') {
      const total = groupRows.reduce((sum, r) => sum + (r.count ?? 1), 0);
      return { key, value: total };
    }
    if (dsl.metric === 'avgAge') {
      const ages = groupRows.map((r) => ageYears(r, now)).filter((a): a is number => a !== null);
      return { key, value: ages.length ? Math.round((ages.reduce((s, a) => s + a, 0) / ages.length) * 10) / 10 : 0 };
    }
    // confidence
    const scores = groupRows.map(
      (r) =>
        computeConfidence(
          {
            fieldStatus: {
              manufacturer: r.statusManufacturer,
              model: r.statusModel,
              age: r.statusAge,
              count: r.statusCount,
            },
            lastVerifiedAt: r.lastVerifiedAt,
          },
          now
        ).score
    );
    return { key, value: Math.round(scores.reduce((s, v) => s + v, 0) / scores.length) };
  });

  return groups.sort((a, b) => b.value - a.value);
}
