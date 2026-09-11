import { completion } from '@qvac/sdk';
import { extractedObservationSchema, type ExtractedObservation } from '../core/schema/observation';
import { OBSERVATION_EXTRACTION_SCHEMA } from '../core/schema/jsonSchemas';
import { EXTRACTION_SYSTEM_PROMPT } from './prompts/extraction';
import { LLM_LOAD_PARAMS, withModel, type OnProgress } from './modelManager';

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
async function runExtraction(modelId: string, text: string): Promise<ExtractResult> {
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

export async function extractObservation(
  text: string,
  onProgress?: OnProgress
): Promise<ExtractResult> {
  return withModel({ ...LLM_LOAD_PARAMS, onProgress }, async (modelId) => {
    try {
      return await runExtraction(modelId, text);
    } catch (e) {
      // Smaller/weaker models (e.g. the Android CPU fallback) occasionally emit an
      // empty or truncated completion despite the grammar constraint — a transient
      // decoding hiccup, not a bad input. One retry clears it almost always; if it
      // doesn't, the original error is what's worth surfacing to the caller.
      if (!(e instanceof SyntaxError)) throw e;
      return await runExtraction(modelId, text);
    }
  });
}
