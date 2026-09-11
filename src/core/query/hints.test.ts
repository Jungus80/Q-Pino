import { describe, expect, it } from 'vitest';
import { analyzeQuestion, isAnchoredInQuestion } from './hints';
import { normalizeText } from '../normalize/text';

const NOW = new Date('2026-09-10T00:00:00Z');
const INSTITUTIONS = ['Hospital Andino Sur', 'Clínica Litoral Norte', 'Centro Médico del Valle', 'Hospital Universitario'];
const analyze = (q: string) => analyzeQuestion(q, { now: NOW, institutions: INSTITUTIONS });

describe('analyzeQuestion — entities', () => {
  it('resolves countries, cities, modalities and manufacturers to canonical values', () => {
    const h = analyze('Mamógrafos Verdant en São Paulo y tomógrafos en México');
    expect(h.modality).toEqual(['MG', 'CT']);
    expect(h.manufacturer).toEqual(['Verdant Imaging']);
    expect(h.city).toEqual(['São Paulo']);
    expect(h.country).toEqual(['MX']);
  });

  it('prefers the longest match ("Ciudad de México" is a city, not the country)', () => {
    const h = analyze('Monitores en Ciudad de México');
    expect(h.city).toEqual(['Ciudad de México']);
    expect(h.country).toEqual([]);
    expect(h.modality).toEqual(['MONITORING']);
  });

  it('tolerates typos and missing accents', () => {
    const h = analyze('resonadors en Colmbia y bogota');
    expect(h.modality).toEqual(['MR']);
    expect(h.country).toEqual(['CO']);
    expect(h.city).toEqual(['Bogotá']);
  });

  it('resolves regions and subregions', () => {
    expect(analyze('Clientes en Latinoamérica').region).toEqual(['LATAM']);
    expect(analyze('equipos en sudamerica').region).toEqual(['Sudamérica']);
  });

  it('does not read Portuguese "na"/"eu" as region codes', () => {
    expect(analyze('Eu quero equipamentos na cidade de Lima').region).toEqual([]);
  });

  it('treats a bare "us" as weak evidence only', () => {
    const h = analyze('show us the equipment');
    expect(h.modality).toEqual([]);
    expect(h.modalityCodes).toEqual(['US']);
  });

  it('matches stored client names, but single-token names only exactly', () => {
    expect(analyze('Qué equipos tiene el Hospital Andino Sur').institution).toEqual(['Hospital Andino Sur']);
    expect(analyze('Equipos del Centro Médico del Valle').institution).toEqual(['Centro Médico del Valle']);
    expect(analyze('hospitales universitarios de Brasil').institution).toEqual([]);
  });
});

describe('analyzeQuestion — exclusions', () => {
  it('never turns an excluded value into a filter, and says so', () => {
    const h = analyze('Equipos excepto resonadores y tomógrafos');
    expect(h.modality).toEqual([]);
    expect(h.excluded).toEqual(['MR', 'CT']);
    expect(h.notes).toHaveLength(1);
  });

  it('reads "clientes sin X" as an exclusion', () => {
    expect(analyze('clientes sin tomógrafos').excluded).toEqual(['CT']);
  });

  it('does not confuse "menos de N años" with an exclusion', () => {
    const h = analyze('Equipos con menos de 5 años en Brasil');
    expect(h.country).toEqual(['BR']);
    expect(h.excluded).toEqual([]);
    expect(h.maxAge).toBe(5);
  });
});

describe('analyzeQuestion — ages and confidence', () => {
  it.each([
    ['equipos con más de 7 años', 7, undefined],
    ['equipos con más de diez años', 10, undefined],
    ['equipos de 8 años o más', 8, undefined],
    ['equipos de menos de 3 años', undefined, 3],
    ['resonadores entre 5 y 10 años', 5, 10],
    ['equipamentos com mais de 6 anos', 6, undefined],
    ['equipment older than 12 years', 12, undefined],
    ['equipos instalados antes de 2015', 11, undefined],
    ['angiógrafos instalados después de 2020', undefined, 6],
  ])('%s', (q, minAge, maxAge) => {
    const h = analyze(q);
    expect(h.minAge).toBe(minAge);
    expect(h.maxAge).toBe(maxAge);
  });

  it('never reads a count of equipment as an age', () => {
    const h = analyze('clientes con más de 5 equipos');
    expect(h.minAge).toBeUndefined();
  });

  it('never reads "verificados hace más de un año" as an equipment age', () => {
    const h = analyze('equipos verificados hace más de un año');
    expect(h.minAge).toBeUndefined();
    expect(h.stale).toBe(true);
  });

  it.each([
    ['equipos con confianza mayor a 80%', 80, undefined],
    ['equipos con confianza mayor a 0.8', 80, undefined],
    ['al menos 60% de confianza', 60, undefined],
    ['equipos con alta confianza', 70, undefined],
    ['equipos con menos de 60% de confianza', undefined, 60],
    ['clientes con confianza baja', undefined, 39],
    ['equipos con confianza moderada', 40, 69],
  ])('%s → confidence [%s, %s]', (q, min, max) => {
    const h = analyze(q);
    expect(h.minConfidence).toBe(min);
    expect(h.maxConfidence).toBe(max);
  });

  it('reads "confianza media" as the average-confidence metric, not a band', () => {
    const h = analyze('confianza media por país');
    expect(h.metric).toBe('confidence');
    expect(h.minConfidence).toBeUndefined();
    expect(h.maxConfidence).toBeUndefined();
  });
});

describe('analyzeQuestion — breakdown, metric, ranking', () => {
  it.each([
    ['Equipos por modalidad', 'modality'],
    ['De qué países tenemos clientes', 'country'],
    ['Cuáles son los fabricantes más comunes', 'manufacturer'],
    ['En qué ciudades hay resonadores', 'city'],
    ['Distribución de equipos por fabricante', 'manufacturer'],
    ['Equipos por antigüedad', 'ageBucket'],
    ['Equipamentos por modalidade', 'modality'],
    ['Equipment by manufacturer', 'manufacturer'],
    ['Cuántos equipos tiene cada cliente', 'institution'],
    ['Qué país tiene más equipos', 'country'],
    ['ranking de países por cantidad de equipos', 'country'],
  ])('%s → groupBy %s', (q, groupBy) => {
    expect(analyze(q).groupBy).toBe(groupBy);
  });

  it('does not turn "qué clientes tienen X" into a per-client breakdown — it is a list', () => {
    expect(analyze('Qué clientes tienen resonadores').groupBy).toBeUndefined();
  });

  it('reads top-N with direction', () => {
    expect(analyze('Top 3 clientes con más equipos')).toMatchObject({ groupBy: 'institution', limit: 3, order: 'desc' });
    expect(analyze('Los dos países con menos equipos')).toMatchObject({ groupBy: 'country', limit: 2, order: 'asc' });
  });

  it('reads "los N equipos más antiguos" as clients ranked by average age', () => {
    expect(analyze('los 5 equipos más antiguos')).toMatchObject({ groupBy: 'institution', metric: 'avgAge', limit: 5, order: 'desc' });
  });

  it.each([
    ['Antigüedad promedio de los resonadores', 'avgAge'],
    ['Qué antigüedad tienen los tomógrafos', 'avgAge'],
    ['Antigüedad de los tomógrafos por país', 'avgAge'],
    ['Confianza promedio por país', 'confidence'],
    ['Qué tan confiables son los datos de Perú', 'confidence'],
    ['Cuántos clientes tienen ecógrafos', 'clients'],
    ['How many clients have MRI scanners?', 'clients'],
  ])('%s → metric %s', (q, metric) => {
    expect(analyze(q).metric).toBe(metric);
  });

  it('flags an unsupported second breakdown', () => {
    const h = analyze('equipos por pais y modalidad');
    expect(h.groupBy).toBe('country');
    expect(h.notes).toHaveLength(1);
  });
});

describe('analyzeQuestion — flags and scope', () => {
  it.each([
    ['Clientes desactualizados', 'stale'],
    ['clientes sin verificar hace más de un año', 'stale'],
    ['Clientes con información incompleta', 'incomplete'],
    ['Clientes con equipos sin fabricante', 'incomplete'],
    ['Equipos para renovar', 'renewalDue'],
    ['Tomógrafos obsoletos en Brasil', 'renewalDue'],
    ['Renewal opportunities for CT scanners', 'renewalDue'],
  ] as const)('%s → %s', (q, flag) => {
    expect(analyze(q)[flag]).toBe(true);
  });

  it('detects off-topic and judgement questions', () => {
    expect(analyze('hola').hasDomainSignal).toBe(false);
    expect(analyze('qué hora es').hasDomainSignal).toBe(false);
    expect(analyze('¿Cuál es el mejor fabricante?').subjective).toBe(true);
    expect(analyze('Cuántos equipos hay?').hasDomainSignal).toBe(true);
  });
});

describe('isAnchoredInQuestion', () => {
  const words = (q: string) => normalizeText(q).split(' ');

  it('anchors whole words, not substrings ("BR" is not in "hombres")', () => {
    expect(isAnchoredInQuestion('BR', words('equipos de hombres'))).toBe(false);
    expect(isAnchoredInQuestion('Lima', words('clientes en Lima'))).toBe(true);
  });

  it('tolerates inflection and typos on longer values', () => {
    expect(isAnchoredInQuestion('Brasil', words('hospitales brasileños'))).toBe(true);
    expect(isAnchoredInQuestion('Hospital Andino Sur', words('equipos del hospital andino sur'))).toBe(true);
  });

  it('rejects values the question never mentions', () => {
    expect(isAnchoredInQuestion('Brasil', words('De qué países tenemos clientes'))).toBe(false);
  });
});
