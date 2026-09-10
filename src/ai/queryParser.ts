import { completion, QWEN3_5_2B_MULTIMODAL_Q4_K_M } from '@qvac/sdk';
import { QUERY_DSL_SCHEMA } from '../core/schema/jsonSchemas';
import { queryDslSchema, type QueryDsl } from '../core/query/dsl';
import { findCountry, findCity } from '../core/normalize/geo';
import { QUERY_SYSTEM_PROMPT } from './prompts/query';
import { withModel, type OnProgress } from './modelManager';

/**
 * Translates a natural-language analytics question into a QueryDsl filter via a
 * grammar-constrained completion — the model never writes SQL (see
 * src/core/query/compile.ts for the only place a QueryDsl becomes a query, always
 * parameterized). Free-text country/city names from the model are resolved to the
 * gazetteer's ISO codes the same way observation capture does, so "Brasil" and "brazil"
 * both compile to country: ["BR"].
 */
export async function parseNaturalLanguageQuery(question: string, onProgress?: OnProgress): Promise<QueryDsl> {
  return withModel(
    {
      modelSrc: QWEN3_5_2B_MULTIMODAL_Q4_K_M,
      modelType: 'llm',
      modelConfig: { device: 'gpu', ctx_size: 4096, reasoning_budget: 0 },
      onProgress,
    },
    async (modelId) => {
      const run = completion({
        modelId,
        history: [
          { role: 'system', content: QUERY_SYSTEM_PROMPT },
          { role: 'user', content: question },
        ],
        stream: false,
        kvCache: false,
        responseFormat: { type: 'json_schema', json_schema: QUERY_DSL_SCHEMA },
        generationParams: { predict: 300, temp: 0 },
      });

      const final = await run.final;
      const parsed = JSON.parse(final.contentText);
      const raw = queryDslSchema.parse(parsed);

      const country = raw.country
        .map((c) => findCountry(c)?.iso ?? c.toUpperCase())
        .filter((iso, i, arr) => arr.indexOf(iso) === i);
      const city = raw.city.map((c) => findCity(c)?.name ?? c);

      return queryDslSchema.parse({ ...raw, country, city });
    }
  );
}
