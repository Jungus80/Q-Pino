import { getDb } from '../client';
import type { FieldStatus, Modality } from '../../core/schema/observation';

export type EquipmentRow = {
  id: string;
  institutionId: string;
  modality: Modality;
  manufacturer: string | null;
  model: string | null;
  serial: string | null;
  count: number | null;
  installYearLo: number | null;
  installYearHi: number | null;
  statusManufacturer: FieldStatus;
  statusModel: FieldStatus;
  statusAge: FieldStatus;
  statusCount: FieldStatus;
  catalogModelId: string | null;
  whichUnit: string | null;
  lastVerifiedAt: string;
  createdAt: string;
};

function fromRow(row: any): EquipmentRow {
  return {
    id: row.id,
    institutionId: row.institution_id,
    modality: row.modality,
    manufacturer: row.manufacturer,
    model: row.model,
    serial: row.serial,
    count: row.count,
    installYearLo: row.install_year_lo,
    installYearHi: row.install_year_hi,
    statusManufacturer: row.status_manufacturer,
    statusModel: row.status_model,
    statusAge: row.status_age,
    statusCount: row.status_count,
    catalogModelId: row.catalog_model_id,
    whichUnit: row.which_unit,
    lastVerifiedAt: row.last_verified_at,
    createdAt: row.created_at,
  };
}

export async function listEquipmentForInstitution(institutionId: string): Promise<EquipmentRow[]> {
  const db = await getDb();
  const res = await db.execute(
    'SELECT * FROM equipment WHERE institution_id = ? ORDER BY modality, created_at',
    [institutionId]
  );
  return (res.rows ?? []).map(fromRow);
}

export async function listAllEquipment(): Promise<EquipmentRow[]> {
  const db = await getDb();
  const res = await db.execute('SELECT * FROM equipment');
  return (res.rows ?? []).map(fromRow);
}

export async function insertEquipment(input: {
  id: string;
  institutionId: string;
  modality: Modality;
  manufacturer: string | null;
  model: string | null;
  serial: string | null;
  count: number | null;
  installYearLo: number | null;
  installYearHi: number | null;
  statusManufacturer: FieldStatus;
  statusModel: FieldStatus;
  statusAge: FieldStatus;
  statusCount: FieldStatus;
  catalogModelId: string | null;
  whichUnit: string | null;
  lastVerifiedAt: string;
  createdAt: string;
}): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO equipment (
      id, institution_id, modality, manufacturer, model, serial, count,
      install_year_lo, install_year_hi, status_manufacturer, status_model, status_age,
      status_count, catalog_model_id, which_unit, last_verified_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.id,
      input.institutionId,
      input.modality,
      input.manufacturer,
      input.model,
      input.serial,
      input.count,
      input.installYearLo,
      input.installYearHi,
      input.statusManufacturer,
      input.statusModel,
      input.statusAge,
      input.statusCount,
      input.catalogModelId,
      input.whichUnit,
      input.lastVerifiedAt,
      input.createdAt,
    ]
  );
}
