import { describe, expect, it } from 'vitest';
import { reconcileQueryDsl } from './reconcile';
import { analyzeQuestion } from './hints';
import { EMPTY_QUERY_DSL, type QueryDsl } from './dsl';
import { MODALITIES } from '../schema/observation';

const NOW = new Date('2026-09-10T00:00:00Z');
const reconcile = (question: string, llm: Partial<QueryDsl> = {}) =>
  reconcileQueryDsl({ ...EMPTY_QUERY_DSL, ...llm }, analyzeQuestion(question, { now: NOW, institutions: ['Hospital Andino Sur'] }));

// Every case below is a real (or directly analogous) bad LLM output: the model proposes,
// the reconciliation must return the query the question actually asked for.
describe('reconcileQueryDsl — observed LLM failures', () => {
  it('"Equipos por modalidad": every modality listed, ages 0/0, groupBy dropped', () => {
    const { dsl } = reconcile('Equipos por modalidad', { modality: [...MODALITIES], minAge: 0, maxAge: 0 });
    expect(dsl).toEqual({ ...EMPTY_QUERY_DSL, groupBy: 'modality' });
  });

  it('"De qué países tenemos clientes": invented country BR', () => {
    const { dsl } = reconcile('De qué países tenemos clientes', { country: ['BR'], groupBy: 'country' });
    expect(dsl).toEqual({ ...EMPTY_QUERY_DSL, groupBy: 'country', metric: 'clients' });
  });

  it('"Cuáles son los fabricantes más comunes": placeholder "All manufacturers", no groupBy', () => {
    const { dsl } = reconcile('Cuáles son los fabricantes más comunes', { manufacturer: ['All manufacturers'] });
    expect(dsl).toEqual({ ...EMPTY_QUERY_DSL, groupBy: 'manufacturer' });
  });

  it('drops flags the question never mentions', () => {
    const { dsl } = reconcile('Equipos en Brasil', { country: ['Brasil'], stale: true, incomplete: true, renewalDue: true });
    expect(dsl).toEqual({ ...EMPTY_QUERY_DSL, country: ['BR'] });
  });

  it('drops an age whose number is not in the question', () => {
    expect(reconcile('Resonadores en Colombia', { modality: ['MR'], country: ['Colombia'], minAge: 10 }).dsl.minAge).toBeUndefined();
    expect(reconcile('Resonadores de más de 10 años', { modality: ['MR'], minAge: 10 }).dsl.minAge).toBe(10);
  });

  it('drops a metric the question never asks for', () => {
    expect(reconcile('Equipos por modalidad', { groupBy: 'modality', metric: 'avgAge' }).dsl.metric).toBe('count');
  });

  it('drops a generic word copied into a filter slot', () => {
    const { dsl } = reconcile('Top 3 clientes con más equipos', { groupBy: 'institution', limit: 3, institution: ['clientes'], manufacturer: ['equipos'] });
    expect(dsl).toEqual({ ...EMPTY_QUERY_DSL, groupBy: 'institution', limit: 3, order: 'desc' });
  });
});

describe('reconcileQueryDsl — resolution and re-homing', () => {
  it('moves a city the model put in the country slot', () => {
    expect(reconcile('Clientes en Lima', { country: ['Lima'] }).dsl).toMatchObject({ country: [], city: ['Lima'] });
  });

  it('resolves free-text regions and manufacturers to canonical values', () => {
    expect(reconcile('Equipos Solara en Latinoamérica', { region: ['Latinoamérica'], manufacturer: ['Solara'] }).dsl).toMatchObject({
      region: ['LATAM'],
      manufacturer: ['Solara Health'],
    });
  });

  it('strips generic words before resolving ("equipos Solara")', () => {
    const { dsl, notes } = reconcile('Clientes con equipos Solara', { manufacturer: ['equipos Solara'] });
    expect(dsl.manufacturer).toEqual(['Solara Health']);
    expect(notes).toEqual([]);
  });

  it('keeps an anchored but unknown country as an honest zero-match filter, with a note', () => {
    const { dsl, notes } = reconcile('Clientes en Venezuela', { country: ['Venezuela'] });
    expect(dsl.country).toEqual(['Venezuela']);
    expect(notes).toHaveLength(1);
  });

  it('keeps an anchored manufacturer outside the catalog, with a note', () => {
    const { dsl, notes } = reconcile('Equipos Siemens', { manufacturer: ['Siemens'] });
    expect(dsl.manufacturer).toEqual(['Siemens']);
    expect(notes).toHaveLength(1);
  });

  it('keeps a legitimate filter on the same field as the breakdown', () => {
    const { dsl } = reconcile('Resonadores por país en Brasil y México', { country: ['Brasil', 'México'], modality: ['MR'], groupBy: 'country' });
    expect(dsl).toMatchObject({ country: ['BR', 'MX'], modality: ['MR'], groupBy: 'country' });
  });

  it('drops a trivial LLM-only breakdown ("Tomógrafos en México" by country)', () => {
    const { dsl } = reconcile('Tomógrafos en México', { country: ['México'], modality: ['CT'], groupBy: 'country' });
    expect(dsl).toEqual({ ...EMPTY_QUERY_DSL, country: ['MX'], modality: ['CT'] });
  });

  it('drops top-N without a breakdown', () => {
    expect(reconcile('Equipos en Brasil', { country: ['Brasil'], limit: 5 }).dsl.limit).toBeUndefined();
  });

  it('never applies an excluded value, even if the model does', () => {
    const { dsl, notes } = reconcile('Equipos excepto resonadores', { modality: ['MR'] });
    expect(dsl.modality).toEqual([]);
    expect(notes).toHaveLength(1);
  });

  it('adds what the model missed (rules-only recall)', () => {
    expect(reconcile('Clientes en Brasil con resonadores de más de 7 años').dsl).toEqual({
      ...EMPTY_QUERY_DSL,
      country: ['BR'],
      modality: ['MR'],
      minAge: 7,
    });
  });
});

describe('reconcileQueryDsl — scope', () => {
  it('asks to rephrase off-topic questions, even if the model filled something', () => {
    expect(reconcile('hola').understood).toBe(false);
    expect(reconcile('hola', { country: ['Hola'] }).understood).toBe(false);
    expect(reconcile('qué hora es').understood).toBe(false);
  });

  it('asks to rephrase a judgement question it cannot answer with data', () => {
    expect(reconcile('¿Cuál es el mejor fabricante?').understood).toBe(false);
  });

  it('answers a plain total question', () => {
    const r = reconcile('Cuántos equipos hay?');
    expect(r.understood).toBe(true);
    expect(r.dsl).toEqual(EMPTY_QUERY_DSL);
  });
});
