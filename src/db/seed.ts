import { newId } from '../core/id';
import { listInstitutions, insertInstitution } from './repos/institutions';
import { insertEquipment } from './repos/equipment';
import { insertObservation } from './repos/observations';
import { insertClaims, type ClaimInput } from './repos/claims';
import type { ExtractedObservation } from '../core/schema/observation';

// Small synthetic dataset (fictional institutions, fictional catalog equipment) so the
// Clientes list and dashboard have something to show before the demo captures its first
// real observation — per the challenge brief's data guardrail, nothing here is real.
const SEED_OBSERVER_ID = 'seed';

type SeedEquipment = {
  modality: string;
  manufacturer: string | null;
  model: string | null;
  catalogModelId: string | null;
  count: number | null;
  installYearLo: number | null;
  installYearHi: number | null;
  statusAge: 'Confirmado' | 'Reportado' | 'Estimado' | 'Desconocido';
  statusManufacturer: 'Confirmado' | 'Reportado' | 'Estimado' | 'Desconocido';
  ageMonthsAgo: number; // last_verified_at freshness, for the alerts/dashboard demo
};

type SeedInstitution = {
  name: string;
  site: string | null;
  city: string;
  countryIso: string;
  region: string;
  equipment: SeedEquipment[];
};

const SEED: SeedInstitution[] = [
  {
    name: 'Hospital Andino Sur',
    site: null,
    city: 'Bogotá',
    countryIso: 'CO',
    region: 'LATAM',
    equipment: [
      { modality: 'MR', manufacturer: 'Solara Health', model: 'Solara Magna 1.5T', catalogModelId: 'solara-magna-1.5t', count: 2, installYearLo: 2015, installYearHi: 2015, statusAge: 'Reportado', statusManufacturer: 'Confirmado', ageMonthsAgo: 2 },
      { modality: 'CT', manufacturer: 'Northfield Medical', model: 'Northfield Vantage 32', catalogModelId: 'northfield-vantage-32', count: 1, installYearLo: 2011, installYearHi: 2011, statusAge: 'Confirmado', statusManufacturer: 'Confirmado', ageMonthsAgo: 14 },
    ],
  },
  {
    name: 'Clínica Litoral Norte',
    site: 'Torre B',
    city: 'São Paulo',
    countryIso: 'BR',
    region: 'LATAM',
    equipment: [
      { modality: 'US', manufacturer: 'Meridian Diagnostics', model: 'Meridian Wave Pro', catalogModelId: 'meridian-wave-pro', count: 3, installYearLo: 2021, installYearHi: 2021, statusAge: 'Reportado', statusManufacturer: 'Reportado', ageMonthsAgo: 1 },
      { modality: 'MG', manufacturer: 'Verdant Imaging', model: 'Verdant Clarity', catalogModelId: 'verdant-clarity', count: 1, installYearLo: 2018, installYearHi: 2018, statusAge: 'Estimado', statusManufacturer: 'Estimado', ageMonthsAgo: 8 },
    ],
  },
  {
    name: 'Centro Médico del Valle',
    site: null,
    city: 'Ciudad de México',
    countryIso: 'MX',
    region: 'LATAM',
    equipment: [
      { modality: 'CT', manufacturer: 'Solara Health', model: 'Solara Spectra Elite', catalogModelId: 'solara-spectra-elite', count: 1, installYearLo: 2019, installYearHi: 2019, statusAge: 'Reportado', statusManufacturer: 'Confirmado', ageMonthsAgo: 3 },
      { modality: 'XR', manufacturer: 'Northfield Medical', model: 'Northfield DuraRay', catalogModelId: 'northfield-duraray', count: 2, installYearLo: 2016, installYearHi: 2016, statusAge: 'Estimado', statusManufacturer: 'Reportado', ageMonthsAgo: 16 },
      { modality: 'MONITORING', manufacturer: 'Kestrel Health Systems', model: 'Kestrel VitalWatch', catalogModelId: 'kestrel-vitalwatch', count: 12, installYearLo: 2019, installYearHi: 2019, statusAge: 'Reportado', statusManufacturer: 'Reportado', ageMonthsAgo: 5 },
    ],
  },
  {
    name: 'Hospital DemoCare Pacific',
    site: null,
    city: 'Ciudad de Panamá',
    countryIso: 'PA',
    region: 'LATAM',
    equipment: [
      { modality: 'MR', manufacturer: 'Meridian Diagnostics', model: 'Meridian Pulse', catalogModelId: 'meridian-pulse', count: 1, installYearLo: 2012, installYearHi: 2012, statusAge: 'Confirmado', statusManufacturer: 'Confirmado', ageMonthsAgo: 20 },
    ],
  },
  {
    name: 'Clínica Andes Altos',
    site: null,
    city: 'Lima',
    countryIso: 'PE',
    region: 'LATAM',
    equipment: [
      { modality: 'US', manufacturer: null, model: null, catalogModelId: null, count: 2, installYearLo: null, installYearHi: null, statusAge: 'Desconocido', statusManufacturer: 'Desconocido', ageMonthsAgo: 0 },
    ],
  },
];

function monthsAgoIso(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString();
}

export async function seedIfEmpty(): Promise<void> {
  const existing = await listInstitutions();
  if (existing.length > 0) return;

  for (const inst of SEED) {
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
