import { newId } from '../core/id';
import { assignToSlot, type AssetSlot, type NewAssetClaim } from '../core/resolve/asset';
import { reconcileCount } from '../core/resolve/fleet';
import { chooseBetween } from '../core/truth/consolidate';
import type {
  ExtractedObservation,
  FieldStatus,
  NormalizedEquipment,
  NormalizedInstitution,
  ObservationSource,
} from '../core/schema/observation';
import { matchInstitution, insertInstitution } from './repos/institutions';
import {
  insertEquipment,
  listEquipmentForInstitutionModality,
  updateEquipmentFields,
  type EquipmentRow,
} from './repos/equipment';
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
  /** Set when the caller already resolved an 'ask'-band institution match via its own
   * confirmation UI (see the capture screen) — attaches to this institution directly
   * instead of re-running matchInstitution(). */
  forceInstitutionId?: string;
};

export type EquipmentOutcome =
  | { kind: 'created'; equipmentId: string; modality: string }
  | { kind: 'updated'; equipmentId: string; modality: string; changedFields: string[] }
  | { kind: 'count_conflict'; equipmentId: string; modality: string; existingCount: number; incomingCount: number }
  | { kind: 'ambiguous'; modality: string; candidateEquipmentIds: string[] }
  | { kind: 'skipped_no_count_no_details'; modality: string };

export type SaveObservationResult = {
  observationId: string;
  institutionId: string;
  institutionCreated: boolean;
  institutionMatchKind: 'auto_merge' | 'ask' | 'new' | 'confirmed';
  equipment: EquipmentOutcome[];
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

function toAssetSlot(row: EquipmentRow): AssetSlot {
  return {
    id: row.id,
    manufacturer: row.manufacturer,
    model: row.model,
    serial: row.serial,
    installYearLo: row.installYearLo,
    installYearHi: row.installYearHi,
    statusManufacturer: row.statusManufacturer,
    statusModel: row.statusModel,
    statusAge: row.statusAge,
    whichUnit: null, // not persisted per-row today; slot matching still works off the rest
    catalogModelId: row.catalogModelId,
  };
}

function toAssetClaim(item: NormalizedEquipment): NewAssetClaim {
  return {
    manufacturer: item.manufacturer,
    model: item.model,
    serial: item.serial,
    installYearLo: item.installYearLo,
    installYearHi: item.installYearHi,
    statusManufacturer: item.fieldStatus.manufacturer,
    statusModel: item.fieldStatus.model,
    statusAge: item.fieldStatus.age,
    whichUnit: item.whichUnit,
    catalogModelId: item.catalogModelId,
  };
}

/**
 * Persists one reviewed observation through the full entity-resolution pipeline: matches
 * (or creates) the institution, then for each equipment claim either merges it onto an
 * existing piece of equipment, creates a new one, reconciles a fleet-count claim, or
 * leaves an ambiguous claim unassigned rather than guess (see src/core/resolve/asset.ts).
 * Every field written or considered is recorded as a claim regardless of outcome, so the
 * evidence trail exists even for claims that didn't change anything.
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
  let matchKind: SaveObservationResult['institutionMatchKind'];

  if (input.forceInstitutionId) {
    institutionId = input.forceInstitutionId;
    matchKind = 'confirmed';
  } else {
    const match =
      input.institution.name != null
        ? await matchInstitution({
            name: input.institution.name,
            city: input.institution.city,
            countryIso: input.institution.countryIso,
          })
        : { kind: 'new' as const };
    matchKind = match.kind;

    if (match.kind === 'auto_merge') {
      institutionId = match.institution.id;
    } else {
      // 'ask'-band matches land here when the caller didn't resolve them via
      // forceInstitutionId (e.g. the confirmation UI was skipped or the user said "no,
      // it's a new client") — falls through to creating a new institution.
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
  }

  const base = { observationId, observerId, observedAt: now };
  const claims: ClaimInput[] = [];

  if (input.institution.name) {
    claims.push(claim(base, { institutionId, equipmentId: null }, 'name', input.institution.name, 'Reportado', input.institution.name));
  }
  if (input.institution.city) {
    claims.push(claim(base, { institutionId, equipmentId: null }, 'city', input.institution.city, 'Reportado', input.institution.city));
  }
  if (input.institution.countryIso) {
    claims.push(
      claim(base, { institutionId, equipmentId: null }, 'country', input.institution.countryIso, 'Reportado', input.institution.countryIso)
    );
  }

  const outcomes: EquipmentOutcome[] = [];

  for (const item of input.equipment) {
    const evidence = item.evidence.join('. ') || null;
    const hasDetails = Boolean(item.manufacturer || item.model || item.serial || item.whichUnit);
    const existingRows = await listEquipmentForInstitutionModality(institutionId, item.modality);

    if (!hasDetails) {
      // A bare fleet-level claim ("tienen dos resonadores", "son del año 2010") with
      // nothing distinguishing one unit from another. It can still carry a count and/or
      // an age — both get reconciled against a single existing aggregate row when there's
      // exactly one; a claim with neither count nor age has nothing to reconcile at all.
      // With more than one existing row, the fleet has already been split into distinct
      // tracked units, so a bare claim can't be safely folded into any one of them —
      // record it as its own row for visibility instead of guessing which unit it means.
      if (item.count == null && item.installYearLo == null) {
        outcomes.push({ kind: 'skipped_no_count_no_details', modality: item.modality });
        continue;
      }

      const soleAggregate = existingRows.length === 1 ? existingRows[0] : null;
      if (soleAggregate) {
        const patch: Parameters<typeof updateEquipmentFields>[1] = { lastVerifiedAt: now };
        const changedFields: string[] = [];
        let conflict = false;

        if (item.count != null) {
          const reconciled = reconcileCount(
            { count: soleAggregate.count ?? 0, status: soleAggregate.statusCount, observedAt: soleAggregate.lastVerifiedAt },
            { count: item.count, status: item.fieldStatus.count, observedAt: now }
          );
          patch.count = reconciled.count;
          patch.statusCount = reconciled.status;
          conflict = reconciled.conflict;
          changedFields.push('count');
          claims.push(claim(base, { institutionId: null, equipmentId: soleAggregate.id }, 'count', item.count, item.fieldStatus.count, evidence));
        }

        if (item.installYearLo != null) {
          const r = chooseBetween(
            soleAggregate.installYearLo != null
              ? { value: soleAggregate.installYearLo, status: soleAggregate.statusAge, observedAt: soleAggregate.lastVerifiedAt }
              : null,
            { value: item.installYearLo, status: item.fieldStatus.age, observedAt: now }
          );
          if (r.changed) {
            patch.installYearLo = item.installYearLo;
            patch.installYearHi = item.installYearHi;
            patch.statusAge = r.status;
            changedFields.push('age');
          }
          claims.push(claim(base, { institutionId: null, equipmentId: soleAggregate.id }, 'installYear', item.installYearLo, item.fieldStatus.age, evidence));
        }

        await updateEquipmentFields(soleAggregate.id, patch);
        outcomes.push(
          conflict
            ? { kind: 'count_conflict', equipmentId: soleAggregate.id, modality: item.modality, existingCount: soleAggregate.count ?? 0, incomingCount: item.count ?? 0 }
            : { kind: 'updated', equipmentId: soleAggregate.id, modality: item.modality, changedFields }
        );
        continue;
      }

      const equipmentId = newId('eq');
      await insertEquipment({
        id: equipmentId,
        institutionId,
        modality: item.modality,
        manufacturer: null,
        model: null,
        serial: null,
        count: item.count,
        installYearLo: item.installYearLo,
        installYearHi: item.installYearHi,
        statusManufacturer: 'Desconocido',
        statusModel: 'Desconocido',
        statusAge: item.fieldStatus.age,
        statusCount: item.fieldStatus.count,
        catalogModelId: null,
        whichUnit: null,
        lastVerifiedAt: now,
        createdAt: now,
      });
      if (item.count != null) claims.push(claim(base, { institutionId: null, equipmentId }, 'count', item.count, item.fieldStatus.count, evidence));
      if (item.installYearLo != null) claims.push(claim(base, { institutionId: null, equipmentId }, 'installYear', item.installYearLo, item.fieldStatus.age, evidence));
      outcomes.push({ kind: 'created', equipmentId, modality: item.modality });
      continue;
    }

    // Claim carries distinguishing detail — try to attach it to a specific existing unit.
    const assignment = assignToSlot(toAssetClaim(item), existingRows.map(toAssetSlot));

    if (assignment.kind === 'ambiguous') {
      claims.push(claim(base, { institutionId: null, equipmentId: null }, 'unassigned_equipment_claim', item.model ?? item.manufacturer, item.fieldStatus.model, evidence));
      outcomes.push({ kind: 'ambiguous', modality: item.modality, candidateEquipmentIds: assignment.candidateIds });
      continue;
    }

    if (assignment.kind === 'matched') {
      const existing = existingRows.find((r) => r.id === assignment.slotId)!;
      const changedFields: string[] = [];
      const patch: Parameters<typeof updateEquipmentFields>[1] = { lastVerifiedAt: now };

      if (item.manufacturer) {
        const r = chooseBetween(
          { value: existing.manufacturer, status: existing.statusManufacturer, observedAt: existing.lastVerifiedAt },
          { value: item.manufacturer, status: item.fieldStatus.manufacturer, observedAt: now }
        );
        if (r.changed) {
          patch.manufacturer = r.value;
          patch.statusManufacturer = r.status;
          changedFields.push('manufacturer');
        }
      }
      if (item.model) {
        const r = chooseBetween(
          { value: existing.model, status: existing.statusModel, observedAt: existing.lastVerifiedAt },
          { value: item.model, status: item.fieldStatus.model, observedAt: now }
        );
        if (r.changed) {
          patch.model = r.value;
          patch.statusModel = r.status;
          changedFields.push('model');
        }
      }
      if (item.serial && !existing.serial) {
        patch.serial = item.serial;
        changedFields.push('serial');
      }
      if (item.installYearLo != null) {
        const r = chooseBetween(
          existing.installYearLo != null
            ? { value: existing.installYearLo, status: existing.statusAge, observedAt: existing.lastVerifiedAt }
            : null,
          { value: item.installYearLo, status: item.fieldStatus.age, observedAt: now }
        );
        if (r.changed) {
          patch.installYearLo = item.installYearLo;
          patch.installYearHi = item.installYearHi;
          patch.statusAge = r.status;
          changedFields.push('age');
        }
      }
      if (item.catalogModelId && !existing.catalogModelId) {
        patch.catalogModelId = item.catalogModelId;
      }

      await updateEquipmentFields(existing.id, patch);
      claims.push(claim(base, { institutionId: null, equipmentId: existing.id }, 'match', item.model ?? item.manufacturer, item.fieldStatus.model, evidence));
      outcomes.push({ kind: 'updated', equipmentId: existing.id, modality: item.modality, changedFields });
      continue;
    }

    // no_match — a genuinely new, distinct piece of equipment.
    const equipmentId = newId('eq');
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
    if (item.manufacturer) claims.push(claim(base, { institutionId: null, equipmentId }, 'manufacturer', item.manufacturer, item.fieldStatus.manufacturer, evidence));
    if (item.model) claims.push(claim(base, { institutionId: null, equipmentId }, 'model', item.model, item.fieldStatus.model, evidence));
    if (item.serial) claims.push(claim(base, { institutionId: null, equipmentId }, 'serial', item.serial, 'Confirmado', evidence));
    if (item.count != null) claims.push(claim(base, { institutionId: null, equipmentId }, 'count', item.count, item.fieldStatus.count, evidence));
    outcomes.push({ kind: 'created', equipmentId, modality: item.modality });
  }

  await insertClaims(claims);

  return {
    observationId,
    institutionId,
    institutionCreated,
    institutionMatchKind: matchKind,
    equipment: outcomes,
  };
}
