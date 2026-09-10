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

## Why extraction isn't evaluated here

The LLM-extraction half of the pipeline (dictated/typed text → structured JSON) only runs
inside QVAC's Bare worker, which is wired up for the Expo/React Native runtime — there's
no supported way to drive it from a bare Node script on the Mac. That half is validated
the other way instead: on-device testing against real phrases (see git history for the
extraction-prompt hardening rounds) plus `src/core/normalize`'s own unit tests, which cover
everything downstream of the LLM call (age-interval parsing, catalog enrichment, geo
resolution, evidence anchoring) with plain Vitest.
