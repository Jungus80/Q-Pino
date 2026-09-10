import { completion, QWEN3_5_2B_MULTIMODAL_Q4_K_M } from '@qvac/sdk';
import { extractedObservationSchema, type ExtractedObservation } from '../core/schema/observation';
import { OBSERVATION_EXTRACTION_SCHEMA } from '../core/schema/jsonSchemas';
import { EXTRACTION_SYSTEM_PROMPT } from './prompts/extraction';
import { withModel, type OnProgress } from './modelManager';

export type ExtractResult = {
  extraction: ExtractedObservation;
  raw: string;
};

/**
 * Runs the field observation (dictated or typed text) through the on-device LLM with a
 * JSON-schema-constrained completion (grammar-enforced, so parsing can't fail on
 * malformed JSON — see src/core/schema/jsonSchemas.ts for why the schema has no nullable
 * unions and why the model loads with reasoning_budget: 0).
 */
export async function extractObservation(
  text: string,
  onProgress?: OnProgress
): Promise<ExtractResult> {
  return withModel(
    {
      modelSrc: QWEN3_5_2B_MULTIMODAL_Q4_K_M,
      modelType: 'llm',
      modelConfig: {
        device: 'gpu',
        ctx_size: 4096,
        reasoning_budget: 0,
      },
      onProgress,
    },
    async (modelId) => {
      const run = completion({
        modelId,
        history: [
          { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
          { role: 'user', content: text },
        ],
        stream: false,
        kvCache: false,
        responseFormat: { type: 'json_schema', json_schema: OBSERVATION_EXTRACTION_SCHEMA },
        generationParams: { predict: 800, temp: 0 },
      });

      const final = await run.final;
      const parsed = JSON.parse(final.contentText);
      const extraction = extractedObservationSchema.parse(parsed);
      return { extraction, raw: final.contentText };
    }
  );
}
