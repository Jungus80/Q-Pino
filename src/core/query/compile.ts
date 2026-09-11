import type { QueryDsl, QueryGroupBy, QueryMetric } from './dsl';
import type { FieldStatus, Modality } from '../schema/observation';
import { computeConfidence } from '../score/confidence';
import { AGE_BUCKETS, ageBucketForRange, isIncompleteEquipment, isRenewalDue, isStale, type AgeBucket } from '../score/dashboard';
import { ageMidpointYears } from '../normalize/age';
import { countryLabel, findCity, regionByKey, regionForCountry } from '../normalize/geo';
import { findManufacturer } from '../normalize/catalog';
import { nameSimilarity, normalizeInstitutionName, normalizeText } from '../normalize/text';
import { modalityLabel, regionLabel } from '../labels';

// Country/region/modality compile to a parameterized SQL WHERE clause — every value from
// the DSL is bound as a `?` parameter, never interpolated into the string, so nothing the
// LLM produces (it only ever fills in QueryDsl fields, never SQL text — see
// QUERY_DSL_SCHEMA) can reach the query as syntax. Those three are closed, canonical
// values (ISO codes, region keys, the modality enum) that match the stored column exactly.
//
// Everything else runs in a second, pure JS pass (applyComputedFilters): city,
// manufacturer and institution because the stored values are free text (an unresolved
// capture keeps whatever was said — "sao paulo", "Solara Medical") and need accent-/case-
// insensitive, catalog-aware matching SQLite can't do; age/confidence/staleness/renewal
// because they depend on "now" and on the same definitions the Dashboard uses
// (src/core/score/dashboard.ts), so both screens always agree on the same question.
export function compileStructuralQuery(dsl: QueryDsl): { sql: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];
  const placeholders = (n: number) => Array.from({ length: n }, () => '?').join(',');

  if (dsl.region.length) {
    // Country is the source of truth for region membership (institutions.region can be
    // null on rows whose country was resolved later); i.region is only a fallback.
    const parts = dsl.region.map((key) => {
      const countries = regionByKey(key)?.countries ?? [];
      params.push(...countries, key);
      return countries.length ? `i.country_iso IN (${placeholders(countries.length)}) OR i.region = ?` : 'i.region = ?';
    });
    clauses.push(`(${parts.map((p) => `(${p})`).join(' OR ')})`);
  }
  if (dsl.country.length) {
    clauses.push(`i.country_iso IN (${placeholders(dsl.country.length)})`);
    params.push(...dsl.country);
  }
  if (dsl.modality.length) {
    clauses.push(`e.modality IN (${placeholders(dsl.modality.length)})`);
    params.push(...dsl.modality);
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
  region: string | null;
};

export function rowAgeYears(row: QueryEquipmentRow, now: Date): number | null {
  return ageMidpointYears(row.installYearLo, row.installYearHi, now);
}

/** Units a row stands for — same convention as the Dashboard (unknown count = 1). */
export function rowUnits(row: QueryEquipmentRow): number {
  return row.count ?? 1;
}

function rowConfidence(row: QueryEquipmentRow, now: Date): number {
  return computeConfidence(
    {
      fieldStatus: { manufacturer: row.statusManufacturer, model: row.statusModel, age: row.statusAge, count: row.statusCount },
      lastVerifiedAt: row.lastVerifiedAt,
    },
    now
  ).score;
}

function memo(fn: (value: string) => string): (value: string) => string {
  const cache = new Map<string, string>();
  return (value) => {
    let out = cache.get(value);
    if (out === undefined) {
      out = fn(value);
      cache.set(value, out);
    }
    return out;
  };
}

/** Canonical display name for a stored/queried city: gazetteer name when recognized. */
const canonicalCity = memo((value) => findCity(value)?.name ?? value.trim());
/** Canonical display name for a stored/queried manufacturer: catalog name when recognized. */
const canonicalManufacturer = memo((value) => findManufacturer(value)?.name ?? value.trim());
const cityKey = memo((value) => normalizeText(canonicalCity(value)));
const manufacturerKey = memo((value) => normalizeText(canonicalManufacturer(value)));

function institutionMatches(name: string, query: string): boolean {
  const a = normalizeInstitutionName(name);
  const b = normalizeInstitutionName(query);
  if (!a || !b) return false;
  if (a === b || (b.length >= 4 && a.includes(b))) return true;
  return nameSimilarity(name, query) >= 0.88;
}

/** Applies every filter that isn't plain SQL: free-text entity matching (city,
 * manufacturer, institution) plus the computed ones (age/confidence/incomplete/
 * renewal/stale). */
export function applyComputedFilters(rows: QueryEquipmentRow[], dsl: QueryDsl, now: Date = new Date()): QueryEquipmentRow[] {
  const cityKeys = dsl.city.map(cityKey);
  const manufacturerKeys = dsl.manufacturer.map(manufacturerKey);

  const matched = rows.filter((row) => {
    if (cityKeys.length && (row.city == null || !cityKeys.includes(cityKey(row.city)))) return false;
    if (manufacturerKeys.length && (row.manufacturer == null || !manufacturerKeys.includes(manufacturerKey(row.manufacturer)))) return false;
    if (dsl.institution.length && !dsl.institution.some((q) => institutionMatches(row.institutionName, q))) return false;

    const age = rowAgeYears(row, now);
    if (dsl.minAge !== undefined && (age === null || age < dsl.minAge)) return false;
    if (dsl.maxAge !== undefined && (age === null || age > dsl.maxAge)) return false;
    if (dsl.minConfidence !== undefined || dsl.maxConfidence !== undefined) {
      const confidence = rowConfidence(row, now);
      if (dsl.minConfidence !== undefined && confidence < dsl.minConfidence) return false;
      if (dsl.maxConfidence !== undefined && confidence > dsl.maxConfidence) return false;
    }
    if (dsl.incomplete && !isIncompleteEquipment(row)) return false;
    if (dsl.renewalDue && !isRenewalDue(row.modality, age)) return false;
    return true;
  });

  if (!dsl.stale) return matched;

  // Staleness is a client-level property, exactly like the Dashboard's staleClients: a
  // client is stale when its most recent verification — among the rows being asked
  // about — is more than a year old. (Per-row staleness would flag a client that was just
  // visited because one of its older records wasn't re-confirmed on that visit.)
  const latest = new Map<string, string>();
  for (const row of matched) {
    const prev = latest.get(row.institutionId);
    if (!prev || row.lastVerifiedAt > prev) latest.set(row.institutionId, row.lastVerifiedAt);
  }
  return matched.filter((row) => isStale(latest.get(row.institutionId)!, now));
}

export const UNKNOWN_GROUP_KEY = 'Desconocido';

/** One row of a grouped result. `value` is the requested metric; it is null (never a
 * fake 0) when no row in the group has the data the metric needs, e.g. avgAge over
 * equipment with no known age. */
export type QueryGroup = { key: string; label: string; value: number | null; equipmentCount: number; clientCount: number };

/** Reduces rows with one metric. avgAge is weighted by units (a row counting 3 identical
 * scanners weighs 3×); confidence is per record, matching the Dashboard's avgConfidence. */
export function metricValue(rows: QueryEquipmentRow[], metric: QueryMetric, now: Date = new Date()): number | null {
  switch (metric) {
    case 'count':
      return rows.reduce((sum, r) => sum + rowUnits(r), 0);
    case 'clients':
      return new Set(rows.map((r) => r.institutionId)).size;
    case 'avgAge': {
      let weighted = 0;
      let units = 0;
      for (const r of rows) {
        const age = rowAgeYears(r, now);
        if (age === null) continue;
        weighted += age * rowUnits(r);
        units += rowUnits(r);
      }
      return units > 0 ? Math.round((weighted / units) * 10) / 10 : null;
    }
    case 'confidence': {
      if (rows.length === 0) return null;
      return Math.round(rows.reduce((sum, r) => sum + rowConfidence(r, now), 0) / rows.length);
    }
  }
}

function groupKeyOf(row: QueryEquipmentRow, groupBy: QueryGroupBy, now: Date): { key: string; label: string } {
  const unknown = { key: UNKNOWN_GROUP_KEY, label: UNKNOWN_GROUP_KEY };
  switch (groupBy) {
    case 'country':
      return row.countryIso ? { key: row.countryIso, label: countryLabel(row.countryIso) } : unknown;
    case 'region': {
      const key = (row.countryIso && regionForCountry(row.countryIso)) || row.region;
      return key ? { key, label: regionLabel(key) } : unknown;
    }
    case 'city':
      return row.city ? { key: cityKey(row.city), label: canonicalCity(row.city) } : unknown;
    case 'modality':
      return { key: row.modality, label: modalityLabel(row.modality) };
    case 'manufacturer':
      return row.manufacturer ? { key: manufacturerKey(row.manufacturer), label: canonicalManufacturer(row.manufacturer) } : unknown;
    case 'institution':
      // Keyed by id, not name, so two same-named clients in different cities never merge.
      return { key: row.institutionId, label: row.institutionName };
    case 'ageBucket': {
      const bucket = ageBucketForRange(row.installYearLo, row.installYearHi, now);
      return { key: bucket, label: bucket };
    }
  }
}

/** Groups the filtered rows by dsl.groupBy and reduces with dsl.metric, sorted by value
 * (dsl.order, default largest first; groups without data last) — or, for age buckets, in
 * the buckets' natural order. Returns every group; top-N is applied by the caller.
 * Returns null (ungrouped) when groupBy is unset. */
export function aggregateQuery(rows: QueryEquipmentRow[], dsl: QueryDsl, now: Date = new Date()): QueryGroup[] | null {
  if (!dsl.groupBy) return null;

  const buckets = new Map<string, { label: string; rows: QueryEquipmentRow[] }>();
  for (const row of rows) {
    const { key, label } = groupKeyOf(row, dsl.groupBy, now);
    const bucket = buckets.get(key) ?? { label, rows: [] };
    bucket.rows.push(row);
    buckets.set(key, bucket);
  }

  const groups: QueryGroup[] = Array.from(buckets.entries()).map(([key, bucket]) => ({
    key,
    label: bucket.label,
    value: metricValue(bucket.rows, dsl.metric, now),
    equipmentCount: metricValue(bucket.rows, 'count', now) ?? 0,
    clientCount: metricValue(bucket.rows, 'clients', now) ?? 0,
  }));

  if (dsl.groupBy === 'ageBucket') {
    return groups.sort((a, b) => AGE_BUCKETS.indexOf(a.key as AgeBucket) - AGE_BUCKETS.indexOf(b.key as AgeBucket));
  }
  const direction = dsl.order === 'asc' ? 1 : -1;
  return groups.sort((a, b) => {
    if (a.value === null) return b.value === null ? 0 : 1;
    if (b.value === null) return -1;
    return direction * (a.value - b.value);
  });
}
