import type { Modality } from './schema/observation';
import type { QueryDsl, QueryGroupBy, QueryMetric } from './query/dsl';
import { countryLabel, regionByKey } from './normalize/geo';

// Display labels shared by the capture follow-up questions and the Consultas screen —
// one place, so the chips, the templated answer and the LLM summary prompt all name
// things the same way (never a raw enum like "country" or "MR" in front of the user).

/** Singular, lowercase — used inside sentences ("¿Sabes el fabricante del resonador?"). */
export const MODALITY_LABEL: Record<Modality, string> = {
  MR: 'resonador',
  CT: 'tomógrafo',
  US: 'ecógrafo',
  XR: 'equipo de rayos X',
  MG: 'mamógrafo',
  PET_CT: 'PET-CT',
  SPECT: 'SPECT',
  NM: 'equipo de medicina nuclear',
  ANGIO: 'angiógrafo',
  MONITORING: 'monitor',
  OTHER: 'equipo',
};

/** Plural, capitalized — used for chips, group rows and answers. */
export const MODALITY_PLURAL_LABEL: Record<Modality, string> = {
  MR: 'Resonadores',
  CT: 'Tomógrafos',
  US: 'Ecógrafos',
  XR: 'Rayos X',
  MG: 'Mamógrafos',
  PET_CT: 'PET-CT',
  SPECT: 'SPECT',
  NM: 'Medicina nuclear',
  ANGIO: 'Angiógrafos',
  MONITORING: 'Monitores',
  OTHER: 'Otros equipos',
};

export function modalityLabel(code: string): string {
  return MODALITY_PLURAL_LABEL[code as Modality] ?? code;
}

const MODALITY_COUNT_PLURAL: Record<Modality, string> = {
  MR: 'resonadores',
  CT: 'tomógrafos',
  US: 'ecógrafos',
  XR: 'equipos de rayos X',
  MG: 'mamógrafos',
  PET_CT: 'PET-CT',
  SPECT: 'SPECT',
  NM: 'equipos de medicina nuclear',
  ANGIO: 'angiógrafos',
  MONITORING: 'monitores',
  OTHER: 'otros equipos',
};

/** "1 tomógrafo", "3 resonadores" — for counts inside a sentence. */
export function modalityCount(modality: Modality, n: number): string {
  return `${n} ${n === 1 ? MODALITY_LABEL[modality] : MODALITY_COUNT_PLURAL[modality]}`;
}

export function regionLabel(key: string): string {
  return regionByKey(key)?.label ?? key;
}

export const GROUP_BY_LABEL: Record<QueryGroupBy, { singular: string; plural: string }> = {
  country: { singular: 'país', plural: 'países' },
  city: { singular: 'ciudad', plural: 'ciudades' },
  region: { singular: 'región', plural: 'regiones' },
  modality: { singular: 'modalidad', plural: 'modalidades' },
  manufacturer: { singular: 'fabricante', plural: 'fabricantes' },
  institution: { singular: 'cliente', plural: 'clientes' },
  ageBucket: { singular: 'rango de antigüedad', plural: 'rangos de antigüedad' },
};

export const METRIC_LABEL: Record<QueryMetric, string> = {
  count: 'Cantidad de equipos',
  clients: 'Cantidad de clientes',
  avgAge: 'Antigüedad promedio',
  confidence: 'Confianza promedio',
};

export function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function plural(n: number, singular: string, pluralForm: string): string {
  return `${n} ${n === 1 ? singular : pluralForm}`;
}

export function formatMetricValue(metric: QueryMetric, value: number | null): string {
  if (value === null) return 'sin dato';
  switch (metric) {
    case 'avgAge':
      return `${formatNumber(value)} años`;
    case 'confidence':
      return `${Math.round(value)}/100`;
    case 'clients':
      return plural(value, 'cliente', 'clientes');
    default:
      return plural(value, 'equipo', 'equipos');
  }
}

export type QueryChip = { key: keyof QueryDsl; label: string };

const join = (values: string[], fn: (v: string) => string = (v) => v) => values.map(fn).join(', ');

/** The filter half of a query (what gets narrowed down), one removable chip per field. */
export function describeFilters(dsl: QueryDsl): QueryChip[] {
  const chips: QueryChip[] = [];
  if (dsl.region.length) chips.push({ key: 'region', label: `Región: ${join(dsl.region, regionLabel)}` });
  if (dsl.country.length) chips.push({ key: 'country', label: `País: ${join(dsl.country, countryLabel)}` });
  if (dsl.city.length) chips.push({ key: 'city', label: `Ciudad: ${join(dsl.city)}` });
  if (dsl.institution.length) chips.push({ key: 'institution', label: `Cliente: ${join(dsl.institution)}` });
  if (dsl.modality.length) chips.push({ key: 'modality', label: `Modalidad: ${join(dsl.modality, modalityLabel)}` });
  if (dsl.manufacturer.length) chips.push({ key: 'manufacturer', label: `Fabricante: ${join(dsl.manufacturer)}` });
  if (dsl.minAge !== undefined) chips.push({ key: 'minAge', label: `Antigüedad ≥ ${formatNumber(dsl.minAge)} años` });
  if (dsl.maxAge !== undefined) chips.push({ key: 'maxAge', label: `Antigüedad ≤ ${formatNumber(dsl.maxAge)} años` });
  if (dsl.minConfidence !== undefined) chips.push({ key: 'minConfidence', label: `Confianza ≥ ${dsl.minConfidence}` });
  if (dsl.maxConfidence !== undefined) chips.push({ key: 'maxConfidence', label: `Confianza ≤ ${dsl.maxConfidence}` });
  if (dsl.incomplete) chips.push({ key: 'incomplete', label: 'Información incompleta' });
  if (dsl.stale) chips.push({ key: 'stale', label: 'Desactualizado (+1 año sin verificar)' });
  if (dsl.renewalDue) chips.push({ key: 'renewalDue', label: 'Para renovar' });
  return chips;
}

/** Filter chips plus the shape of the answer: breakdown, metric, ordering and top-N. */
export function describeQueryDsl(dsl: QueryDsl): QueryChip[] {
  const chips = describeFilters(dsl);
  if (dsl.groupBy) chips.push({ key: 'groupBy', label: `Por ${GROUP_BY_LABEL[dsl.groupBy].singular}` });
  if (dsl.metric !== 'count') chips.push({ key: 'metric', label: METRIC_LABEL[dsl.metric] });
  if (dsl.limit !== undefined) chips.push({ key: 'limit', label: `Top ${dsl.limit}` });
  if (dsl.order === 'asc') chips.push({ key: 'order', label: 'De menor a mayor' });
  return chips;
}
