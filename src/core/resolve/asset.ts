import { jaroWinkler, normalizeText } from '../normalize/text';
import type { FieldStatus } from '../schema/observation';

const STATUS_RANK: Record<FieldStatus, number> = { Confirmado: 3, Reportado: 2, Estimado: 1, Desconocido: 0 };
const atLeastReportado = (s: FieldStatus) => STATUS_RANK[s] >= STATUS_RANK.Reportado;

export type AssetSlot = {
  id: string;
  manufacturer: string | null;
  model: string | null;
  serial: string | null;
  installYearLo: number | null;
  installYearHi: number | null;
  statusManufacturer: FieldStatus;
  statusModel: FieldStatus;
  statusAge: FieldStatus;
  whichUnit: string | null;
  catalogModelId: string | null;
};

export type NewAssetClaim = {
  manufacturer: string | null;
  model: string | null;
  serial: string | null;
  installYearLo: number | null;
  installYearHi: number | null;
  statusManufacturer: FieldStatus;
  statusModel: FieldStatus;
  statusAge: FieldStatus;
  whichUnit: string | null;
  catalogModelId: string | null;
};

/**
 * Restrictions that block a merge outright regardless of how similar everything else
 * looks — false positives here are worse than a duplicate row, per the plan's precision
 * priority. Only compares fields where *both* sides clear a confidence bar (Reportado+):
 * two Desconocido/Estimado fields agreeing by chance shouldn't block or force a merge.
 */
export function hasHardConflict(claim: NewAssetClaim, slot: AssetSlot): boolean {
  if (claim.serial && slot.serial && normalizeText(claim.serial) !== normalizeText(slot.serial)) {
    return true;
  }

  if (
    claim.manufacturer &&
    slot.manufacturer &&
    atLeastReportado(claim.statusManufacturer) &&
    atLeastReportado(slot.statusManufacturer) &&
    jaroWinkler(normalizeText(claim.manufacturer), normalizeText(slot.manufacturer)) < 0.85
  ) {
    return true;
  }

  if (claim.catalogModelId && slot.catalogModelId && claim.catalogModelId !== slot.catalogModelId) {
    return true;
  }

  if (
    claim.installYearLo != null &&
    claim.installYearHi != null &&
    slot.installYearLo != null &&
    slot.installYearHi != null &&
    atLeastReportado(claim.statusAge) &&
    atLeastReportado(slot.statusAge) &&
    (claim.installYearHi < slot.installYearLo || slot.installYearHi < claim.installYearLo)
  ) {
    return true; // non-overlapping install-year intervals, both independently confident
  }

  return false;
}

/**
 * Soft-match score in [0, 1] for a claim against one slot that already cleared
 * hasHardConflict. Weighted like a (simplified) Fellegi-Sunter comparison: an exact serial
 * match alone is decisive; everything else accumulates more gradually.
 */
export function matchScore(claim: NewAssetClaim, slot: AssetSlot): number {
  if (claim.serial && slot.serial && normalizeText(claim.serial) === normalizeText(slot.serial)) {
    return 1;
  }

  // Each category only contributes to maxPoints when both sides actually have data for
  // it — a claim with few known fields shouldn't be penalized just for being sparse, as
  // long as whatever it does share with a slot matches strongly.
  let points = 0;
  let maxPoints = 0;

  if (claim.catalogModelId && slot.catalogModelId) {
    maxPoints += 3;
    points += claim.catalogModelId === slot.catalogModelId ? 3 : 0;
  } else if (claim.model && slot.model) {
    maxPoints += 3;
    points += jaroWinkler(normalizeText(claim.model), normalizeText(slot.model)) * 3;
  }

  if (claim.manufacturer && slot.manufacturer) {
    maxPoints += 2;
    points += jaroWinkler(normalizeText(claim.manufacturer), normalizeText(slot.manufacturer)) * 2;
  }

  if (claim.installYearLo != null && claim.installYearHi != null && slot.installYearLo != null && slot.installYearHi != null) {
    maxPoints += 2;
    const overlapLo = Math.max(claim.installYearLo, slot.installYearLo);
    const overlapHi = Math.min(claim.installYearHi, slot.installYearHi);
    const overlap = Math.max(0, overlapHi - overlapLo + 1);
    const union = Math.max(claim.installYearHi, slot.installYearHi) - Math.min(claim.installYearLo, slot.installYearLo) + 1;
    points += (overlap / union) * 2;
  }

  if (claim.whichUnit && slot.whichUnit) {
    maxPoints += 1;
    points += jaroWinkler(normalizeText(claim.whichUnit), normalizeText(slot.whichUnit)) * 1;
  }

  return maxPoints === 0 ? 0 : points / maxPoints;
}

const MIN_MATCH_SCORE = 0.35;
const AMBIGUITY_MARGIN = 0.15;

export type SlotAssignment =
  | { kind: 'matched'; slotId: string; score: number }
  | { kind: 'ambiguous'; candidateIds: string[] }
  | { kind: 'no_match' };

/**
 * Assigns a new equipment claim to the best existing slot, or explicitly declines to
 * guess. Per the plan: when the top two candidates are within AMBIGUITY_MARGIN of each
 * other, do not pick one — surface it as a question instead ("¿el de ~8 años es el de
 * marca A o el de marca B?") rather than risk silently attaching evidence to the wrong
 * unit.
 */
export function assignToSlot(claim: NewAssetClaim, slots: AssetSlot[]): SlotAssignment {
  const candidates = slots
    .filter((slot) => !hasHardConflict(claim, slot))
    .map((slot) => ({ slot, score: matchScore(claim, slot) }))
    .filter((c) => c.score >= MIN_MATCH_SCORE)
    .sort((a, b) => b.score - a.score);

  if (candidates.length === 0) return { kind: 'no_match' };

  if (candidates.length > 1 && candidates[0].score - candidates[1].score < AMBIGUITY_MARGIN) {
    return { kind: 'ambiguous', candidateIds: candidates.map((c) => c.slot.id) };
  }

  return { kind: 'matched', slotId: candidates[0].slot.id, score: candidates[0].score };
}
