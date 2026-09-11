import gazetteerData from './gazetteer.json';
import { jaroWinkler, normalizeText } from './text';

export type Country = { iso: string; region: string; label: string; names: string[] };
export type City = { name: string; countryIso: string; lat: number; lon: number; aliases: string[] };
export type Region = { code: string; name: string; aliases: string[] };
export type Subregion = { name: string; aliases: string[]; countries: string[] };

const gazetteer = gazetteerData as { regions: Region[]; subregions: Subregion[]; countries: Country[]; cities: City[] };

export const REGIONS = gazetteer.regions;
export const SUBREGIONS = gazetteer.subregions;
export const COUNTRIES = gazetteer.countries;
export const CITIES = gazetteer.cities;

export function regionForCountry(iso: string): string | null {
  return COUNTRIES.find((c) => c.iso === iso)?.region ?? null;
}

/** Display name for an ISO code ("BR" → "Brasil"); falls back to the code itself. */
export function countryLabel(iso: string): string {
  return COUNTRIES.find((c) => c.iso === iso)?.label ?? iso;
}

/**
 * A region the analytics query can filter on: either a top-level gazetteer region
 * (key = its code, e.g. "LATAM" — what institutions.region stores) or a subregion like
 * "Sudamérica" (key = its name) that exists only as a named set of countries. Either way
 * the filter compiles to its country list, since country_iso is the source of truth and
 * institutions.region can be null on rows whose country was resolved later.
 */
export type RegionMatch = { key: string; label: string; countries: string[] };

const REGION_MATCHES: { match: RegionMatch; names: string[] }[] = [
  ...REGIONS.map((r) => ({
    match: { key: r.code, label: r.name, countries: COUNTRIES.filter((c) => c.region === r.code).map((c) => c.iso) },
    names: [r.code, r.name, ...r.aliases],
  })),
  ...SUBREGIONS.map((s) => ({
    match: { key: s.name, label: s.name, countries: s.countries },
    names: [s.name, ...s.aliases],
  })),
];

/** Every region/subregion name + alias, normalized — for the query analyzer's dictionary. */
export function regionNameEntries(): { name: string; match: RegionMatch }[] {
  return REGION_MATCHES.flatMap(({ match, names }) => names.map((name) => ({ name: normalizeText(name), match })));
}

/** Fuzzy-match free text ("Latinoamérica", "latam", "Sudamérica") to a region or subregion. */
export function findRegion(freeText: string | null | undefined, threshold = 0.92): RegionMatch | undefined {
  if (!freeText) return undefined;
  const target = normalizeText(freeText);
  if (!target) return undefined;

  let best: { match: RegionMatch; score: number } | undefined;
  for (const { match, names } of REGION_MATCHES) {
    for (const name of names) {
      const score = jaroWinkler(target, normalizeText(name));
      if (score >= threshold && (!best || score > best.score)) best = { match, score };
    }
  }
  return best?.match;
}

/** Looks a region up by its key (a code like "LATAM" or a subregion name). */
export function regionByKey(key: string): RegionMatch | undefined {
  return REGION_MATCHES.find(({ match }) => match.key === key)?.match;
}

/** Fuzzy-match a free-text country name to an ISO-3166 alpha-2 code. */
export function findCountry(freeText: string | null | undefined, threshold = 0.88): Country | undefined {
  if (!freeText) return undefined;
  const target = normalizeText(freeText);
  if (!target) return undefined;
  if (target.length === 2) {
    const byIso = COUNTRIES.find((c) => c.iso.toLowerCase() === target);
    if (byIso) return byIso;
  }

  let best: { country: Country; score: number } | undefined;
  for (const country of COUNTRIES) {
    for (const name of country.names) {
      const score = jaroWinkler(target, normalizeText(name));
      if (score >= threshold && (!best || score > best.score)) {
        best = { country, score };
      }
    }
  }
  return best?.country;
}

/** Fuzzy-match a free-text city name, optionally constrained to a known country. */
export function findCity(freeText: string | null | undefined, countryIso?: string | null, threshold = 0.85): City | undefined {
  if (!freeText) return undefined;
  const target = normalizeText(freeText);
  if (!target) return undefined;

  let best: { city: City; score: number } | undefined;
  for (const city of CITIES) {
    if (countryIso && city.countryIso !== countryIso) continue;
    const candidates = [city.name, ...city.aliases];
    for (const candidate of candidates) {
      const score = jaroWinkler(target, normalizeText(candidate));
      if (score >= threshold && (!best || score > best.score)) {
        best = { city, score };
      }
    }
  }
  return best?.city;
}

/**
 * Normalize a free-text (city, country) pair against the gazetteer. A recognized
 * city fills in / corrects the country. Falls back to whatever text was given when
 * nothing in the gazetteer matches (the UI still shows it, just unresolved).
 */
export function normalizeGeo(input: { city?: string | null; country?: string | null }): {
  city: string | null;
  countryIso: string | null;
  region: string | null;
} {
  const country = findCountry(input.country);
  const city = findCity(input.city, country?.iso);

  if (city) {
    return { city: city.name, countryIso: city.countryIso, region: regionForCountry(city.countryIso) };
  }
  if (country) {
    return { city: input.city || null, countryIso: country.iso, region: country.region };
  }
  return { city: input.city || null, countryIso: null, region: null };
}

/**
 * Strips a trailing ", <city or country>" segment from an institution name — a small
 * on-device model occasionally bleeds the city/country into the name field instead of
 * keeping them separate ("Kestrel Norte Hospital, Colombia" instead of name="Kestrel
 * Norte Hospital" + country="Colombia"), which then quietly breaks institution matching
 * across visits (the same client, differently contaminated, scores as two different
 * names). This is a defense-in-depth cleanup on top of the extraction prompt telling the
 * model not to do this in the first place.
 */
export function stripTrailingPlaceName(name: string): string {
  const lastComma = name.lastIndexOf(',');
  if (lastComma === -1) return name;

  const head = name.slice(0, lastComma).trim();
  const tail = name.slice(lastComma + 1).trim();
  if (!head || !tail) return name;

  if (findCountry(tail) || findCity(tail)) return head;
  return name;
}
