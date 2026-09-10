import { open, type DB } from '@op-engineering/op-sqlite';

// Append-only-ish schema: observations and claims are never overwritten (see
// src/core/schema/observation.ts and the architecture plan). `equipment` and
// `institutions` currently hold the *current* denormalized values an observation
// writes directly (single-observer MVP, no entity resolution yet) — phase 3 replaces
// that direct write with proper multi-observation consolidation over `claims` without
// changing this schema, since claims are already recorded alongside every write.
const MIGRATIONS: string[] = [
  `CREATE TABLE IF NOT EXISTS institutions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    name_norm TEXT NOT NULL,
    site TEXT,
    city TEXT,
    country_iso TEXT,
    region TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_institutions_name_norm ON institutions(name_norm)`,
  `CREATE TABLE IF NOT EXISTS equipment (
    id TEXT PRIMARY KEY,
    institution_id TEXT NOT NULL REFERENCES institutions(id),
    modality TEXT NOT NULL,
    manufacturer TEXT,
    model TEXT,
    serial TEXT,
    count INTEGER,
    install_year_lo INTEGER,
    install_year_hi INTEGER,
    status_manufacturer TEXT NOT NULL,
    status_model TEXT NOT NULL,
    status_age TEXT NOT NULL,
    status_count TEXT NOT NULL,
    catalog_model_id TEXT,
    which_unit TEXT,
    last_verified_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_equipment_institution ON equipment(institution_id)`,
  `CREATE TABLE IF NOT EXISTS observations (
    id TEXT PRIMARY KEY,
    observer_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    source TEXT NOT NULL,
    raw_text TEXT NOT NULL,
    transcript TEXT,
    comments TEXT,
    extraction_json TEXT NOT NULL
  )`,
  // One row per field this observation asserted a value for — on an institution, on a
  // piece of equipment, or (equipment_id/institution_id both null) unresolved at save
  // time. Never updated or deleted; this is the evidence trail behind every current value.
  `CREATE TABLE IF NOT EXISTS claims (
    id TEXT PRIMARY KEY,
    observation_id TEXT NOT NULL REFERENCES observations(id),
    institution_id TEXT REFERENCES institutions(id),
    equipment_id TEXT REFERENCES equipment(id),
    field TEXT NOT NULL,
    value TEXT,
    status TEXT NOT NULL,
    evidence TEXT,
    observer_id TEXT NOT NULL,
    observed_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_claims_equipment ON claims(equipment_id)`,
  `CREATE INDEX IF NOT EXISTS idx_claims_institution ON claims(institution_id)`,
];

let dbInstance: DB | null = null;

/** Opens (or returns the already-open) app database and applies any pending migrations. */
export async function getDb(): Promise<DB> {
  if (dbInstance) return dbInstance;

  const db = open({ name: 'installed-base.db' });
  for (const statement of MIGRATIONS) {
    await db.execute(statement);
  }
  dbInstance = db;
  return db;
}

/** Test/dev-only: drops every table so the next getDb() starts from a clean schema. */
export async function resetDb(): Promise<void> {
  const db = await getDb();
  await db.execute('DROP TABLE IF EXISTS claims');
  await db.execute('DROP TABLE IF EXISTS observations');
  await db.execute('DROP TABLE IF EXISTS equipment');
  await db.execute('DROP TABLE IF EXISTS institutions');
  dbInstance = null;
  await getDb();
}
