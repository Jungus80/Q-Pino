import { getDb } from '../client';
import { normalizeInstitutionName, nameSimilarity } from '../../core/normalize/text';

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

const AUTO_MATCH_THRESHOLD = 0.9;

/**
 * Lightweight MVP entity resolution: fuzzy-match a candidate institution name/city
 * against every existing institution and auto-attach above a conservative threshold.
 * This is intentionally simple — full multi-signal resolution (aliases, embeddings,
 * an ask-the-user band for the 0.75-0.9 zone) is phase 3 of the plan. Never merges
 * equipment; only decides which institution a new observation's equipment attaches to.
 */
export async function findMatchingInstitution(
  candidate: { name: string; city: string | null; countryIso: string | null }
): Promise<{ institution: InstitutionRow; score: number } | null> {
  const existing = await listInstitutions();
  let best: { institution: InstitutionRow; score: number } | null = null;

  for (const institution of existing) {
    if (candidate.countryIso && institution.countryIso && candidate.countryIso !== institution.countryIso) {
      continue; // blocking: never match across countries
    }
    const score = nameSimilarity(candidate.name, institution.name);
    if (score >= AUTO_MATCH_THRESHOLD && (!best || score > best.score)) {
      best = { institution, score };
    }
  }
  return best;
}
