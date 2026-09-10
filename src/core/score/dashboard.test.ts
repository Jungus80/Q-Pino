import { describe, expect, it } from 'vitest';
import { computeDashboard, type DashboardEquipmentInput, type DashboardInstitutionInput } from './dashboard';

const NOW = new Date('2026-09-10T00:00:00Z');

const institutions: DashboardInstitutionInput[] = [
  { id: 'i1', name: 'Hospital Alpha', countryIso: 'PA' },
  { id: 'i2', name: 'Hospital Beta', countryIso: 'BR' },
];

function eq(overrides: Partial<DashboardEquipmentInput>): DashboardEquipmentInput {
  return {
    id: 'e1',
    institutionId: 'i1',
    modality: 'MR',
    count: 1,
    installYearLo: null,
    installYearHi: null,
    statusManufacturer: 'Desconocido',
    statusModel: 'Desconocido',
    statusAge: 'Desconocido',
    statusCount: 'Reportado',
    lastVerifiedAt: NOW.toISOString(),
    ...overrides,
  };
}

describe('computeDashboard', () => {
  it('aggregates equipment counts by modality and country', () => {
    const equipment = [
      eq({ id: 'e1', institutionId: 'i1', modality: 'MR', count: 2 }),
      eq({ id: 'e2', institutionId: 'i2', modality: 'CT', count: 3 }),
    ];
    const result = computeDashboard(institutions, equipment, NOW);
    expect(result.totalEquipment).toBe(5);
    expect(result.byModality).toEqual(expect.arrayContaining([{ modality: 'MR', count: 2 }, { modality: 'CT', count: 3 }]));
    expect(result.byCountry).toEqual(expect.arrayContaining([{ countryIso: 'PA', count: 2 }, { countryIso: 'BR', count: 3 }]));
  });

  it('buckets equipment by estimated age, including unknown', () => {
    const equipment = [
      eq({ id: 'e1', installYearLo: NOW.getFullYear() - 2, installYearHi: NOW.getFullYear() - 2 }), // 2yr -> 0-3
      eq({ id: 'e2', installYearLo: NOW.getFullYear() - 12, installYearHi: NOW.getFullYear() - 12 }), // 12yr -> 11+
      eq({ id: 'e3' }), // unknown
    ];
    const result = computeDashboard(institutions, equipment, NOW);
    const byBucket = Object.fromEntries(result.byAgeBucket.map((b) => [b.bucket, b.count]));
    expect(byBucket['0–3 años']).toBe(1);
    expect(byBucket['11+ años']).toBe(1);
    expect(byBucket['Desconocida']).toBe(1);
  });

  it('flags a client with equipment older than its modality renewal threshold', () => {
    // MR threshold is 10 years per the catalog
    const equipment = [eq({ id: 'e1', modality: 'MR', installYearLo: NOW.getFullYear() - 12, installYearHi: NOW.getFullYear() - 12 })];
    const result = computeDashboard(institutions, equipment, NOW);
    expect(result.agingClients).toHaveLength(1);
    expect(result.agingClients[0].institutionName).toBe('Hospital Alpha');
    expect(result.renewalOpportunities).toHaveLength(1);
  });

  it('does not flag equipment within the renewal threshold', () => {
    const equipment = [eq({ id: 'e1', modality: 'MR', installYearLo: NOW.getFullYear() - 3, installYearHi: NOW.getFullYear() - 3 })];
    const result = computeDashboard(institutions, equipment, NOW);
    expect(result.agingClients).toHaveLength(0);
  });

  it('counts a client as incomplete when any field status is Desconocido', () => {
    const equipment = [eq({ id: 'e1', statusManufacturer: 'Desconocido', statusModel: 'Reportado', statusAge: 'Reportado' })];
    const result = computeDashboard(institutions, equipment, NOW);
    expect(result.incompleteClients).toHaveLength(1);
    expect(result.incompleteClients[0].incompleteCount).toBe(1);
  });

  it('flags stale clients (>365 days since last verified) and excludes fresh ones', () => {
    const stale = new Date(NOW.getTime() - 400 * 86_400_000).toISOString();
    const fresh = new Date(NOW.getTime() - 10 * 86_400_000).toISOString();
    const equipment = [
      eq({ id: 'e1', institutionId: 'i1', lastVerifiedAt: stale }),
      eq({ id: 'e2', institutionId: 'i2', lastVerifiedAt: fresh }),
    ];
    const result = computeDashboard(institutions, equipment, NOW);
    expect(result.staleClients.map((s) => s.institutionId)).toEqual(['i1']);
  });

  it('computes an average confidence across all equipment', () => {
    const equipment = [
      eq({ id: 'e1', statusManufacturer: 'Confirmado', statusModel: 'Confirmado', statusAge: 'Confirmado', statusCount: 'Confirmado' }),
      eq({ id: 'e2', statusManufacturer: 'Desconocido', statusModel: 'Desconocido', statusAge: 'Desconocido', statusCount: 'Desconocido' }),
    ];
    const result = computeDashboard(institutions, equipment, NOW);
    expect(result.avgConfidence).toBeGreaterThan(0);
    expect(result.avgConfidence).toBeLessThan(100);
  });

  it('returns zeroed output for no equipment', () => {
    const result = computeDashboard(institutions, [], NOW);
    expect(result.totalEquipment).toBe(0);
    expect(result.avgConfidence).toBe(0);
    expect(result.agingClients).toHaveLength(0);
  });
});
