import { describe, expect, it } from 'vitest';
import { sanitizeQueryDsl, EMPTY_QUERY_DSL, type QueryDsl } from './dsl';
import { MODALITIES } from '../schema/observation';

describe('sanitizeQueryDsl', () => {
  it('collapses a modality array listing every enum value to empty (no filter)', () => {
    const dsl: QueryDsl = { ...EMPTY_QUERY_DSL, modality: [...MODALITIES], groupBy: 'modality' };
    expect(sanitizeQueryDsl(dsl).modality).toEqual([]);
  });

  it('leaves a genuine partial modality filter untouched', () => {
    const dsl: QueryDsl = { ...EMPTY_QUERY_DSL, modality: ['MR', 'CT'] };
    expect(sanitizeQueryDsl(dsl).modality).toEqual(['MR', 'CT']);
  });

  it('drops minAge: 0 as a mathematical no-op', () => {
    const dsl: QueryDsl = { ...EMPTY_QUERY_DSL, minAge: 0 };
    expect(sanitizeQueryDsl(dsl).minAge).toBeUndefined();
  });

  it('drops maxAge: 0 as a near-certain hallucination', () => {
    const dsl: QueryDsl = { ...EMPTY_QUERY_DSL, maxAge: 0 };
    expect(sanitizeQueryDsl(dsl).maxAge).toBeUndefined();
  });

  it('drops an inverted age range (minAge > maxAge)', () => {
    const dsl: QueryDsl = { ...EMPTY_QUERY_DSL, minAge: 10, maxAge: 5 };
    const result = sanitizeQueryDsl(dsl);
    expect(result.minAge).toBeUndefined();
    expect(result.maxAge).toBeUndefined();
  });

  it('leaves a genuine age filter untouched', () => {
    const dsl: QueryDsl = { ...EMPTY_QUERY_DSL, minAge: 7 };
    expect(sanitizeQueryDsl(dsl).minAge).toBe(7);
  });

  it('is a no-op on an already-clean DSL', () => {
    const dsl: QueryDsl = { ...EMPTY_QUERY_DSL, country: ['BR'], metric: 'count' };
    expect(sanitizeQueryDsl(dsl)).toEqual(dsl);
  });

  it('drops a country filter that matches its own groupBy — regression for "de qué países tenemos clientes"', () => {
    const dsl: QueryDsl = { ...EMPTY_QUERY_DSL, country: ['BR'], groupBy: 'country' };
    expect(sanitizeQueryDsl(dsl).country).toEqual([]);
  });

  it('drops a city filter that matches its own groupBy', () => {
    const dsl: QueryDsl = { ...EMPTY_QUERY_DSL, city: ['São Paulo'], groupBy: 'city' };
    expect(sanitizeQueryDsl(dsl).city).toEqual([]);
  });

  it('drops a manufacturer filter that matches its own groupBy', () => {
    const dsl: QueryDsl = { ...EMPTY_QUERY_DSL, manufacturer: ['Solara Health'], groupBy: 'manufacturer' };
    expect(sanitizeQueryDsl(dsl).manufacturer).toEqual([]);
  });

  it('leaves a country filter untouched when groupBy targets a different field', () => {
    const dsl: QueryDsl = { ...EMPTY_QUERY_DSL, country: ['BR'], groupBy: 'modality' };
    expect(sanitizeQueryDsl(dsl).country).toEqual(['BR']);
  });
});
