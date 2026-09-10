import { describe, expect, it } from 'vitest';
import { parsePlateText } from './plate';

describe('parsePlateText', () => {
  it('extracts a labeled serial number', () => {
    const result = parsePlateText(['SOLARA HEALTH', 'MODEL: Solara Magna X', 'S/N: SX4471829', 'FAB: 2021']);
    expect(result.serial).toBe('SX4471829');
  });

  it('recognizes a catalog model from a labeled REF field', () => {
    const result = parsePlateText(['REF: Solara Magna X']);
    expect(result.model).toBe('Solara Magna X');
    expect(result.manufacturer).toBe('Solara Health');
    expect(result.catalogModelId).toBe('solara-magna-x');
  });

  it('recognizes a catalog manufacturer and model printed without labels', () => {
    const result = parsePlateText(['Solara Health', 'Solara Magna X', 'Hecho en Panamá']);
    expect(result.manufacturer).toBe('Solara Health');
    expect(result.model).toBe('Solara Magna X');
  });

  it('extracts a manufacture year only when labeled', () => {
    const result = parsePlateText(['Solara Magna X', 'AÑO: 2019']);
    expect(result.installYear).toBe(2019);
  });

  it('does not treat an unlabeled 4-digit run as a manufacture year', () => {
    const result = parsePlateText(['REF: 2015-XR']);
    expect(result.installYear).toBeNull();
  });

  it('returns nulls for a plate with no recognizable fields', () => {
    const result = parsePlateText(['Hospital equipment room 3']);
    expect(result).toEqual({ serial: null, manufacturer: null, model: null, installYear: null, catalogModelId: null });
  });
});
