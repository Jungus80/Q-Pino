import { completion } from '@qvac/sdk';
import { QUERY_SUMMARY_SYSTEM_PROMPT } from './prompts/querySummary';
import { LLM_LOAD_PARAMS, withModel, type OnProgress } from './modelManager';

/**
 * Second, unconstrained completion call: takes the question plus the already-computed
 * result, formatted by formatAnswerForSummary (src/core/query/answer.ts), and asks the
 * model to phrase a short natural-language answer from those exact numbers. The caller
 * must check the reply with summaryIsGrounded before showing it — this step can only get
 * the *wording* wrong, and that check is what keeps a garbled figure off the screen.
 */
export async function summarizeQueryResult(question: string, dataBlock: string, onProgress?: OnProgress): Promise<string> {
  return withModel(
    { ...LLM_LOAD_PARAMS, onProgress },
    async (modelId) => {
      const run = completion({
        modelId,
        history: [
          { role: 'system', content: QUERY_SUMMARY_SYSTEM_PROMPT },
          { role: 'user', content: `Pregunta: ${question}\n\nDatos calculados:\n${dataBlock}` },
        ],
        stream: false,
        kvCache: false,
        generationParams: { predict: 160, temp: 0.2 },
      });
      const final = await run.final;
      return final.contentText
        .replace(/<think>[\s\S]*?<\/think>/g, '')
        .replace(/^\s*(respuesta|answer|resposta)\s*:\s*/i, '')
        .replace(/^["“«]+|["”»]+$/g, '')
        .trim();
    }
  );
}
