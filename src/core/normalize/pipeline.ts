import { enrichFromCatalog } from './catalog';
import { normalizeGeo, stripTrailingPlaceName } from './geo';
import { parseAge } from './age';
import { isEvidenceAnchored, nameSimilarity } from './text';
import type {
  ExtractedObservation,
  NormalizedEquipment,
  NormalizedInstitution,
} from '../schema/observation';

/**
 * Discards a string value the LLM extracted unless the value itself is fuzzy-anchored in
 * the source transcript — the hallucination guard from the architecture plan. Checking the
 * *value* (not just its cited evidence span) matters: a model can cite a real, verbatim
 * quote from the transcript as "evidence" for a value that quote doesn't actually support
 * (e.g. evidence "dos resonadores Solara" backing manufacturer "Meridian Diagnostics") —
 * that passes an evidence-only check but should still be discarded.
 */
function anchoredOrNull(value: string | null, transcript: string): string | null {
  if (value == null) return null;
  return isEvidenceAnchored(value, transcript) ? value : null;
}

/**
 * Turns one LLM extraction into normalized institution + equipment records, ready for
 * review/persistence. Pure and synchronous — no LLM calls here, only the deterministic
 * catalog/geo/age/evidence layers from src/core/normalize, so this is fully unit-testable
 * without a device.
 */
export function normalizeObservation(
  extraction: ExtractedObservation,
  transcript: string,
  now: Date = new Date()
): { institution: NormalizedInstitution; equipment: NormalizedEquipment[] } {
  const geo = normalizeGeo({
    city: extraction.institution.city,
    country: extraction.institution.country,
  });

  const rawName = extraction.institution.name;
  const cleanedName = rawName ? stripTrailingPlaceName(rawName) : rawName;
  const name = anchoredOrNull(cleanedName, transcript);

  // A city value that's really just the institution's own name repeated (the same
  // field-bleed bug stripTrailingPlaceName guards against, on the other field) is worse
  // than no city at all — it would otherwise pass through as an unresolved "city".
  const cityLooksLikeName = name != null && geo.city != null && nameSimilarity(name, geo.city) > 0.85;

  const institution: NormalizedInstitution = {
    name,
    site: anchoredOrNull(extraction.institution.site, transcript),
    city: cityLooksLikeName ? null : geo.city,
    countryIso: geo.countryIso,
    region: geo.region,
  };

  const equipment: NormalizedEquipment[] = extraction.equipment.map((item) => {
    const manufacturer = anchoredOrNull(item.manufacturer, transcript);
    const model = anchoredOrNull(item.model, transcript);
    const serial = anchoredOrNull(item.serial, transcript);

    // A recognized catalog model can correct/complete manufacturer, and caps how old the
    // unit can be — it can't predate its own model's launch year.
    const enriched = enrichFromCatalog({ manufacturer, model, modality: item.modality });

    const ageEvidence = item.evidence.join('. ');
    const age = parseAge(
      {
        ageYearsMin: item.ageYearsMin,
        ageYearsMax: item.ageYearsMax,
        installYear: item.installYear,
        evidenceText: ageEvidence,
      },
      now
    );

    const installYearLo =
      enriched.minInstallYear != null
        ? Math.max(enriched.minInstallYear, age.installYearLo ?? enriched.minInstallYear)
        : age.installYearLo;
    const installYearHi =
      age.installYearHi != null ? Math.max(installYearLo ?? age.installYearHi, age.installYearHi) : installYearLo;

    return {
      modality: enriched.modality ?? item.modality,
      count: item.count,
      manufacturer: enriched.manufacturer,
      model: enriched.model,
      ageYearsMin: item.ageYearsMin,
      ageYearsMax: item.ageYearsMax,
      installYear: item.installYear,
      serial,
      whichUnit: item.whichUnit,
      fieldStatus: {
        ...item.fieldStatus,
        age: age.status,
      },
      evidence: item.evidence,
      installYearLo,
      installYearHi,
      catalogModelId: enriched.catalogModelId,
    };
  });

  return { institution, equipment };
}
