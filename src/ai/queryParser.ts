import { completion } from '@qvac/sdk';
import { QUERY_DSL_SCHEMA } from '../core/schema/jsonSchemas';
import { EMPTY_QUERY_DSL, queryDslSchema, type QueryDsl } from '../core/query/dsl';
import { analyzeQuestion } from '../core/query/hints';
import { reconcileQueryDsl, type ReconciledQuery } from '../core/query/reconcile';
import { QUERY_SYSTEM_PROMPT } from './prompts/query';
import { LLM_LOAD_PARAMS, withModel, type OnProgress } from './modelManager';

export type ParseQueryOptions = {
  /** Names of the stored clients, so the question can be matched against them. */
  institutions?: string[];
  onProgress?: OnProgress;
};

/**
 * Translates a natural-language analytics question into a QueryDsl: a grammar-constrained
 * completion proposes one (the model never writes SQL — src/core/query/compile.ts is the
 * only place a QueryDsl becomes a query, always parameterized), and
 * src/core/query/reconcile.ts anchors it against a deterministic reading of the question
 * (src/core/query/hints.ts), dropping anything the question never mentioned and resolving
 * free text to canonical values ("Brasil" → "BR", "Solara" → "Solara Health").
 *
 * If the model fails (load error, malformed JSON), the rules-only reading still answers,
 * with a note saying so — a model hiccup shouldn't turn an answerable question into an
 * error message.
 */
export async function parseNaturalLanguageQuery(question: string, options: ParseQueryOptions = {}): Promise<ReconciledQuery> {
  const hints = analyzeQuestion(question, { institutions: options.institutions });

  let llmDsl: QueryDsl = EMPTY_QUERY_DSL;
  let llmFailed = false;
  try {
    llmDsl = await withModel(
      { ...LLM_LOAD_PARAMS, onProgress: options.onProgress },
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
        return queryDslSchema.parse(JSON.parse(final.contentText));
      }
    );
  } catch (e) {
    llmFailed = true;
    console.warn('[consultas] LLM query parse failed, using rules only:', e);
  }

  const result = reconcileQueryDsl(llmDsl, hints);
  if (llmFailed && result.understood) {
    result.notes.push('El modelo no respondió a tiempo; interpreté la pregunta solo con reglas.');
  }
  if (__DEV__) {
    console.log('[consultas]', JSON.stringify({ question, llm: llmFailed ? null : llmDsl, final: result.dsl, notes: result.notes }));
  }
  return result;
}
