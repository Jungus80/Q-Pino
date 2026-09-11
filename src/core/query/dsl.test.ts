import { describe, expect, it } from 'vitest';
import { sanitizeQueryDsl, isEmptyQueryDsl, EMPTY_QUERY_DSL, type QueryDsl } from './dsl';
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
    expect(sanitizeQueryDsl({ ...EMPTY_QUERY_DSL, minAge: 0 }).minAge).toBeUndefined();
  });

  it('drops maxAge: 0 as a near-certain hallucination', () => {
    expect(sanitizeQueryDsl({ ...EMPTY_QUERY_DSL, maxAge: 0 }).maxAge).toBeUndefined();
  });

  it('drops negative ages', () => {
    const result = sanitizeQueryDsl({ ...EMPTY_QUERY_DSL, minAge: -3, maxAge: -1 });
    expect(result.minAge).toBeUndefined();
    expect(result.maxAge).toBeUndefined();
  });

  it('drops an inverted age range (minAge > maxAge)', () => {
    const result = sanitizeQueryDsl({ ...EMPTY_QUERY_DSL, minAge: 10, maxAge: 5 });
    expect(result.minAge).toBeUndefined();
    expect(result.maxAge).toBeUndefined();
  });

  it('leaves a genuine age filter untouched', () => {
    expect(sanitizeQueryDsl({ ...EMPTY_QUERY_DSL, minAge: 7 }).minAge).toBe(7);
  });

  it('is a no-op on an already-clean DSL', () => {
    const dsl: QueryDsl = { ...EMPTY_QUERY_DSL, country: ['BR'], metric: 'count' };
    expect(sanitizeQueryDsl(dsl)).toEqual(dsl);
  });

  it('strips a placeholder manufacturer value — regression for "fabricantes más comunes"', () => {
    const dsl: QueryDsl = { ...EMPTY_QUERY_DSL, manufacturer: ['All manufacturers'], groupBy: 'manufacturer' };
    expect(sanitizeQueryDsl(dsl).manufacturer).toEqual([]);
  });

  it('strips placeholder values case-insensitively from every free-text field', () => {
    const dsl: QueryDsl = { ...EMPTY_QUERY_DSL, country: ['Todos'], city: ['N/A'], region: ['ninguno'], institution: ['cualquiera'] };
    const result = sanitizeQueryDsl(dsl);
    expect(result.country).toEqual([]);
    expect(result.city).toEqual([]);
    expect(result.region).toEqual([]);
    expect(result.institution).toEqual([]);
  });

  it('leaves a real manufacturer name untouched even if it shares words with a placeholder', () => {
    expect(sanitizeQueryDsl({ ...EMPTY_QUERY_DSL, manufacturer: ['Solara Health'] }).manufacturer).toEqual(['Solara Health']);
  });

  it('trims and de-duplicates free-text values', () => {
    expect(sanitizeQueryDsl({ ...EMPTY_QUERY_DSL, city: [' Lima ', 'Lima', ''] }).city).toEqual(['Lima']);
  });

  it('scales a fractional minConfidence (0.8) to the 0-100 scale', () => {
    expect(sanitizeQueryDsl({ ...EMPTY_QUERY_DSL, minConfidence: 0.8 }).minConfidence).toBe(80);
  });

  it('clamps minConfidence above 100 and drops a no-op 0', () => {
    expect(sanitizeQueryDsl({ ...EMPTY_QUERY_DSL, minConfidence: 250 }).minConfidence).toBe(100);
    expect(sanitizeQueryDsl({ ...EMPTY_QUERY_DSL, minConfidence: 0 }).minConfidence).toBeUndefined();
  });

  it('scales maxConfidence, drops a no-op bound and an inverted confidence range', () => {
    expect(sanitizeQueryDsl({ ...EMPTY_QUERY_DSL, maxConfidence: 0.6 }).maxConfidence).toBe(60);
    expect(sanitizeQueryDsl({ ...EMPTY_QUERY_DSL, maxConfidence: 100 }).maxConfidence).toBeUndefined();
    const inverted = sanitizeQueryDsl({ ...EMPTY_QUERY_DSL, minConfidence: 80, maxConfidence: 40 });
    expect(inverted.minConfidence).toBeUndefined();
    expect(inverted.maxConfidence).toBeUndefined();
  });

  it('rounds and bounds limit', () => {
    expect(sanitizeQueryDsl({ ...EMPTY_QUERY_DSL, limit: 2.6 }).limit).toBe(3);
    expect(sanitizeQueryDsl({ ...EMPTY_QUERY_DSL, limit: 0 }).limit).toBeUndefined();
    expect(sanitizeQueryDsl({ ...EMPTY_QUERY_DSL, limit: 500 }).limit).toBe(50);
  });
});

describe('isEmptyQueryDsl', () => {
  it('is true only for "everything, counted, ungrouped"', () => {
    expect(isEmptyQueryDsl(EMPTY_QUERY_DSL)).toBe(true);
    expect(isEmptyQueryDsl({ ...EMPTY_QUERY_DSL, metric: 'avgAge' })).toBe(false);
    expect(isEmptyQueryDsl({ ...EMPTY_QUERY_DSL, renewalDue: true })).toBe(false);
    expect(isEmptyQueryDsl({ ...EMPTY_QUERY_DSL, institution: ['Hospital Andino Sur'] })).toBe(false);
  });
});
