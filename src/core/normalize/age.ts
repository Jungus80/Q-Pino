import type { FieldStatus } from '../schema/observation';
import { normalizeText } from './text';

export type AgeInterval = {
  installYearLo: number | null;
  installYearHi: number | null;
  status: FieldStatus;
};

// Matched against accent-stripped, lowercased evidence text (via normalizeText) so
// accented forms ("confirmé", "aproximadamente") and JS regex's ASCII-only \b word
// boundaries never silently fail to match.
const CONFIRMED_PATTERN =
  /\b(confirme|confirmado|confirmei|verifique|verificado|verifiquei|vi la placa|lei a placa|segun la placa|leida la placa|read the (plate|label)|checked the (plate|label)|confirmed|verified)\b/;

// Calendar years spoken as "año 2005" / "del año 2005" / "instalado en 2019".
// Evidence is accent-stripped ("año" → "ano"). Small models often fill ageYears
// (0–60) instead of installYear — 60 then becomes currentYear − 60 (1966 in 2026).
const CALENDAR_YEAR_PATTERNS = [
  /(?:ano|year)\s+(?:de\s+)?(19[7-9]\d|20[0-3]\d)\b/,
  /\b(?:del|en)\s+(19[7-9]\d|20[0-3]\d)\b/,
];

// A single approximate figure ("unos ocho años") is used directly without widening
// into an interval, as requested for exact calculations.
const SINGLE_ESTIMATE_WIDEN_YEARS = 0;

export function extractCalendarYearFromEvidence(evidenceText: string | null, currentYear: number): number | null {
  const evidence = normalizeText(evidenceText ?? '');
  if (!evidence) return null;
  for (const pattern of CALENDAR_YEAR_PATTERNS) {
    const match = evidence.match(pattern);
    if (!match) continue;
    const year = Number(match[1]);
    if (year >= 1970 && year <= currentYear) return year;
  }
  return null;
}

/**
 * Parse an age/installation-year expression into an install-year interval plus a
 * field status. Age-in-years claims are always at least Estimado (an age spoken in
 * years is inherently approximate in this domain); an explicit install year is
 * Reportado unless `evidenceText` contains plate/verification language, which
 * upgrades either kind of claim to Confirmado.
 */
export function parseAge(
  params: {
    ageYearsMin: number | null;
    ageYearsMax: number | null;
    installYear: number | null;
    evidenceText: string | null;
  },
  now: Date = new Date()
): AgeInterval {
  const { ageYearsMin, ageYearsMax, installYear, evidenceText } = params;
  const currentYear = now.getFullYear();
  const evidence = normalizeText(evidenceText ?? '');
  const confirmed = CONFIRMED_PATTERN.test(evidence);
  const spokenYear = extractCalendarYearFromEvidence(evidenceText, currentYear);

  // An explicit calendar year in the quote beats a structured age-in-years (or a
  // conflicting installYear the model invented). "del año 2005" must not become 1966.
  const resolvedYear = spokenYear ?? installYear;
  if (resolvedYear != null) {
    return {
      installYearLo: resolvedYear,
      installYearHi: resolvedYear,
      status: confirmed ? 'Confirmado' : 'Reportado',
    };
  }

  if (ageYearsMin != null || ageYearsMax != null) {
    let lo = ageYearsMin ?? ageYearsMax!;
    let hi = ageYearsMax ?? ageYearsMin!;
    if (lo === hi) {
      lo = Math.max(0, lo - SINGLE_ESTIMATE_WIDEN_YEARS);
      hi = hi + SINGLE_ESTIMATE_WIDEN_YEARS;
    }

    return {
      installYearLo: currentYear - hi,
      installYearHi: currentYear - lo,
      status: confirmed ? 'Confirmado' : 'Estimado',
    };
  }

  return { installYearLo: null, installYearHi: null, status: 'Desconocido' };
}

/** Midpoint age in years for an install-year interval, or null if unknown. */
export function ageMidpointYears(installYearLo: number | null, installYearHi: number | null, now: Date = new Date()): number | null {
  if (installYearLo == null && installYearHi == null) return null;
  const currentYear = now.getFullYear();
  const lo = installYearLo ?? installYearHi!;
  const hi = installYearHi ?? installYearLo!;
  return currentYear - (lo + hi) / 2;
}
