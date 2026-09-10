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
 * — the same failure mode extraction had, and observed live for query parsing: "Equipos
 * por modalidad" (a request to group by modality, no filter) came back with every single
 * modality value listed instead of an empty array plus groupBy. The prompt's few-shot
 * examples target this directly, but a second, deterministic safety net catches whatever
 * slips through:
 *  - listing every modality is indistinguishable from "no filter" (an IN clause matching
 *    every row), so collapse it to [] rather than waste the join and mislead the chip UI.
 *  - minAge: 0 is a mathematical no-op (age is never negative) regardless of intent.
 *  - maxAge: 0 would exclude every real row (nothing installed has zero-yet age), so a
 *    hallucinated 0 is far more likely than a genuine "brand new equipment only" query —
 *    drop it rather than silently return an empty result set.
 */
export function sanitizeQueryDsl(dsl: QueryDsl): QueryDsl {
  const next = { ...dsl };
  if (next.modality.length === MODALITIES.length) next.modality = [];
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
