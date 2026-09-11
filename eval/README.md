# Eval

## `npm run eval:resolution`

Precision/recall for institution entity resolution — the project's stated top priority
("máxima precisión, especialmente en la desduplicación") — against a hand-labeled golden
set (`golden/institution-pairs.jsonl`, 24 pairs covering exact matches, accent/typo drift,
the field-bleed bug class fixed this session, cross-country same-name chains, and
same-network hard negatives).

Runs the real `src/core` code (`stripTrailingPlaceName` + `resolveInstitution`) in plain
Node via `tsx` — no device, no QVAC runtime, no mocks. Gates on the architecture plan's
targets: **auto-merge precision ≥97%** (a wrong silent merge is the dangerous failure) and
**detection recall ≥85%** (auto-merge + ask both count as "caught" — `ask` defers to the
user instead of guessing, so it's not a precision error, only a UX cost tracked
separately). Exits non-zero when either target is missed, so `AUTO_MERGE_THRESHOLD` /
`ASK_THRESHOLD` in `src/core/resolve/institution.ts` can be recalibrated against this set
whenever they change.

## `npm run eval:query`

Interpretation accuracy for Consultas — natural-language analytics questions → the
`QueryDsl` that actually runs. Runs the real `src/core/query` code (`analyzeQuestion` +
`reconcileQueryDsl`) against `golden/query-questions.jsonl`: es/pt/en phrasings, typos,
every query type (filters, breakdowns, metrics, top-N, renewal, stale/incomplete, single
client), exclusions and off-topic questions.

Two kinds of case, scored separately:

- **Rules only** (no `llm` field): the model is assumed to have returned nothing, so this
  is the deterministic floor — what still gets answered when the LLM fails. Target ≥90%.
- **Regressions** (`llm` field): a bad LLM output observed on the device (every-modality
  lists, invented countries, placeholder values, invented flags/ages, values in the wrong
  slot…). The reconciled query must be exactly right. Target 100%.

Comparison is strict over every DSL field, so an unasked-for extra filter fails a case the
same as a missing one. When a new misreading shows up on the device, add it here with the
model's actual output in `llm` before fixing it.

## Why extraction isn't evaluated here

The LLM-extraction half of the pipeline (dictated/typed text → structured JSON) only runs
inside QVAC's Bare worker, which is wired up for the Expo/React Native runtime — there's
no supported way to drive it from a bare Node script on the Mac. That half is validated
the other way instead: on-device testing against real phrases (see git history for the
extraction-prompt hardening rounds) plus `src/core/normalize`'s own unit tests, which cover
everything downstream of the LLM call (age-interval parsing, catalog enrichment, geo
resolution, evidence anchoring) with plain Vitest.
