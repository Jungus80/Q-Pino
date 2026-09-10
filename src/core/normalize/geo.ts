import gazetteerData from './gazetteer.json';
import { jaroWinkler, normalizeText } from './text';

export type Country = { iso: string; region: string; names: string[] };
export type City = { name: string; countryIso: string; lat: number; lon: number; aliases: string[] };
export type Region = { code: string; name: string };

const gazetteer = gazetteerData as { regions: Region[]; countries: Country[]; cities: City[] };

export const REGIONS = gazetteer.regions;
export const COUNTRIES = gazetteer.countries;
export const CITIES = gazetteer.cities;

export function regionForCountry(iso: string): string | null {
  return COUNTRIES.find((c) => c.iso === iso)?.region ?? null;
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
