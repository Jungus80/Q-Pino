import { z } from 'zod';
import { MODALITIES } from '../schema/observation';

export const QUERY_GROUP_BYS = ['country', 'city', 'region', 'modality', 'manufacturer', 'institution', 'ageBucket'] as const;
export type QueryGroupBy = (typeof QUERY_GROUP_BYS)[number];
export const QUERY_METRICS = ['count', 'clients', 'avgAge', 'confidence'] as const;
export type QueryMetric = (typeof QUERY_METRICS)[number];
export const QUERY_ORDERS = ['desc', 'asc'] as const;
export const MAX_QUERY_LIMIT = 50;

// Mirrors QUERY_DSL_SCHEMA in src/core/schema/jsonSchemas.ts — the grammar the LLM's
// output is constrained to. The LLM only ever produces this filter object; it never
// writes SQL. src/core/query/compile.ts is the only thing that turns a QueryDsl into a
// database query, and it only ever binds these values as parameters.
//
// After src/core/query/reconcile.ts, the entity arrays hold canonical values only:
// country = ISO codes, region = region keys (a code like "LATAM" or a subregion name,
// see findRegion), city = gazetteer city names (or raw text anchored in the question),
// manufacturer = catalog names (or raw text anchored in the question).
export const queryDslSchema = z.object({
  region: z.array(z.string()).default([]),
  country: z.array(z.string()).default([]),
  city: z.array(z.string()).default([]),
  modality: z.array(z.enum(MODALITIES)).default([]),
  manufacturer: z.array(z.string()).default([]),
  // Client (institution) names, free text — matched fuzzily against institutions.name.
  institution: z.array(z.string()).default([]),
  minAge: z.number().optional(),
  maxAge: z.number().optional(),
  minConfidence: z.number().optional(),
  maxConfidence: z.number().optional(),
  incomplete: z.boolean().optional(),
  stale: z.boolean().optional(),
  renewalDue: z.boolean().optional(),
  groupBy: z.enum(QUERY_GROUP_BYS).optional(),
  metric: z.enum(QUERY_METRICS).default('count'),
  limit: z.number().optional(),
  order: z.enum(QUERY_ORDERS).optional(),
});
export type QueryDsl = z.infer<typeof queryDslSchema>;

export const EMPTY_QUERY_DSL: QueryDsl = {
  region: [],
  country: [],
  city: [],
  modality: [],
  manufacturer: [],
  institution: [],
  metric: 'count',
};

/**
 * Field-level cleanup for a QueryDsl the LLM just produced — the checks that don't need
 * the question text. A 2B model under grammar constraint sometimes "fills in" a field
 * instead of leaving it empty when it isn't sure; observed live:
 *  - "Equipos por modalidad" came back with every modality listed — indistinguishable
 *    from "no filter" (an IN clause matching every row), so it collapses to [].
 *  - "Cuáles son los fabricantes más comunes" came back with manufacturer: ["All
 *    manufacturers"] — a placeholder standing in for "no filter" that matched nothing and
 *    returned zero rows. Entries that are themselves a "no filter" word are stripped.
 *  - minAge: 0 / maxAge: 0 (a no-op and a matches-nothing filter respectively), and
 *    inverted age ranges.
 *  - minConfidence given as a fraction (0.8 meaning 80) on a 0-100 scale.
 * Anything that needs the question itself — whether a value was actually mentioned, e.g.
 * the invented country: ["BR"] for "De qué países tenemos clientes" — is handled by
 * src/core/query/reconcile.ts, which runs this first.
 */
const PLACEHOLDER_FILTER_VALUES = new Set([
  'all',
  'all manufacturers',
  'all countries',
  'all cities',
  'all modalities',
  'all regions',
  'any',
  'anything',
  'everyone',
  'everything',
  'todos',
  'todas',
  'todo',
  'toda',
  'todos los fabricantes',
  'todos los paises',
  'todas las ciudades',
  'cualquiera',
  'ninguno',
  'ninguna',
  'none',
  'n/a',
  'na',
  'various',
  'varios',
  'varias',
  'desconocido',
  'unknown',
  'otro',
  'otros',
]);

function cleanStrings(values: string[]): string[] {
  const out: string[] = [];
  for (const raw of values) {
    const v = raw.trim();
    if (!v || PLACEHOLDER_FILTER_VALUES.has(v.toLowerCase())) continue;
    if (!out.includes(v)) out.push(v);
  }
  return out;
}

export function sanitizeQueryDsl(dsl: QueryDsl): QueryDsl {
  const next: QueryDsl = { ...dsl };
  next.country = cleanStrings(next.country);
  next.city = cleanStrings(next.city);
  next.manufacturer = cleanStrings(next.manufacturer);
  next.region = cleanStrings(next.region);
  next.institution = cleanStrings(next.institution);
  next.modality = Array.from(new Set(next.modality));
  if (next.modality.length === MODALITIES.length) next.modality = [];

  if (next.minAge !== undefined && !(next.minAge > 0)) delete next.minAge;
  if (next.maxAge !== undefined && !(next.maxAge > 0)) delete next.maxAge;
  if (next.minAge !== undefined && next.maxAge !== undefined && next.minAge > next.maxAge) {
    delete next.minAge;
    delete next.maxAge;
  }

  // Confidence is a 0-100 score; a bound at or beyond either end filters nothing (or
  // everything), so it's dropped rather than applied.
  const scaled = (c: number) => Math.round(c > 0 && c <= 1 ? c * 100 : c);
  if (next.minConfidence !== undefined) {
    const c = scaled(next.minConfidence);
    if (!(c > 0)) delete next.minConfidence;
    else next.minConfidence = Math.min(100, c);
  }
  if (next.maxConfidence !== undefined) {
    const c = scaled(next.maxConfidence);
    if (!(c > 0) || c >= 100) delete next.maxConfidence;
    else next.maxConfidence = c;
  }
  if (next.minConfidence !== undefined && next.maxConfidence !== undefined && next.minConfidence > next.maxConfidence) {
    delete next.minConfidence;
    delete next.maxConfidence;
  }

  if (next.limit !== undefined) {
    const l = Math.round(next.limit);
    if (!(l >= 1)) delete next.limit;
    else next.limit = Math.min(MAX_QUERY_LIMIT, l);
  }
  return next;
}

/** True when the DSL asks for nothing beyond "all equipment, counted, ungrouped". */
export function isEmptyQueryDsl(dsl: QueryDsl): boolean {
  return (
    dsl.region.length === 0 &&
    dsl.country.length === 0 &&
    dsl.city.length === 0 &&
    dsl.modality.length === 0 &&
    dsl.manufacturer.length === 0 &&
    dsl.institution.length === 0 &&
    dsl.minAge === undefined &&
    dsl.maxAge === undefined &&
    dsl.minConfidence === undefined &&
    dsl.maxConfidence === undefined &&
    !dsl.incomplete &&
    !dsl.stale &&
    !dsl.renewalDue &&
    !dsl.groupBy &&
    dsl.metric === 'count'
  );
}
