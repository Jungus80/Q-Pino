import { aggregateQuery, applyComputedFilters, metricValue, rowUnits, type QueryEquipmentRow, type QueryGroup } from './compile';
import type { QueryDsl } from './dsl';
import type { Modality } from '../schema/observation';
import { countryLabel } from '../normalize/geo';
import {
  describeFilters,
  formatMetricValue,
  GROUP_BY_LABEL,
  METRIC_LABEL,
  modalityCount,
  modalityLabel,
  plural,
} from '../labels';

export type QueryInstitution = {
  id: string;
  name: string;
  city: string | null;
  countryIso: string | null;
  equipmentCount: number;
};

/** Everything the Consultas screen and the summary need, computed deterministically —
 * the LLM never produces any of these numbers. */
export type QueryAnswer = {
  equipmentTotal: number;
  clientTotal: number;
  /** dsl.metric over every matching row — always computed, grouped or not, so a question
   * like "antigüedad promedio de los resonadores" has its number without a groupBy. */
  overall: number | null;
  /** Groups after top-N (null when ungrouped). */
  groups: QueryGroup[] | null;
  /** Group count before top-N. */
  groupsTotal: number;
  institutions: QueryInstitution[];
  byModality: { modality: Modality; count: number }[];
};

export function computeQueryAnswer(structuralRows: QueryEquipmentRow[], dsl: QueryDsl, now: Date = new Date()): QueryAnswer {
  const rows = applyComputedFilters(structuralRows, dsl, now);
  const allGroups = aggregateQuery(rows, dsl, now);
  const groups = allGroups && dsl.limit !== undefined ? allGroups.slice(0, dsl.limit) : allGroups;

  const institutions = new Map<string, QueryInstitution>();
  const byModality = new Map<Modality, number>();
  for (const r of rows) {
    const inst = institutions.get(r.institutionId) ?? {
      id: r.institutionId,
      name: r.institutionName,
      city: r.city,
      countryIso: r.countryIso,
      equipmentCount: 0,
    };
    inst.equipmentCount += rowUnits(r);
    institutions.set(r.institutionId, inst);
    byModality.set(r.modality, (byModality.get(r.modality) ?? 0) + rowUnits(r));
  }

  return {
    equipmentTotal: metricValue(rows, 'count', now) ?? 0,
    clientTotal: institutions.size,
    overall: metricValue(rows, dsl.metric, now),
    groups,
    groupsTotal: allGroups?.length ?? 0,
    institutions: Array.from(institutions.values()).sort((a, b) => b.equipmentCount - a.equipmentCount || a.name.localeCompare(b.name)),
    byModality: Array.from(byModality, ([modality, count]) => ({ modality, count })).sort((a, b) => b.count - a.count),
  };
}

function joinEs(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
}

function scopeSuffix(dsl: QueryDsl): string {
  const scope = describeFilters(dsl).map((c) => c.label).join(' · ');
  return scope ? ` (${scope})` : '';
}

/**
 * A templated answer built only from computed numbers — shown immediately and kept
 * whenever the LLM's phrasing fails summaryIsGrounded, so the answer bubble can never
 * show a figure that wasn't calculated.
 */
export function buildDeterministicAnswer(answer: QueryAnswer, dsl: QueryDsl): string {
  const scope = scopeSuffix(dsl);
  if (answer.clientTotal === 0) {
    return scope ? `No encontré equipos que cumplan los filtros${scope}.` : 'Todavía no hay equipos registrados.';
  }
  const totals = `${plural(answer.equipmentTotal, 'equipo', 'equipos')} en ${plural(answer.clientTotal, 'cliente', 'clientes')}`;

  if (answer.groups && dsl.groupBy) {
    const dim = GROUP_BY_LABEL[dsl.groupBy];
    const metricName = METRIC_LABEL[dsl.metric];
    const item = (g: QueryGroup) => `${g.label}: ${formatMetricValue(dsl.metric, g.value)}`;
    if (dsl.groupBy === 'ageBucket') {
      return `${metricName} por ${dim.singular}${scope}: ${answer.groups.map(item).join('; ')}. Total: ${totals}.`;
    }
    const shown = answer.groups.slice(0, 5);
    const rest = answer.groups.length - shown.length;
    const head =
      dsl.limit !== undefined
        ? `Top ${answer.groups.length} ${answer.groups.length === 1 ? dim.singular : dim.plural} por ${metricName.toLowerCase()}${scope}`
        : `${metricName} por ${dim.singular}${scope}`;
    const tail = rest > 0 ? ` y ${rest} más` : '';
    return `${head}: ${shown.map(item).join('; ')}${tail}. En total: ${plural(answer.groupsTotal, dim.singular, dim.plural)}, ${totals}.`;
  }

  const names = answer.institutions.slice(0, 3).map((i) => i.name);
  const who =
    answer.institutions.length === 1
      ? `: ${names[0]} (${joinEs(answer.byModality.map((m) => modalityCount(m.modality, m.count)))})`
      : answer.institutions.length <= 3
        ? `: ${joinEs(names)}`
        : `; los que más tienen: ${joinEs(names)}`;

  switch (dsl.metric) {
    case 'avgAge':
      return answer.overall === null
        ? `No hay datos de antigüedad para estos equipos${scope} (${totals}).`
        : `La antigüedad promedio es de ${formatMetricValue('avgAge', answer.overall)}${scope}, sobre ${totals}.`;
    case 'confidence':
      return `La confianza promedio es de ${formatMetricValue('confidence', answer.overall)}${scope}, sobre ${totals}.`;
    case 'clients':
      return `Son ${plural(answer.clientTotal, 'cliente', 'clientes')}${scope}, con ${plural(answer.equipmentTotal, 'equipo', 'equipos')} en total${who}.`;
    default:
      return `Encontré ${totals}${scope}${who}.`;
  }
}

/**
 * The exact data block the summary LLM sees: interpreted filters, metric with its unit,
 * totals, groups with readable labels, notes. summaryIsGrounded checks the LLM's reply
 * against this same text, so anything the model says must come from here.
 */
export function formatAnswerForSummary(answer: QueryAnswer, dsl: QueryDsl, notes: string[] = []): string {
  const lines: string[] = [];
  const filters = describeFilters(dsl).map((c) => c.label);
  lines.push(`Filtros aplicados: ${filters.length ? filters.join(' · ') : 'ninguno (todos los equipos)'}`);
  lines.push(`Métrica pedida: ${METRIC_LABEL[dsl.metric]}`);
  lines.push(`Total: ${plural(answer.equipmentTotal, 'equipo', 'equipos')} en ${plural(answer.clientTotal, 'cliente', 'clientes')}`);
  if (dsl.metric === 'avgAge' || dsl.metric === 'confidence') {
    lines.push(`${METRIC_LABEL[dsl.metric]} global: ${formatMetricValue(dsl.metric, answer.overall)}`);
  }

  if (answer.groups && dsl.groupBy) {
    const dim = GROUP_BY_LABEL[dsl.groupBy];
    const orderText = dsl.groupBy === 'ageBucket' ? '' : dsl.order === 'asc' ? ', de menor a mayor' : ', de mayor a menor';
    const shownText =
      answer.groups.length < answer.groupsTotal ? `${answer.groups.length} de ${answer.groupsTotal} ${dim.plural}` : `${answer.groupsTotal} ${dim.plural}`;
    lines.push(`Desglose por ${dim.singular} (${shownText}${orderText}):`);
    for (const g of answer.groups) {
      const extra = dsl.metric === 'count' ? '' : ` (${plural(g.equipmentCount, 'equipo', 'equipos')})`;
      lines.push(`- ${g.label}: ${formatMetricValue(dsl.metric, g.value)}${extra}`);
    }
  } else if (answer.clientTotal > 0) {
    lines.push('Clientes:');
    for (const i of answer.institutions.slice(0, 12)) {
      const where = [i.city, i.countryIso ? countryLabel(i.countryIso) : null].filter(Boolean).join(', ') || 'sin ubicación';
      lines.push(`- ${i.name} (${where}): ${plural(i.equipmentCount, 'equipo', 'equipos')}`);
    }
    if (answer.institutions.length > 12) lines.push(`… y ${answer.institutions.length - 12} clientes más`);
    lines.push(`Por modalidad: ${answer.byModality.map((m) => `${modalityLabel(m.modality)}: ${m.count}`).join(', ')}`);
  } else {
    lines.push('Sin resultados: ningún equipo cumple los filtros.');
  }

  if (notes.length) lines.push(`Notas: ${notes.join(' ')}`);
  return lines.join('\n');
}

function extractNumbers(text: string): number[] {
  return Array.from(text.matchAll(/\d+(?:[.,]\d+)?/g), (m) => parseFloat(m[0].replace(',', '.')));
}

/**
 * Accepts the LLM's prose only if every number in it appears in the data block it was
 * given (or in the question) — rounding allowed ("9 años" for 9.3). Anything else means
 * the model invented or garbled a figure, and the deterministic answer stays.
 */
export function summaryIsGrounded(summary: string, dataBlock: string, question: string): boolean {
  const text = summary.trim();
  if (text.length === 0 || text.length > 700) return false;
  const allowed = [...extractNumbers(dataBlock), ...extractNumbers(question)];
  return extractNumbers(text).every((n) => allowed.some((a) => Math.abs(a - n) < 0.051 || Math.round(a) === n));
}
