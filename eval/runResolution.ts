// Precision/recall evaluation for entity resolution — the user's explicit top priority
// for this project ("máxima precisión, especialmente en la desduplicación"). Runs the
// exact same src/core code the app uses (stripTrailingPlaceName + resolveInstitution),
// no mocks, against a hand-labeled golden set of institution-name pairs. Pure Node, no
// device or QVAC runtime needed — see eval/README.md for why the LLM-extraction half of
// the pipeline isn't evaluated here.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { resolveInstitution, type InstitutionCandidate } from '../src/core/resolve/institution';
import { stripTrailingPlaceName } from '../src/core/normalize/geo';

const __dirname = dirname(fileURLToPath(import.meta.url));

type GoldenPair = {
  id: string;
  existing: { name: string; city: string | null; countryIso: string | null };
  candidate: { name: string; city: string | null; countryIso: string | null };
  expected: 'same' | 'different';
  note: string;
};

function loadGoldenSet(path: string): GoldenPair[] {
  const raw = readFileSync(path, 'utf-8');
  return raw
    .split('\n')
    .map((l: string) => l.trim())
    .filter(Boolean)
    .map((l: string) => JSON.parse(l));
}

// The plan's "precisión por pares ≥0.97 (nunca fusionar mal)" target is specifically
// about auto_merge — the one outcome that silently commits to a merge with no human in
// the loop. 'ask' on a true-negative pair is NOT a precision error: it defers to the
// user instead of guessing, which is the whole point of the three-band design. So
// precision is scored only against auto_merge, while recall counts both auto_merge and
// ask as "caught" (the pair wasn't silently missed as a new institution) — 'ask' is
// tracked separately as a borderline-rate signal, not folded into either metric.
function main() {
  const goldenSetPath = join(__dirname, 'golden', 'institution-pairs.jsonl');
  const pairs = loadGoldenSet(goldenSetPath);

  let autoMergeTruePositives = 0; // auto_merge, expected same
  let autoMergeFalsePositives = 0; // auto_merge, expected different — the dangerous error (wrong merge)
  let caughtSame = 0; // expected same, got auto_merge or ask (not silently lost)
  let expectedSameCount = 0;
  let askOnDifferent = 0; // expected different, got ask — safe but a borderline-threshold signal

  const failures: string[] = [];

  for (const pair of pairs) {
    const existing: InstitutionCandidate = { id: pair.id, ...pair.existing };
    const candidateName = stripTrailingPlaceName(pair.candidate.name);
    const match = resolveInstitution({ ...pair.candidate, name: candidateName }, [existing]);
    const score = match.kind === 'new' ? null : match.score;

    if (pair.expected === 'same') {
      expectedSameCount++;
      if (match.kind === 'auto_merge' || match.kind === 'ask') caughtSame++;
    }
    if (match.kind === 'auto_merge') {
      if (pair.expected === 'same') autoMergeTruePositives++;
      else autoMergeFalsePositives++;
    }
    if (match.kind === 'ask' && pair.expected === 'different') askOnDifferent++;

    // A case "fails" only on the outcomes that actually matter: a wrong auto-merge, or a
    // true duplicate silently filed as brand-new with no question asked at all.
    const isWrongMerge = match.kind === 'auto_merge' && pair.expected === 'different';
    const isMissedDuplicate = match.kind === 'new' && pair.expected === 'same';
    const failed = isWrongMerge || isMissedDuplicate;

    const scoreStr = score !== null ? score.toFixed(3) : '—';
    console.log(`[${failed ? 'FAIL' : 'PASS'}] ${pair.id.padEnd(32)} expected=${pair.expected.padEnd(9)} got=${match.kind.padEnd(10)} score=${scoreStr}`);
    if (failed) {
      failures.push(`  ${pair.id}: ${pair.note} (expected ${pair.expected}, got ${match.kind}, score=${scoreStr})`);
    }
  }

  const autoMergePrecision =
    autoMergeTruePositives + autoMergeFalsePositives === 0 ? 1 : autoMergeTruePositives / (autoMergeTruePositives + autoMergeFalsePositives);
  const catchRecall = expectedSameCount === 0 ? 1 : caughtSame / expectedSameCount;

  console.log('\n--- Resultados de desduplicación de instituciones ---');
  console.log(`Pares evaluados: ${pairs.length}`);
  console.log(`Precisión de auto-fusión: ${(autoMergePrecision * 100).toFixed(1)}%  (fusiones incorrectas: ${autoMergeFalsePositives})`);
  console.log(`Recall de detección (auto-fusión + pregunta): ${(catchRecall * 100).toFixed(1)}%  (duplicados perdidos en silencio: ${expectedSameCount - caughtSame})`);
  console.log(`Preguntas sobre pares realmente distintos: ${askOnDifferent} (costo de UX, no error de precisión)`);

  if (failures.length > 0) {
    console.log('\nCasos fallidos:');
    for (const f of failures) console.log(f);
  }

  const PRECISION_TARGET = 0.97;
  const RECALL_TARGET = 0.85;
  const passed = autoMergePrecision >= PRECISION_TARGET && catchRecall >= RECALL_TARGET;
  console.log(`\n${passed ? '✅' : '❌'} Meta: precisión de auto-fusión ≥${PRECISION_TARGET * 100}% y recall de detección ≥${RECALL_TARGET * 100}%`);
  process.exit(passed ? 0 : 1);
}

main();
