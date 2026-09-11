// Interpretation accuracy for Consultas (natural-language analytics questions). Runs the
// exact src/core code the app uses — analyzeQuestion + reconcileQueryDsl, no mocks —
// against a hand-labeled golden set. Two kinds of case:
//  - rules-only (no "llm" field): the LLM is assumed to have returned an empty DSL, so this
//    measures what the deterministic layer answers by itself (the floor when the model
//    fails or says nothing useful).
//  - regression (with "llm"): a real or directly analogous bad LLM output observed on the
//    device. The reconciled query must still be exactly right — these are the failures
//    that previously produced confident wrong answers.
// The comparison is strict over every DSL field, so an extra, unasked-for filter fails a
// case just like a missing one. Pure Node — the LLM itself can't run here (see README).
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { analyzeQuestion } from '../src/core/query/hints';
import { reconcileQueryDsl } from '../src/core/query/reconcile';
import { EMPTY_QUERY_DSL, type QueryDsl } from '../src/core/query/dsl';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Fixed clock (install-year → age conversions) and the seeded client roster.
const NOW = new Date('2026-09-10T00:00:00Z');
const INSTITUTIONS = ['Hospital Andino Sur', 'Clínica Litoral Norte', 'Centro Médico del Valle', 'Hospital DemoCare Pacific', 'Clínica Andes Altos'];

type GoldenCase = {
  id: string;
  q: string;
  expect: Partial<QueryDsl>;
  llm?: Partial<QueryDsl>;
  understood?: boolean;
  minNotes?: number;
  note?: string;
};

const FIELDS: (keyof QueryDsl)[] = [
  'region', 'country', 'city', 'modality', 'manufacturer', 'institution',
  'minAge', 'maxAge', 'minConfidence', 'incomplete', 'stale', 'renewalDue', 'groupBy', 'metric', 'limit', 'order',
];

function canonical(dsl: QueryDsl): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of FIELDS) {
    const value = dsl[field];
    if (Array.isArray(value)) {
      if (value.length) out[field] = [...value].sort();
    } else if (value !== undefined && value !== false) {
      out[field] = value;
    }
  }
  return out;
}

function main() {
  const cases: GoldenCase[] = readFileSync(join(__dirname, 'golden', 'query-questions.jsonl'), 'utf-8')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l));

  let rulesPass = 0;
  let rulesTotal = 0;
  let regressionPass = 0;
  let regressionTotal = 0;
  const failures: string[] = [];

  for (const c of cases) {
    const hints = analyzeQuestion(c.q, { now: NOW, institutions: INSTITUTIONS });
    const result = reconcileQueryDsl({ ...EMPTY_QUERY_DSL, ...c.llm }, hints);
    const got = canonical(result.dsl);
    const want = canonical({ ...EMPTY_QUERY_DSL, ...c.expect });
    const expectedUnderstood = c.understood ?? true;

    const problems: string[] = [];
    if (JSON.stringify(got) !== JSON.stringify(want)) problems.push(`dsl ${JSON.stringify(got)} ≠ ${JSON.stringify(want)}`);
    if (result.understood !== expectedUnderstood) problems.push(`understood=${result.understood}, se esperaba ${expectedUnderstood}`);
    if (c.minNotes !== undefined && result.notes.length < c.minNotes) problems.push(`notas=${result.notes.length}, se esperaban ≥${c.minNotes}`);

    const passed = problems.length === 0;
    if (c.llm) {
      regressionTotal++;
      if (passed) regressionPass++;
    } else {
      rulesTotal++;
      if (passed) rulesPass++;
    }
    console.log(`[${passed ? 'PASS' : 'FAIL'}] ${(c.llm ? 'regresión ' : 'reglas    ') + c.id.padEnd(34)} ${c.q}`);
    if (!passed) failures.push(`  ${c.id} («${c.q}»): ${problems.join('; ')}`);
  }

  const rulesRate = rulesTotal ? rulesPass / rulesTotal : 1;
  const regressionRate = regressionTotal ? regressionPass / regressionTotal : 1;

  console.log('\n--- Interpretación de Consultas ---');
  console.log(`Casos evaluados: ${cases.length}`);
  console.log(`Solo reglas (sin LLM):        ${(rulesRate * 100).toFixed(1)}%  (${rulesPass}/${rulesTotal})`);
  console.log(`Regresiones con salida de LLM: ${(regressionRate * 100).toFixed(1)}%  (${regressionPass}/${regressionTotal})`);
  if (failures.length) {
    console.log('\nCasos fallidos:');
    for (const f of failures) console.log(f);
  }

  const RULES_TARGET = 0.9;
  const REGRESSION_TARGET = 1;
  const passed = rulesRate >= RULES_TARGET && regressionRate >= REGRESSION_TARGET;
  console.log(`\n${passed ? '✅' : '❌'} Meta: solo reglas ≥${RULES_TARGET * 100}% y regresiones con LLM = ${REGRESSION_TARGET * 100}%`);
  process.exit(passed ? 0 : 1);
}

main();
