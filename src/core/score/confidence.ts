import type { FieldStatus } from '../schema/observation';

const STATUS_WEIGHT: Record<FieldStatus, number> = {
  Confirmado: 1,
  Reportado: 0.7,
  Estimado: 0.4,
  Desconocido: 0,
};

const FRESHNESS_HALF_LIFE_DAYS = 180;

export type ConfidenceInput = {
  fieldStatus: { manufacturer: FieldStatus; model: FieldStatus; age: FieldStatus; count: FieldStatus };
  lastVerifiedAt: string; // ISO date
  independentConfirmations?: number; // distinct observers/days that reported this equipment; default 1
};

export type ConfidenceResult = {
  score: number; // 0-100
  band: 'Alta' | 'Media' | 'Baja';
  breakdown: { completeness: number; evidenceStrength: number; freshness: number; confirmations: number };
};

/**
 * Confidence score for one equipment record: 35% field completeness, 30% evidence
 * strength (average field status), 20% freshness (180-day half-life since last
 * verification), 15% independent confirmations (diminishing returns, 1 - 0.5^n).
 * Matches the formula in the architecture plan; conflict-penalty and multi-observation
 * confirmation counting land with entity resolution (phase 3) — `independentConfirmations`
 * defaults to 1 until then.
 */
export function computeConfidence(input: ConfidenceInput, now: Date = new Date()): ConfidenceResult {
  const statuses = Object.values(input.fieldStatus);
  const completeness = statuses.filter((s) => s !== 'Desconocido').length / statuses.length;
  const evidenceStrength = statuses.reduce((sum, s) => sum + STATUS_WEIGHT[s], 0) / statuses.length;

  const daysSinceVerified = Math.max(0, (now.getTime() - new Date(input.lastVerifiedAt).getTime()) / 86_400_000);
  const freshness = Math.pow(0.5, daysSinceVerified / FRESHNESS_HALF_LIFE_DAYS);

  const n = Math.max(1, input.independentConfirmations ?? 1);
  const confirmations = 1 - Math.pow(0.5, n - 1 + 1); // n=1 -> 0.5, n=2 -> 0.75, ...

  const score = 100 * (0.35 * completeness + 0.3 * evidenceStrength + 0.2 * freshness + 0.15 * confirmations);
  const band: ConfidenceResult['band'] = score >= 70 ? 'Alta' : score >= 40 ? 'Media' : 'Baja';

  return {
    score: Math.round(score),
    band,
    breakdown: {
      completeness: Math.round(completeness * 100),
      evidenceStrength: Math.round(evidenceStrength * 100),
      freshness: Math.round(freshness * 100),
      confirmations: Math.round(confirmations * 100),
    },
  };
}
