import { describe, expect, it } from 'vitest';
import { findCity, findCountry, normalizeGeo } from './geo';

describe('findCountry', () => {
  it('matches accented and unaccented Spanish names', () => {
    expect(findCountry('Panamá')?.iso).toBe('PA');
    expect(findCountry('Panama')?.iso).toBe('PA');
  });

  it('matches an ISO code directly', () => {
    expect(findCountry('BR')?.iso).toBe('BR');
  });
});

describe('findCity', () => {
  it('matches known cities and their aliases', () => {
    expect(findCity('Sao Paulo')?.countryIso).toBe('BR');
    expect(findCity('Ciudad de Panama')?.countryIso).toBe('PA');
  });

  it('can be constrained to a country', () => {
    expect(findCity('San José', 'CR')?.countryIso).toBe('CR');
  });
});

describe('normalizeGeo', () => {
  it('derives country and region from a recognized city', () => {
    const result = normalizeGeo({ city: 'São Paulo', country: null });
    expect(result.countryIso).toBe('BR');
    expect(result.region).toBe('LATAM');
    expect(result.city).toBe('São Paulo');
  });

  it('falls back to the raw city text when nothing matches', () => {
    const result = normalizeGeo({ city: 'Pueblo Desconocido', country: 'Panamá' });
    expect(result.countryIso).toBe('PA');
    expect(result.city).toBe('Pueblo Desconocido');
  });
});
