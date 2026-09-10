import { getDb } from '../client';
import type { FieldStatus } from '../../core/schema/observation';

export type ClaimInput = {
  id: string;
  observationId: string;
  institutionId: string | null;
  equipmentId: string | null;
  field: string;
  value: string | null;
  status: FieldStatus;
  evidence: string | null;
  observerId: string;
  observedAt: string;
};

export async function insertClaims(claims: ClaimInput[]): Promise<void> {
  if (claims.length === 0) return;
  const db = await getDb();
  await db.transaction(async (tx) => {
    for (const c of claims) {
      await tx.execute(
        `INSERT INTO claims (id, observation_id, institution_id, equipment_id, field, value, status, evidence, observer_id, observed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [c.id, c.observationId, c.institutionId, c.equipmentId, c.field, c.value, c.status, c.evidence, c.observerId, c.observedAt]
      );
    }
  });
}

export type ClaimRow = ClaimInput;

function fromRow(row: any): ClaimRow {
  return {
    id: row.id,
    observationId: row.observation_id,
    institutionId: row.institution_id,
    equipmentId: row.equipment_id,
    field: row.field,
    value: row.value,
    status: row.status,
    evidence: row.evidence,
    observerId: row.observer_id,
    observedAt: row.observed_at,
  };
}

export async function listClaimsForEquipment(equipmentId: string): Promise<ClaimRow[]> {
  const db = await getDb();
  const res = await db.execute('SELECT * FROM claims WHERE equipment_id = ? ORDER BY observed_at', [equipmentId]);
  return (res.rows ?? []).map(fromRow);
}
