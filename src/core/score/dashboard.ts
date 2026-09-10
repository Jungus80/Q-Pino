import { computeConfidence } from './confidence';
import { renewalThresholdYears } from '../normalize/catalog';
import type { FieldStatus, Modality } from '../schema/observation';

export type DashboardEquipmentInput = {
  id: string;
  institutionId: string;
  modality: Modality;
  count: number | null;
  installYearLo: number | null;
  installYearHi: number | null;
  statusManufacturer: FieldStatus;
  statusModel: FieldStatus;
  statusAge: FieldStatus;
  statusCount: FieldStatus;
  lastVerifiedAt: string;
};

export type DashboardInstitutionInput = {
  id: string;
  name: string;
  countryIso: string | null;
};

const AGE_BUCKETS = ['0–3 años', '4–7 años', '8–10 años', '11+ años', 'Desconocida'] as const;
const STALE_DAYS = 365;

function ageMidpoint(lo: number | null, hi: number | null, now: Date): number | null {
  if (lo == null && hi == null) return null;
  const currentYear = now.getFullYear();
  const l = lo ?? hi!;
  const h = hi ?? lo!;
  return currentYear - (l + h) / 2;
}

function ageBucket(ageYears: number | null): (typeof AGE_BUCKETS)[number] {
  if (ageYears == null) return 'Desconocida';
  if (ageYears <= 3) return '0–3 años';
  if (ageYears <= 7) return '4–7 años';
  if (ageYears <= 10) return '8–10 años';
  return '11+ años';
}

export type DashboardData = {
  totalEquipment: number;
  byModality: { modality: Modality; count: number }[];
  byCountry: { countryIso: string; count: number }[];
  byAgeBucket: { bucket: string; count: number }[];
  agingClients: { institutionId: string; institutionName: string; modality: Modality; ageYears: number }[];
  incompleteClients: { institutionId: string; institutionName: string; incompleteCount: number }[];
  recentlyUpdated: { institutionId: string; institutionName: string; lastVerifiedAt: string }[];
  staleClients: { institutionId: string; institutionName: string; daysSinceVerified: number }[];
  avgConfidence: number;
  renewalOpportunities: {
    institutionId: string;
    institutionName: string;
    modality: Modality;
    ageYears: number;
    thresholdYears: number;
    confidence: number;
  }[];
};

/**
 * Aggregates the raw institutions + equipment rows into the 8 dashboard metrics the
 * challenge brief asks for. Pure/synchronous (no DB or LLM calls) so it's fully
 * unit-testable — the screen that renders this just fetches the rows and calls it.
 */
export function computeDashboard(
  institutions: DashboardInstitutionInput[],
  equipment: DashboardEquipmentInput[],
  now: Date = new Date()
): DashboardData {
  const institutionById = new Map(institutions.map((i) => [i.id, i]));
  const byModalityMap = new Map<Modality, number>();
  const byCountryMap = new Map<string, number>();
  const byAgeBucketMap = new Map<string, number>();
  const agingClients: DashboardData['agingClients'] = [];
  const renewalOpportunities: DashboardData['renewalOpportunities'] = [];
  const incompleteByInstitution = new Map<string, number>();
  const lastVerifiedByInstitution = new Map<string, string>();
  let totalEquipment = 0;
  let confidenceSum = 0;
  let confidenceCount = 0;

  for (const eq of equipment) {
    const inst = institutionById.get(eq.institutionId);
    if (!inst) continue;

    const units = eq.count ?? 1;
    totalEquipment += units;
    byModalityMap.set(eq.modality, (byModalityMap.get(eq.modality) ?? 0) + units);
    if (inst.countryIso) byCountryMap.set(inst.countryIso, (byCountryMap.get(inst.countryIso) ?? 0) + units);

    const ageYears = ageMidpoint(eq.installYearLo, eq.installYearHi, now);
    byAgeBucketMap.set(ageBucket(ageYears), (byAgeBucketMap.get(ageBucket(ageYears)) ?? 0) + units);

    const threshold = renewalThresholdYears(eq.modality);
    if (ageYears != null && ageYears >= threshold) {
      agingClients.push({ institutionId: inst.id, institutionName: inst.name, modality: eq.modality, ageYears: Math.round(ageYears) });
    }

    const missingCount = [eq.statusManufacturer, eq.statusModel, eq.statusAge].filter((s) => s === 'Desconocido').length;
    if (missingCount > 0) {
      incompleteByInstitution.set(inst.id, (incompleteByInstitution.get(inst.id) ?? 0) + missingCount);
    }

    const prevVerified = lastVerifiedByInstitution.get(inst.id);
    if (!prevVerified || eq.lastVerifiedAt > prevVerified) lastVerifiedByInstitution.set(inst.id, eq.lastVerifiedAt);

    const confidence = computeConfidence(
      { fieldStatus: { manufacturer: eq.statusManufacturer, model: eq.statusModel, age: eq.statusAge, count: eq.statusCount }, lastVerifiedAt: eq.lastVerifiedAt },
      now
    );
    confidenceSum += confidence.score;
    confidenceCount += 1;

    if (ageYears != null && ageYears >= threshold) {
      renewalOpportunities.push({
        institutionId: inst.id,
        institutionName: inst.name,
        modality: eq.modality,
        ageYears: Math.round(ageYears),
        thresholdYears: threshold,
        confidence: confidence.score,
      });
    }
  }

  const staleClients: DashboardData['staleClients'] = [];
  const recentlyUpdated: DashboardData['recentlyUpdated'] = [];
  for (const [institutionId, lastVerifiedAt] of lastVerifiedByInstitution) {
    const inst = institutionById.get(institutionId)!;
    const days = Math.floor((now.getTime() - new Date(lastVerifiedAt).getTime()) / 86_400_000);
    recentlyUpdated.push({ institutionId, institutionName: inst.name, lastVerifiedAt });
    if (days > STALE_DAYS) staleClients.push({ institutionId, institutionName: inst.name, daysSinceVerified: days });
  }
  recentlyUpdated.sort((a, b) => (a.lastVerifiedAt < b.lastVerifiedAt ? 1 : -1));
  staleClients.sort((a, b) => b.daysSinceVerified - a.daysSinceVerified);

  const incompleteClients: DashboardData['incompleteClients'] = Array.from(incompleteByInstitution.entries())
    .map(([institutionId, incompleteCount]) => ({ institutionId, institutionName: institutionById.get(institutionId)!.name, incompleteCount }))
    .sort((a, b) => b.incompleteCount - a.incompleteCount);

  renewalOpportunities.sort((a, b) => b.ageYears - b.thresholdYears - (a.ageYears - a.thresholdYears));

  return {
    totalEquipment,
    byModality: Array.from(byModalityMap.entries()).map(([modality, count]) => ({ modality, count })).sort((a, b) => b.count - a.count),
    byCountry: Array.from(byCountryMap.entries()).map(([countryIso, count]) => ({ countryIso, count })).sort((a, b) => b.count - a.count),
    byAgeBucket: AGE_BUCKETS.map((bucket) => ({ bucket, count: byAgeBucketMap.get(bucket) ?? 0 })),
    agingClients: agingClients.sort((a, b) => b.ageYears - a.ageYears),
    incompleteClients,
    recentlyUpdated: recentlyUpdated.slice(0, 5),
    staleClients,
    avgConfidence: confidenceCount === 0 ? 0 : Math.round(confidenceSum / confidenceCount),
    renewalOpportunities: renewalOpportunities.slice(0, 10),
  };
}
