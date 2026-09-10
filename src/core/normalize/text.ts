// Deterministic string-matching primitives shared by extraction validation,
// evidence anchoring, and entity resolution. No LLM calls in this file —
// everything here must be cheap, offline, and unit-testable.

/** Lowercase, strip accents/diacritics, collapse whitespace, drop punctuation. */
export function normalizeText(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritics
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const INSTITUTION_STOPWORDS = new Set([
  'hospital',
  'hospitales',
  'clinica',
  'clinicas',
  'clinica',
  'centro',
  'medico',
  'medica',
  'centro medico',
  'de',
  'del',
  'la',
  'el',
  'los',
  'las',
  'y',
  'e',
  'hospital de',
  'clinic',
  'hosp',
  'hc',
  'hu',
  'unidad',
]);

/** Institution-name normalization: strip generic hospital/clinic words before fuzzy matching. */
export function normalizeInstitutionName(input: string): string {
  const normalized = normalizeText(input);
  const tokens = normalized.split(' ').filter((t) => t && !INSTITUTION_STOPWORDS.has(t));
  return tokens.join(' ');
}

/** Jaro similarity in [0, 1]. */
export function jaro(a: string, b: string): number {
  if (a === b) return 1;
  const aLen = a.length;
  const bLen = b.length;
  if (aLen === 0 || bLen === 0) return 0;

  const matchWindow = Math.max(0, Math.floor(Math.max(aLen, bLen) / 2) - 1);
  const aMatches = new Array(aLen).fill(false);
  const bMatches = new Array(bLen).fill(false);

  let matches = 0;
  for (let i = 0; i < aLen; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, bLen);
    for (let j = start; j < end; j++) {
      if (bMatches[j] || a[i] !== b[j]) continue;
      aMatches[i] = true;
      bMatches[j] = true;
      matches++;
      break;
    }
  }
  if (matches === 0) return 0;

  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < aLen; i++) {
    if (!aMatches[i]) continue;
    while (!bMatches[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }
  transpositions /= 2;

  return (matches / aLen + matches / bLen + (matches - transpositions) / matches) / 3;
}

/** Jaro-Winkler similarity in [0, 1]; boosts strings sharing a common prefix (max 4 chars). */
export function jaroWinkler(a: string, b: string, prefixScale = 0.1): number {
  const jaroScore = jaro(a, b);
  let prefixLen = 0;
  const maxPrefix = Math.min(4, a.length, b.length);
  while (prefixLen < maxPrefix && a[prefixLen] === b[prefixLen]) prefixLen++;
  return jaroScore + prefixLen * prefixScale * (1 - jaroScore);
}

/** Token-set similarity: Jaccard over the unique word sets, order-independent. */
export function tokenSetSimilarity(a: string, b: string): number {
  const aTokens = new Set(normalizeText(a).split(' ').filter(Boolean));
  const bTokens = new Set(normalizeText(b).split(' ').filter(Boolean));
  if (aTokens.size === 0 && bTokens.size === 0) return 1;
  if (aTokens.size === 0 || bTokens.size === 0) return 0;
  let intersection = 0;
  for (const t of aTokens) if (bTokens.has(t)) intersection++;
  const union = aTokens.size + bTokens.size - intersection;
  return intersection / union;
}

/**
 * Combined name-similarity score in [0, 1] for institution matching: the max of
 * Jaro-Winkler (good for typos/abbreviations) and token-set similarity (good for
 * reordered/partial names), both computed over stopword-stripped, accent-free text.
 */
export function nameSimilarity(a: string, b: string): number {
  const na = normalizeInstitutionName(a);
  const nb = normalizeInstitutionName(b);
  if (!na || !nb) return 0;
  return Math.max(jaroWinkler(na, nb), tokenSetSimilarity(na, nb));
}

/**
 * True if `needle` appears in `haystack` with high fuzzy confidence — used to anchor
 * LLM-extracted values back to the source transcript and discard unanchored (hallucinated)
 * values. Checks exact substring first (cheap, common case), then a sliding-window
 * Jaro-Winkler comparison against `needle`-length spans of the haystack.
 */
export function isEvidenceAnchored(needle: string, haystack: string, threshold = 0.85): boolean {
  const n = normalizeText(needle);
  const h = normalizeText(haystack);
  if (!n) return false;
  if (h.includes(n)) return true;

  const words = h.split(' ');
  const needleWordCount = Math.max(1, n.split(' ').length);
  for (let i = 0; i <= words.length - needleWordCount; i++) {
    const span = words.slice(i, i + needleWordCount).join(' ');
    if (jaroWinkler(n, span) >= threshold) return true;
  }
  return false;
}
