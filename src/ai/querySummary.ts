import { completion, QWEN3_5_2B_MULTIMODAL_Q4_K_M } from '@qvac/sdk';
import type { QueryEquipmentRow, QueryGroup } from '../core/query/compile';
import { QUERY_SUMMARY_SYSTEM_PROMPT } from './prompts/querySummary';
import { withModel, type OnProgress } from './modelManager';

function formatDataBlock(rows: QueryEquipmentRow[], groups: QueryGroup[] | null): string {
  if (groups) {
    if (groups.length === 0) return 'Sin grupos — la consulta no tiene resultados.';
    return groups.map((g) => `${g.key}: ${g.value}`).join('\n');
  }
  if (rows.length === 0) return 'Sin resultados — ningún equipo cumple los filtros.';
  const institutions = Array.from(new Map(rows.map((r) => [r.institutionId, r])).values());
  const equipmentTotal = rows.reduce((sum, r) => sum + (r.count ?? 1), 0);
  const lines = institutions
    .slice(0, 12)
    .map((r) => `- ${r.institutionName} (${r.city ?? '—'}, ${r.countryIso ?? '—'})`);
  return `Total: ${equipmentTotal} equipos en ${institutions.length} clientes\n${lines.join('\n')}${institutions.length > 12 ? `\n… y ${institutions.length - 12} más` : ''}`;
}

/**
 * Second, unconstrained completion call: takes the question plus the already-computed
 * result (deterministic — see src/core/query/compile.ts) and asks the model to phrase a
 * short natural-language answer grounded in those exact numbers. This is prose synthesis,
 * not extraction, so no json_schema — the numbers themselves were never at risk of
 * hallucination since they're computed in JS before this call ever runs; this step only
 * risks getting the *wording* wrong, which is a UX concern, not a data-integrity one.
 */
export async function summarizeQueryResult(
  question: string,
  rows: QueryEquipmentRow[],
  groups: QueryGroup[] | null,
  onProgress?: OnProgress
): Promise<string> {
  return withModel(
    {
      modelSrc: QWEN3_5_2B_MULTIMODAL_Q4_K_M,
      modelType: 'llm',
      modelConfig: { device: 'gpu', ctx_size: 4096, reasoning_budget: 0 },
      onProgress,
    },
    async (modelId) => {
      const dataBlock = formatDataBlock(rows, groups);
      const run = completion({
        modelId,
        history: [
          { role: 'system', content: QUERY_SUMMARY_SYSTEM_PROMPT },
          { role: 'user', content: `Pregunta: ${question}\n\nDatos calculados:\n${dataBlock}` },
        ],
        stream: false,
        kvCache: false,
        generationParams: { predict: 150, temp: 0.3 },
      });
      const final = await run.final;
      return final.contentText.trim();
    }
  );
}
