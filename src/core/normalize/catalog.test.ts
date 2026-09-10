import { describe, expect, it } from 'vitest';
import { enrichFromCatalog, findManufacturer, findModel } from './catalog';

describe('findManufacturer', () => {
  it('matches by exact and aliased name', () => {
    expect(findManufacturer('Solara Health')?.id).toBe('solara');
    expect(findManufacturer('solara')?.id).toBe('solara');
  });

  it('is tolerant to minor typos', () => {
    expect(findManufacturer('Solara Helth')?.id).toBe('solara');
  });

  it('returns undefined for unrelated text', () => {
    expect(findManufacturer('Acme Corp')).toBeUndefined();
  });
});

describe('findModel', () => {
  it('matches a known model and can be constrained by modality', () => {
    expect(findModel('Solara Magna X')?.id).toBe('solara-magna-x');
    expect(findModel('Solara Magna X', 'MR')?.id).toBe('solara-magna-x');
    expect(findModel('Solara Magna X', 'CT')).toBeUndefined();
  });
});

describe('enrichFromCatalog', () => {
  it('fills in manufacturer and modality from a recognized model, and caps install year', () => {
    const result = enrichFromCatalog({ model: 'Meridian Pulse II', manufacturer: null, modality: null });
    expect(result.manufacturer).toBe('Meridian Diagnostics');
    expect(result.modality).toBe('MR');
    expect(result.minInstallYear).toBe(2018);
    expect(result.catalogModelId).toBe('meridian-pulse-ii');
  });

  it('falls back to fuzzy manufacturer matching when the model is unrecognized', () => {
    const result = enrichFromCatalog({ model: 'Some Unknown Scanner 9000', manufacturer: 'Kestrel', modality: 'MONITORING' });
    expect(result.manufacturer).toBe('Kestrel Health Systems');
    expect(result.catalogModelId).toBeNull();
    expect(result.modality).toBe('MONITORING');
  });
});
