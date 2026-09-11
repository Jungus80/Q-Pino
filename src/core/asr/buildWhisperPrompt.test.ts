import { describe, expect, it } from 'vitest';
import {
  buildWhisperPromptFromInstitutions,
  joinWhisperPromptTiers,
  referenceHospitalNames,
  WHISPER_PROMPT_MAX_CHARS,
} from './whisperPromptVocabulary';

describe('joinWhisperPromptTiers', () => {
  it('dedupes terms case-insensitively', () => {
    const prompt = joinWhisperPromptTiers([['Bogotá', 'bogotá', 'Medellín']], 200);
    expect(prompt).toBe('Bogotá, Medellín');
  });

  it('keeps high-priority tiers when the budget is tight', () => {
    const prompt = joinWhisperPromptTiers(
      [
        ['Hospital DemoCare Pacific', 'Hospital Santo Tomás'],
        ['resonador', 'tomógrafo', 'ecógrafo', 'mamógrafo', 'rayos X', 'densitometría'],
      ],
      60
    );
    expect(prompt).toContain('Hospital DemoCare Pacific');
    expect(prompt).not.toContain('densitometría');
  });
});

describe('buildWhisperPromptFromInstitutions', () => {
  it('prioritizes live DB clients over reference hospitals', () => {
    const prompt = buildWhisperPromptFromInstitutions([
      { name: 'Hospital DemoCare Pacific', city: 'Ciudad de Panamá' },
    ]);
    expect(prompt.indexOf('Hospital DemoCare Pacific')).toBeLessThan(prompt.indexOf('Hospital Santo Tomás'));
    expect(prompt.length).toBeLessThanOrEqual(WHISPER_PROMPT_MAX_CHARS);
  });

  it('includes catalog equipment models from the vocabulary file', () => {
    const prompt = buildWhisperPromptFromInstitutions([], []);
    expect(prompt).toContain('Meridian Pulse');
    expect(prompt).toContain('Solara Magna 1.5T');
  });
});

describe('referenceHospitalNames', () => {
  it('includes Panamá and Colombia reference hospitals from the vocabulary file', () => {
    const names = referenceHospitalNames();
    expect(names).toContain('Hospital Santo Tomás');
    expect(names).toContain('Fundación Valle del Lili');
    expect(names.length).toBeGreaterThanOrEqual(27);
  });
});
