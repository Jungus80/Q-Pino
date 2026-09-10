import { getDb } from '../client';
import type { ExtractedObservation, ObservationSource } from '../../core/schema/observation';

export type ObservationRow = {
  id: string;
  observerId: string;
  createdAt: string;
  source: ObservationSource;
  rawText: string;
  transcript: string | null;
  comments: string | null;
  extraction: ExtractedObservation;
};

function fromRow(row: any): ObservationRow {
  return {
    id: row.id,
    observerId: row.observer_id,
    createdAt: row.created_at,
    source: row.source,
    rawText: row.raw_text,
    transcript: row.transcript,
    comments: row.comments,
    extraction: JSON.parse(row.extraction_json),
  };
}

export async function insertObservation(input: {
  id: string;
  observerId: string;
  createdAt: string;
  source: ObservationSource;
  rawText: string;
  transcript: string | null;
  comments: string | null;
  extraction: ExtractedObservation;
}): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO observations (id, observer_id, created_at, source, raw_text, transcript, comments, extraction_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.id,
      input.observerId,
      input.createdAt,
      input.source,
      input.rawText,
      input.transcript,
      input.comments,
      JSON.stringify(input.extraction),
    ]
  );
}

export async function listObservationsForInstitution(institutionId: string): Promise<ObservationRow[]> {
  const db = await getDb();
  const res = await db.execute(
    `SELECT DISTINCT o.* FROM observations o
     JOIN claims c ON c.observation_id = o.id
     WHERE c.institution_id = ?
     ORDER BY o.created_at DESC`,
    [institutionId]
  );
  return (res.rows ?? []).map(fromRow);
}
