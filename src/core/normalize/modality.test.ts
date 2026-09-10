import { describe, expect, it } from 'vitest';
import { normalizeModality } from './modality';

describe('normalizeModality', () => {
  it('resolves Spanish synonyms', () => {
    expect(normalizeModality('resonador')).toBe('MR');
    expect(normalizeModality('tomógrafo')).toBe('CT');
    expect(normalizeModality('ecógrafo')).toBe('US');
  });

  it('resolves Portuguese synonyms', () => {
    expect(normalizeModality('ressonância')).toBe('MR');
    expect(normalizeModality('tomografia computadorizada')).toBe('CT');
  });

  it('resolves English synonyms', () => {
    expect(normalizeModality('MRI')).toBe('MR');
    expect(normalizeModality('ultrasound')).toBe('US');
  });

  it('matches within a longer phrase', () => {
    expect(normalizeModality('tienen dos resonadores magnéticos')).toBe('MR');
  });

  it('returns null for unknown text', () => {
    expect(normalizeModality('bomba de infusión')).toBeNull();
    expect(normalizeModality(null)).toBeNull();
  });
});
