import { getDb } from '../client';
import { normalizeInstitutionName } from '../../core/normalize/text';
import { resolveInstitution, type InstitutionMatch } from '../../core/resolve/institution';

export type InstitutionRow = {
  id: string;
  name: string;
  nameNorm: string;
  site: string | null;
  city: string | null;
  countryIso: string | null;
  region: string | null;
  createdAt: string;
};

function fromRow(row: any): InstitutionRow {
  return {
    id: row.id,
    name: row.name,
    nameNorm: row.name_norm,
    site: row.site,
    city: row.city,
    countryIso: row.country_iso,
    region: row.region,
    createdAt: row.created_at,
  };
}

export async function listInstitutions(): Promise<InstitutionRow[]> {
  const db = await getDb();
  const res = await db.execute('SELECT * FROM institutions ORDER BY name COLLATE NOCASE');
  return (res.rows ?? []).map(fromRow);
}

export async function getInstitution(id: string): Promise<InstitutionRow | null> {
  const db = await getDb();
  const res = await db.execute('SELECT * FROM institutions WHERE id = ?', [id]);
  const row = res.rows?.[0];
  return row ? fromRow(row) : null;
}

export async function insertInstitution(input: {
  id: string;
  name: string;
  site: string | null;
  city: string | null;
  countryIso: string | null;
  region: string | null;
  createdAt: string;
}): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO institutions (id, name, name_norm, site, city, country_iso, region, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.id,
      input.name,
      normalizeInstitutionName(input.name),
      input.site,
      input.city,
      input.countryIso,
      input.region,
      input.createdAt,
    ]
  );
}

/**
 * Fetches the current roster and runs it through src/core/resolve/institution.ts.
 * `ask`-band matches are surfaced in the result but saveObservation.ts currently treats
 * them the same as `new` — the interactive "¿es el mismo que X?" confirmation UI is not
 * built yet, so nothing auto-merges on a merely-plausible name match.
 */
export async function matchInstitution(candidate: {
  name: string;
  city: string | null;
  countryIso: string | null;
}): Promise<InstitutionMatch> {
  const existing = await listInstitutions();
  return resolveInstitution(candidate, existing);
}
