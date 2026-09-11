import { SEED_INSTITUTIONS } from '../core/demo/seedInstitutions';
import { newId } from '../core/id';
import { listInstitutions, insertInstitution } from './repos/institutions';
import { insertEquipment } from './repos/equipment';
import { insertObservation } from './repos/observations';
import { insertClaims, type ClaimInput } from './repos/claims';
import type { ExtractedObservation } from '../core/schema/observation';

const SEED_OBSERVER_ID = 'seed';

function monthsAgoIso(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString();
}

export async function seedIfEmpty(): Promise<void> {
  const existing = await listInstitutions();
  if (existing.length > 0) return;

  for (const inst of SEED_INSTITUTIONS) {
    const institutionId = newId('inst');
    const createdAt = monthsAgoIso(Math.max(...inst.equipment.map((e) => e.ageMonthsAgo), 1));

    await insertInstitution({
      id: institutionId,
      name: inst.name,
      site: inst.site,
      city: inst.city,
      countryIso: inst.countryIso,
      region: inst.region,
      createdAt,
    });

    const extraction: ExtractedObservation = {
      institution: { name: inst.name, site: inst.site, city: inst.city, country: inst.countryIso, evidence: [inst.name] },
      equipment: [],
      comments: 'Dato de siembra (dataset sintético de demostración).',
      missing: [],
    };
    const observationId = newId('obs');
    await insertObservation({
      id: observationId,
      observerId: SEED_OBSERVER_ID,
      createdAt,
      source: 'text',
      rawText: `[Seed] ${inst.name}`,
      transcript: null,
      comments: extraction.comments,
      extraction,
    });

    const claims: ClaimInput[] = [];
    for (const eq of inst.equipment) {
      const equipmentId = newId('eq');
      const verifiedAt = monthsAgoIso(eq.ageMonthsAgo);
      await insertEquipment({
        id: equipmentId,
        institutionId,
        modality: eq.modality as any,
        manufacturer: eq.manufacturer,
        model: eq.model,
        serial: null,
        count: eq.count,
        installYearLo: eq.installYearLo,
        installYearHi: eq.installYearHi,
        statusManufacturer: eq.statusManufacturer,
        statusModel: eq.statusManufacturer,
        statusAge: eq.statusAge,
        statusCount: eq.count != null ? 'Reportado' : 'Desconocido',
        catalogModelId: eq.catalogModelId,
        whichUnit: null,
        lastVerifiedAt: verifiedAt,
        createdAt: verifiedAt,
      });
      if (eq.manufacturer) {
        claims.push({
          id: newId('claim'),
          observationId,
          institutionId: null,
          equipmentId,
          field: 'manufacturer',
          value: eq.manufacturer,
          status: eq.statusManufacturer,
          evidence: null,
          observerId: SEED_OBSERVER_ID,
          observedAt: verifiedAt,
        });
      }
    }
    await insertClaims(claims);
  }
}
