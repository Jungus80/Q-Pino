import { describe, expect, it } from 'vitest';
import { findCity, findCountry, normalizeGeo, stripTrailingPlaceName } from './geo';

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

describe('stripTrailingPlaceName', () => {
  it('strips a trailing country name', () => {
    expect(stripTrailingPlaceName('Kestrel Norte Hospital, Colombia')).toBe('Kestrel Norte Hospital');
  });

  it('strips a trailing city name', () => {
    expect(stripTrailingPlaceName('Hospital Andino Sur, Bogotá')).toBe('Hospital Andino Sur');
  });

  it('leaves a name with no comma untouched', () => {
    expect(stripTrailingPlaceName('Hospital Kestrel Norte')).toBe('Hospital Kestrel Norte');
  });

  it('leaves a comma-containing name untouched when the tail is not a recognized place', () => {
    expect(stripTrailingPlaceName('Hospital, S.A.')).toBe('Hospital, S.A.');
  });
});
