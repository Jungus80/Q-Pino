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

// A single approximate figure ("unos ocho años") is widened outward by this many
// years on each side before being converted to an install-year interval, since a
// point age estimate is never as precise as an explicit range.
const SINGLE_ESTIMATE_WIDEN_YEARS = 2;

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

  if (installYear != null) {
    return {
      installYearLo: installYear,
      installYearHi: installYear,
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
