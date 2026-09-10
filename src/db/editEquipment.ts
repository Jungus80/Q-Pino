import { newId } from '../core/id';
import type { ExtractedObservation } from '../core/schema/observation';
import { insertObservation } from './repos/observations';
import { updateEquipmentFields, type EquipmentFieldPatch } from './repos/equipment';
import { insertClaims, type ClaimInput } from './repos/claims';

const DEFAULT_OBSERVER_ID = 'demo-observer';

const EMPTY_EXTRACTION: ExtractedObservation = {
  institution: { name: null, site: null, city: null, country: null, evidence: [] },
  equipment: [],
  comments: null,
  missing: [],
};

export type EquipmentEditPatch = {
  manufacturer?: string | null;
  model?: string | null;
  serial?: string | null;
  count?: number | null;
  installYearLo?: number | null;
  installYearHi?: number | null;
};

/**
 * Applies a manual correction from the Customer 360 equipment detail screen. A human
 * directly editing a field is the strongest possible evidence, so every changed field is
 * recorded as a 'Confirmado' claim — same append-only claims trail as an LLM-extracted
 * observation, just attached to a synthetic observation row (there's no dictated/typed
 * text behind a manual edit) so the schema's `claims.observation_id NOT NULL` still holds
 * and the edit shows up in the equipment's observation history like anything else.
 */
export async function saveEquipmentEdit(input: {
  equipmentId: string;
  patch: EquipmentEditPatch;
  observerId?: string;
}): Promise<void> {
  const observerId = input.observerId ?? DEFAULT_OBSERVER_ID;
  const now = new Date().toISOString();
  const observationId = newId('obs');

  await insertObservation({
    id: observationId,
    observerId,
    createdAt: now,
    source: 'text',
    rawText: '[Edición manual desde Customer 360]',
    transcript: null,
    comments: null,
    extraction: EMPTY_EXTRACTION,
  });

  const dbPatch: EquipmentFieldPatch = { lastVerifiedAt: now };
  const claims: ClaimInput[] = [];

  function claim(field: string, value: string | number | null) {
    claims.push({
      id: newId('claim'),
      observationId,
      institutionId: null,
      equipmentId: input.equipmentId,
      field,
      value: value == null ? null : String(value),
      status: 'Confirmado',
      evidence: 'Editado manualmente',
      observerId,
      observedAt: now,
    });
  }

  if ('manufacturer' in input.patch) {
    dbPatch.manufacturer = input.patch.manufacturer ?? null;
    dbPatch.statusManufacturer = 'Confirmado';
    claim('manufacturer', input.patch.manufacturer ?? null);
  }
  if ('model' in input.patch) {
    dbPatch.model = input.patch.model ?? null;
    dbPatch.statusModel = 'Confirmado';
    claim('model', input.patch.model ?? null);
  }
  if ('serial' in input.patch) {
    dbPatch.serial = input.patch.serial ?? null;
    claim('serial', input.patch.serial ?? null);
  }
  if ('count' in input.patch) {
    dbPatch.count = input.patch.count ?? null;
    dbPatch.statusCount = 'Confirmado';
    claim('count', input.patch.count ?? null);
  }
  if ('installYearLo' in input.patch || 'installYearHi' in input.patch) {
    dbPatch.installYearLo = input.patch.installYearLo ?? null;
    dbPatch.installYearHi = input.patch.installYearHi ?? input.patch.installYearLo ?? null;
    dbPatch.statusAge = 'Confirmado';
    claim('installYear', dbPatch.installYearLo ?? null);
  }

  await updateEquipmentFields(input.equipmentId, dbPatch);
  await insertClaims(claims);
}
