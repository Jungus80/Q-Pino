import { describe, expect, it } from 'vitest';
import {
  isEvidenceAnchored,
  jaroWinkler,
  nameSimilarity,
  normalizeInstitutionName,
  normalizeText,
} from './text';

describe('normalizeText', () => {
  it('strips accents, lowercases, and collapses whitespace', () => {
    expect(normalizeText('Panamá  City!')).toBe('panama city');
    expect(normalizeText('São Paulo')).toBe('sao paulo');
    expect(normalizeText('  múltiples   espacios  ')).toBe('multiples espacios');
  });
});

describe('normalizeInstitutionName', () => {
  it('drops generic hospital/clinic stopwords', () => {
    expect(normalizeInstitutionName('Hospital DemoCare Pacific')).toBe('democare pacific');
    expect(normalizeInstitutionName('Clínica del Centro Médico Norte')).toBe('norte');
  });
});

describe('nameSimilarity', () => {
  it('scores near-identical institution names highly', () => {
    expect(nameSimilarity('Hospital DemoCare Pacific', 'DemoCare Pacific Hospital')).toBeGreaterThan(0.9);
  });

  it('scores unrelated names low', () => {
    expect(nameSimilarity('Hospital DemoCare Pacific', 'Clínica Andina Sur')).toBeLessThan(0.5);
  });

  it('handles reordered tokens via token-set similarity', () => {
    expect(nameSimilarity('Norte Clínica San José', 'San José Clínica Norte')).toBeGreaterThan(0.9);
  });
});

describe('jaroWinkler', () => {
  it('returns 1 for identical strings and 0 for empty vs non-empty', () => {
    expect(jaroWinkler('abc', 'abc')).toBe(1);
    expect(jaroWinkler('', 'abc')).toBe(0);
  });
});

describe('isEvidenceAnchored', () => {
  const transcript = 'Estoy en Hospital DemoCare Pacific, en Panamá. Tienen dos resonadores.';

  it('anchors exact substrings', () => {
    expect(isEvidenceAnchored('dos resonadores', transcript)).toBe(true);
  });

  it('anchors fuzzy matches within an ASR-noise tolerance', () => {
    expect(isEvidenceAnchored('DemoCare Pacifc', transcript)).toBe(true);
  });

  it('rejects unrelated evidence (hallucination guard)', () => {
    expect(isEvidenceAnchored('tres tomógrafos Siemens', transcript)).toBe(false);
  });
});
