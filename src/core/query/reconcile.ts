import { isEmptyQueryDsl, sanitizeQueryDsl, type QueryDsl } from './dsl';
import { isAnchoredInQuestion, isGenericQueryWord, type QueryHints } from './hints';
import { findCity, findCountry, findRegion } from '../normalize/geo';
import { findManufacturer } from '../normalize/catalog';
import { normalizeModality } from '../normalize/modality';
import { normalizeInstitutionName, normalizeText } from '../normalize/text';
import type { Modality } from '../schema/observation';

export type ReconciledQuery = {
  dsl: QueryDsl;
  /** User-facing caveats: unrecognized values, unsupported exclusions, etc. */
  notes: string[];
  /** False when the question has nothing to do with the installed base — the screen asks
   * the user to rephrase instead of answering "everything" as if that were the answer. */
  understood: boolean;
};

type EntityField = 'country' | 'city' | 'region' | 'manufacturer' | 'institution';

/**
 * Merges the LLM's QueryDsl with the deterministic reading of the question
 * (analyzeQuestion) into the query that actually runs. The rule is the same one that
 * guards extraction (src/core/normalize/pipeline.ts): a value survives only if it is
 * anchored in the source text. Concretely:
 *  - Entity filters = what the analyzer found in the question ∪ LLM values that resolve
 *    to one of those, or whose raw text appears in the question. An LLM value the
 *    question never mentions is dropped — this is what generally fixes the observed
 *    failures (country: ["BR"] for "De qué países…", "All manufacturers", every modality
 *    listed) instead of one patch per phrasing.
 *  - LLM values in the wrong slot are re-homed ("Lima" as a country → city).
 *  - A filter on the same field as groupBy is kept when anchored ("resonadores por país en
 *    Brasil y México" is a legitimate request), dropped otherwise.
 *  - Ages, confidence, flags, metric, top-N: the analyzer's regex reading wins; an LLM
 *    value is only kept when the question carries matching evidence (the number itself,
 *    or the keyword family).
 */
export function reconcileQueryDsl(llmDsl: QueryDsl, hints: QueryHints): ReconciledQuery {
  const llm = sanitizeQueryDsl(llmDsl);
  const notes = [...hints.notes];
  const excluded = new Set(hints.excluded);
  const anchored = (raw: string) => isAnchoredInQuestion(raw, hints.words) && !isGenericQueryWord(raw);

  const out: Record<EntityField, string[]> = {
    country: [...hints.country],
    city: [...hints.city],
    region: [...hints.region],
    manufacturer: [...hints.manufacturer],
    institution: [...hints.institution],
  };
  const modality: Modality[] = [...hints.modality];

  const add = (field: EntityField, value: string) => {
    if (excluded.has(value) || out[field].includes(value)) return;
    if (field === 'institution' && out.institution.some((v) => normalizeInstitutionName(v) === normalizeInstitutionName(value))) return;
    out[field].push(value);
  };
  const addModality = (m: Modality) => {
    if (!excluded.has(m) && !modality.includes(m)) modality.push(m);
  };
  const confirmedByHints = (field: EntityField, value: string) => hints[field].includes(value);

  const resolvers: Record<'country' | 'city' | 'region' | 'manufacturer', (text: string) => string | undefined> = {
    country: (text) => findCountry(text)?.iso,
    city: (text) => findCity(text)?.name,
    region: (text) => findRegion(text)?.key,
    manufacturer: (text) => findManufacturer(text)?.name,
  };

  /** Resolves one free-text LLM value to a canonical entity, trying the slot the model
   * used first, then the others — and again with generic words stripped ("equipos
   * Solara" → "solara"). Returns false when nothing in the catalogs matched. */
  const resolveAndKeep = (raw: string, preferred: EntityField): boolean => {
    const normalized = normalizeText(raw);
    const stripped = normalized
      .split(' ')
      .filter((w) => !isGenericQueryWord(w))
      .join(' ');
    const candidates = stripped && stripped !== normalized ? [raw, stripped] : [raw];
    const order = (['country', 'city', 'region', 'manufacturer'] as const).slice().sort((a, b) =>
      a === preferred ? -1 : b === preferred ? 1 : 0
    );
    for (const text of candidates) {
      for (const field of order) {
        const value = resolvers[field](text);
        if (value === undefined) continue;
        if (confirmedByHints(field, value) || anchored(text)) add(field, value);
        return true;
      }
      const m = normalizeModality(text);
      if (m) {
        if (hints.modality.includes(m) || anchored(text)) addModality(m);
        return true;
      }
    }
    return false;
  };

  // Values that match no catalog are only kept for on-topic questions: for "hola", a
  // stray word the model copied into a slot must not turn into a filter.
  const keepUnknown = (raw: string) => hints.hasDomainSignal && anchored(raw);

  for (const raw of llm.country) {
    if (resolveAndKeep(raw, 'country') || !keepUnknown(raw)) continue;
    // Anchored but unknown (e.g. a country missing from the gazetteer): keep it as an
    // honest zero-match filter and explain why, instead of silently widening the query.
    add('country', raw.trim());
    notes.push(`«${raw.trim()}» no está en el catálogo de países, así que ningún cliente tiene ese país asignado.`);
  }
  for (const raw of llm.region) {
    if (resolveAndKeep(raw, 'region') || !keepUnknown(raw)) continue;
    add('region', raw.trim());
    notes.push(`«${raw.trim()}» no es una región conocida (Latinoamérica, Norteamérica, Europa, Sudamérica, Centroamérica, Caribe).`);
  }
  for (const raw of llm.city) {
    if (resolveAndKeep(raw, 'city') || !keepUnknown(raw)) continue;
    add('city', raw.trim());
    notes.push(`«${raw.trim()}» no está en el catálogo de ciudades; se buscó por nombre exacto.`);
  }
  for (const raw of llm.manufacturer) {
    if (resolveAndKeep(raw, 'manufacturer') || !keepUnknown(raw)) continue;
    add('manufacturer', raw.trim());
    notes.push(`«${raw.trim()}» no está en el catálogo de fabricantes; se buscó por nombre exacto.`);
  }
  for (const raw of llm.institution) {
    if (!keepUnknown(raw)) continue;
    // A place or catalog name the model put in the client slot goes to its real field.
    if (findCountry(raw) || findCity(raw) || findRegion(raw) || findManufacturer(raw) || normalizeModality(raw)) {
      resolveAndKeep(raw, 'city');
      continue;
    }
    add('institution', raw.trim());
  }
  for (const m of llm.modality) {
    if (hints.modality.includes(m) || hints.modalityCodes.includes(m)) addModality(m);
  }

  // Breakdown
  let groupBy = hints.groupBy ?? llm.groupBy;
  if (!hints.groupBy && groupBy && groupBy !== 'modality' && groupBy !== 'ageBucket') {
    // An LLM-only breakdown on a field the question filters to a single value is trivial
    // ("Tomógrafos en México" → one "México" row): show the list instead.
    if (out[groupBy].length === 1) groupBy = undefined;
  }
  if (!hints.groupBy && groupBy === 'modality' && modality.length === 1) groupBy = undefined;

  // Metric
  let metric = hints.metric ?? llm.metric;
  if (!hints.metric) {
    if (metric === 'avgAge' && !hints.mentions.age) metric = 'count';
    if (metric === 'confidence' && !hints.mentions.confidence) metric = 'count';
    if (metric === 'clients' && !hints.mentions.clients) metric = 'count';
    // "De qué países tenemos clientes", "clientes por ciudad": the thing being counted is
    // clients, not equipment units.
    if (metric === 'count' && groupBy && groupBy !== 'institution' && hints.mentions.clients && !hints.mentions.equipment) {
      metric = 'clients';
    }
  }
  // Average age per age bucket just restates the bucket; count what's in each one.
  if (groupBy === 'ageBucket' && metric === 'avgAge') metric = 'count';

  // Ages: the regex reading wins; otherwise an LLM age needs its number in the question.
  const hasNumber = (n: number) => hints.numbers.some((x) => Math.abs(x - n) < 0.01);
  let minAge: number | undefined;
  let maxAge: number | undefined;
  if (hints.minAge !== undefined || hints.maxAge !== undefined) {
    minAge = hints.minAge;
    maxAge = hints.maxAge;
  } else if (hints.mentions.age) {
    if (llm.minAge !== undefined && hasNumber(llm.minAge)) minAge = llm.minAge;
    if (llm.maxAge !== undefined && hasNumber(llm.maxAge)) maxAge = llm.maxAge;
  }
  if (minAge !== undefined && maxAge !== undefined && minAge > maxAge) {
    minAge = undefined;
    maxAge = undefined;
  }

  let minConfidence = hints.minConfidence;
  if (
    minConfidence === undefined &&
    llm.minConfidence !== undefined &&
    hints.mentions.confidence &&
    (hasNumber(llm.minConfidence) || hasNumber(llm.minConfidence / 100))
  ) {
    minConfidence = llm.minConfidence;
  }
  let maxConfidence = hints.maxConfidence;
  if (
    maxConfidence === undefined &&
    llm.maxConfidence !== undefined &&
    hints.mentions.confidence &&
    (hasNumber(llm.maxConfidence) || hasNumber(llm.maxConfidence / 100))
  ) {
    maxConfidence = llm.maxConfidence;
  }

  // Top-N / order only make sense on a breakdown.
  let limit = hints.limit ?? (llm.limit !== undefined && hasNumber(llm.limit) ? llm.limit : undefined);
  let order = hints.order ?? (llm.order === 'asc' && hints.mentions.ascending ? 'asc' : undefined);
  if (!groupBy) {
    limit = undefined;
    order = undefined;
  }

  const dsl: QueryDsl = {
    region: out.region,
    country: out.country,
    city: out.city,
    modality,
    manufacturer: out.manufacturer,
    institution: out.institution,
    metric,
  };
  if (minAge !== undefined) dsl.minAge = minAge;
  if (maxAge !== undefined) dsl.maxAge = maxAge;
  if (minConfidence !== undefined) dsl.minConfidence = minConfidence;
  if (maxConfidence !== undefined) dsl.maxConfidence = maxConfidence;
  if (hints.incomplete || (llm.incomplete && hints.mentions.incomplete)) dsl.incomplete = true;
  if (hints.stale || (llm.stale && hints.mentions.stale)) dsl.stale = true;
  if (hints.renewalDue || (llm.renewalDue && hints.mentions.renewal)) dsl.renewalDue = true;
  if (groupBy) dsl.groupBy = groupBy;
  if (limit !== undefined) dsl.limit = limit;
  if (order) dsl.order = order;

  const cleaned = sanitizeQueryDsl(dsl);
  // Nothing to filter, group or measure, and either off-topic ("hola") or a judgement
  // call ("¿cuál es el mejor fabricante?"): answering with the whole park's totals would
  // look like an answer without being one.
  const understood = !(isEmptyQueryDsl(cleaned) && (!hints.hasDomainSignal || hints.subjective));
  return { dsl: cleaned, notes, understood };
}
