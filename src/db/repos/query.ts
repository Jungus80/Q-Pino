import { getDb } from '../client';
import { compileStructuralQuery, type QueryEquipmentRow } from '../../core/query/compile';
import type { QueryDsl } from '../../core/query/dsl';

function fromRow(row: any): QueryEquipmentRow {
  return {
    institutionId: row.institution_id,
    institutionName: row.institution_name,
    modality: row.modality,
    manufacturer: row.manufacturer,
    count: row.count,
    installYearLo: row.install_year_lo,
    installYearHi: row.install_year_hi,
    statusManufacturer: row.status_manufacturer,
    statusModel: row.status_model,
    statusAge: row.status_age,
    statusCount: row.status_count,
    lastVerifiedAt: row.last_verified_at,
    countryIso: row.institution_country,
    city: row.institution_city,
    region: row.institution_region,
  };
}

/** Runs a QueryDsl's structural half (region/country/city/modality/manufacturer) as a
 * parameterized SQL query — see src/core/query/compile.ts for why the LLM never gets to
 * write SQL directly. Computed filters/grouping still need applyComputedFilters/
 * aggregateQuery on the result. */
export async function runStructuralQuery(dsl: QueryDsl): Promise<QueryEquipmentRow[]> {
  const db = await getDb();
  const { sql, params } = compileStructuralQuery(dsl);
  const res = await db.execute(sql, params as any[]);
  return (res.rows ?? []).map(fromRow);
}
