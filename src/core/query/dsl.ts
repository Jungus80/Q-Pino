import { z } from 'zod';
import { MODALITIES } from '../schema/observation';

// Mirrors QUERY_DSL_SCHEMA in src/core/schema/jsonSchemas.ts — the grammar the LLM's
// output is constrained to. The LLM only ever produces this filter object; it never
// writes SQL. src/core/query/compile.ts is the only thing that turns a QueryDsl into a
// database query, and it only ever binds these values as parameters.
export const queryDslSchema = z.object({
  region: z.array(z.string()).default([]),
  country: z.array(z.string()).default([]),
  city: z.array(z.string()).default([]),
  modality: z.array(z.enum(MODALITIES)).default([]),
  manufacturer: z.array(z.string()).default([]),
  minAge: z.number().optional(),
  maxAge: z.number().optional(),
  minConfidence: z.number().optional(),
  incomplete: z.boolean().optional(),
  stale: z.boolean().optional(),
  groupBy: z.enum(['country', 'city', 'modality', 'manufacturer']).optional(),
  metric: z.enum(['count', 'avgAge', 'confidence']).default('count'),
});
export type QueryDsl = z.infer<typeof queryDslSchema>;

export const EMPTY_QUERY_DSL: QueryDsl = {
  region: [],
  country: [],
  city: [],
  modality: [],
  manufacturer: [],
  metric: 'count',
};

/** Human-readable chips summarizing an interpreted query, for the editable-filter UI. */
export function describeQueryDsl(dsl: QueryDsl): string[] {
  const chips: string[] = [];
  if (dsl.region.length) chips.push(`Región: ${dsl.region.join(', ')}`);
  if (dsl.country.length) chips.push(`País: ${dsl.country.join(', ')}`);
  if (dsl.city.length) chips.push(`Ciudad: ${dsl.city.join(', ')}`);
  if (dsl.modality.length) chips.push(`Modalidad: ${dsl.modality.join(', ')}`);
  if (dsl.manufacturer.length) chips.push(`Fabricante: ${dsl.manufacturer.join(', ')}`);
  if (dsl.minAge !== undefined) chips.push(`Antigüedad ≥ ${dsl.minAge}a`);
  if (dsl.maxAge !== undefined) chips.push(`Antigüedad ≤ ${dsl.maxAge}a`);
  if (dsl.minConfidence !== undefined) chips.push(`Confianza ≥ ${dsl.minConfidence}`);
  if (dsl.incomplete) chips.push('Información incompleta');
  if (dsl.stale) chips.push('Desactualizado');
  if (dsl.groupBy) chips.push(`Agrupar por ${dsl.groupBy}`);
  chips.push(`Métrica: ${dsl.metric}`);
  return chips;
}

/**
 * Defensive cleanup for a QueryDsl the LLM just produced. A 2B model under grammar
 * constraint sometimes "fills in" a field instead of leaving it empty when it isn't sure
 * — the same failure mode extraction had, and observed live twice for query parsing:
 * "Equipos por modalidad" came back with every single modality value listed instead of an
 * empty array plus groupBy, and "De qué países tenemos clientes" (asking for a breakdown
 * across ALL countries) came back with country: ["BR"] — silently narrowing a "give me
 * everything, broken down" question down to one country's worth of data, invisibly wrong
 * rather than an obvious failure. The prompt's few-shot examples target this directly, but
 * a second, deterministic safety net catches whatever slips through:
 *  - listing every modality is indistinguishable from "no filter" (an IN clause matching
 *    every row), so collapse it to [] rather than waste the join and mislead the chip UI.
 *  - groupBy on a field is a structural signal from an explicit prompt rule ("por país" →
 *    groupBy: 'country') and much less prone to this failure than a filter array is; a
 *    non-empty filter on the SAME field the model chose to group by makes the grouped
 *    result trivially one row, which is a strong sign the filter is the hallucinated part
 *    — drop that filter rather than silently return a narrower answer than asked.
 *  - minAge: 0 is a mathematical no-op (age is never negative) regardless of intent.
 *  - maxAge: 0 would exclude every real row (nothing installed has zero-yet age), so a
 *    hallucinated 0 is far more likely than a genuine "brand new equipment only" query —
 *    drop it rather than silently return an empty result set.
 *  - country/city/manufacturer are free text (no closed enum to compare a filled array
 *    against, unlike modality), so a third failure mode showed up there specifically: for
 *    "Cuáles son los fabricantes más comunes" the model wrote manufacturer: ["All
 *    manufacturers"] — a placeholder string standing in for "no filter, show me
 *    everything" instead of an actual manufacturer name. That string doesn't match
 *    anything in the database, so the query silently returned zero rows for a perfectly
 *    answerable question. Strip entries that are themselves a "no filter" placeholder
 *    word rather than a real value.
 */
const PLACEHOLDER_FILTER_VALUES = new Set([
  'all',
  'all manufacturers',
  'all countries',
  'all cities',
  'all modalities',
  'any',
  'anything',
  'everyone',
  'everything',
  'todos',
  'todas',
  'todo',
  'toda',
  'cualquiera',
  'ninguno',
  'ninguna',
  'none',
  'n/a',
  'na',
  'various',
  'varios',
  'varias',
]);

function stripPlaceholders(values: string[]): string[] {
  return values.filter((v) => !PLACEHOLDER_FILTER_VALUES.has(v.trim().toLowerCase()));
}

export function sanitizeQueryDsl(dsl: QueryDsl): QueryDsl {
  const next = { ...dsl };
  next.country = stripPlaceholders(next.country);
  next.city = stripPlaceholders(next.city);
  next.manufacturer = stripPlaceholders(next.manufacturer);
  next.region = stripPlaceholders(next.region);
  if (next.modality.length === MODALITIES.length) next.modality = [];
  if (next.groupBy === 'country' && next.country.length > 0) next.country = [];
  if (next.groupBy === 'city' && next.city.length > 0) next.city = [];
  if (next.groupBy === 'modality' && next.modality.length > 0) next.modality = [];
  if (next.groupBy === 'manufacturer' && next.manufacturer.length > 0) next.manufacturer = [];
  if (next.minAge === 0) delete next.minAge;
  if (next.maxAge === 0) delete next.maxAge;
  if (next.minAge !== undefined && next.maxAge !== undefined && next.minAge > next.maxAge) {
    delete next.minAge;
    delete next.maxAge;
  }
  return next;
}

export function isEmptyQueryDsl(dsl: QueryDsl): boolean {
  return (
    dsl.region.length === 0 &&
    dsl.country.length === 0 &&
    dsl.city.length === 0 &&
    dsl.modality.length === 0 &&
    dsl.manufacturer.length === 0 &&
    dsl.minAge === undefined &&
    dsl.maxAge === undefined &&
    dsl.minConfidence === undefined &&
    !dsl.incomplete &&
    !dsl.stale &&
    !dsl.groupBy
  );
}
