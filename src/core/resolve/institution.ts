import { nameSimilarity } from '../normalize/text';

export type InstitutionCandidate = {
  id: string;
  name: string;
  city: string | null;
  countryIso: string | null;
};

export type NewInstitutionClaim = {
  name: string;
  city: string | null;
  countryIso: string | null;
};

export type InstitutionMatch =
  | { kind: 'auto_merge'; institution: InstitutionCandidate; score: number }
  | { kind: 'ask'; institution: InstitutionCandidate; score: number }
  | { kind: 'new' };

// Calibrated against the golden-set-shaped test cases below, per the plan: high-confidence
// matches merge silently, the middle band asks the user ("¿Es el mismo que X?"), and
// anything below is treated as a new institution rather than risk a wrong merge.
export const AUTO_MERGE_THRESHOLD = 0.92;
export const ASK_THRESHOLD = 0.75;

/**
 * Matches a newly-observed institution against the existing roster. Blocks on country
 * (never compares across countries when both are known — cheap and keeps this close to
 * linear as the roster grows) then scores by fuzzy name similarity. Never merges assets;
 * this only decides which institution row a new observation's equipment attaches to.
 */
export function resolveInstitution(
  claim: NewInstitutionClaim,
  existing: InstitutionCandidate[]
): InstitutionMatch {
  let best: { institution: InstitutionCandidate; score: number } | null = null;

  for (const institution of existing) {
    if (claim.countryIso && institution.countryIso && claim.countryIso !== institution.countryIso) {
      continue;
    }
    const score = nameSimilarity(claim.name, institution.name);
    if (!best || score > best.score) {
      best = { institution, score };
    }
  }

  if (!best || best.score < ASK_THRESHOLD) return { kind: 'new' };
  if (best.score >= AUTO_MERGE_THRESHOLD) return { kind: 'auto_merge', ...best };
  return { kind: 'ask', ...best };
}
