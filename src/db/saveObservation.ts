import { newId } from '../core/id';
import type {
  ExtractedObservation,
  FieldStatus,
  NormalizedEquipment,
  NormalizedInstitution,
  ObservationSource,
} from '../core/schema/observation';
import { findMatchingInstitution, insertInstitution } from './repos/institutions';
import { insertEquipment } from './repos/equipment';
import { insertObservation } from './repos/observations';
import { insertClaims, type ClaimInput } from './repos/claims';

const DEFAULT_OBSERVER_ID = 'demo-observer';

export type SaveObservationInput = {
  rawText: string;
  transcript: string | null;
  comments: string | null;
  source: ObservationSource;
  extraction: ExtractedObservation;
  institution: NormalizedInstitution;
  equipment: NormalizedEquipment[];
  observerId?: string;
};

export type SaveObservationResult = {
  observationId: string;
  institutionId: string;
  institutionCreated: boolean;
  equipmentIds: string[];
};

function claim(
  base: { observationId: string; observerId: string; observedAt: string },
  target: { institutionId: string | null; equipmentId: string | null },
  field: string,
  value: string | number | null,
  status: FieldStatus,
  evidence: string | null
): ClaimInput {
  return {
    id: newId('claim'),
    observationId: base.observationId,
    institutionId: target.institutionId,
    equipmentId: target.equipmentId,
    field,
    value: value == null ? null : String(value),
    status,
    evidence,
    observerId: base.observerId,
    observedAt: base.observedAt,
  };
}

/**
 * Persists one reviewed observation: matches (or creates) the institution, inserts an
 * equipment row per item, and records a claim per field so every current value stays
 * backed by the observation that asserted it. Not wrapped in a single DB transaction
 * across all three repos (op-sqlite transactions are per-connection-callback) — if this
 * throws partway through, the caller should treat the observation as unsaved and retry;
 * nothing here is exposed to the UI as "saved" until it returns.
 */
export async function saveObservation(input: SaveObservationInput): Promise<SaveObservationResult> {
  const observerId = input.observerId ?? DEFAULT_OBSERVER_ID;
  const now = new Date().toISOString();
  const observationId = newId('obs');

  await insertObservation({
    id: observationId,
    observerId,
    createdAt: now,
    source: input.source,
    rawText: input.rawText,
    transcript: input.transcript,
    comments: input.comments,
    extraction: input.extraction,
  });

  let institutionId: string;
  let institutionCreated = false;

  const match =
    input.institution.name != null
      ? await findMatchingInstitution({
          name: input.institution.name,
          city: input.institution.city,
          countryIso: input.institution.countryIso,
        })
      : null;

  if (match) {
    institutionId = match.institution.id;
  } else {
    institutionId = newId('inst');
    institutionCreated = true;
    await insertInstitution({
      id: institutionId,
      name: input.institution.name ?? 'Cliente sin nombre',
      site: input.institution.site,
      city: input.institution.city,
      countryIso: input.institution.countryIso,
      region: input.institution.region,
      createdAt: now,
    });
  }

  const base = { observationId, observerId, observedAt: now };
  const claims: ClaimInput[] = [];

  if (input.institution.name) {
    claims.push(
      claim(base, { institutionId, equipmentId: null }, 'name', input.institution.name, 'Reportado', input.institution.name)
    );
  }
  if (input.institution.city) {
    claims.push(claim(base, { institutionId, equipmentId: null }, 'city', input.institution.city, 'Reportado', input.institution.city));
  }
  if (input.institution.countryIso) {
    claims.push(
      claim(base, { institutionId, equipmentId: null }, 'country', input.institution.countryIso, 'Reportado', input.institution.countryIso)
    );
  }

  const equipmentIds: string[] = [];
  for (const item of input.equipment) {
    const equipmentId = newId('eq');
    equipmentIds.push(equipmentId);
    const evidence = item.evidence.join('. ') || null;

    await insertEquipment({
      id: equipmentId,
      institutionId,
      modality: item.modality,
      manufacturer: item.manufacturer,
      model: item.model,
      serial: item.serial,
      count: item.count,
      installYearLo: item.installYearLo,
      installYearHi: item.installYearHi,
      statusManufacturer: item.fieldStatus.manufacturer,
      statusModel: item.fieldStatus.model,
      statusAge: item.fieldStatus.age,
      statusCount: item.fieldStatus.count,
      catalogModelId: item.catalogModelId,
      whichUnit: item.whichUnit,
      lastVerifiedAt: now,
      createdAt: now,
    });

    const target = { institutionId: null, equipmentId };
    if (item.manufacturer) claims.push(claim(base, target, 'manufacturer', item.manufacturer, item.fieldStatus.manufacturer, evidence));
    if (item.model) claims.push(claim(base, target, 'model', item.model, item.fieldStatus.model, evidence));
    if (item.serial) claims.push(claim(base, target, 'serial', item.serial, 'Confirmado', evidence));
    if (item.count != null) claims.push(claim(base, target, 'count', item.count, item.fieldStatus.count, evidence));
    if (item.installYearLo != null) {
      claims.push(claim(base, target, 'installYear', `${item.installYearLo}-${item.installYearHi}`, item.fieldStatus.age, evidence));
    }
  }

  await insertClaims(claims);

  return { observationId, institutionId, institutionCreated, equipmentIds };
}
