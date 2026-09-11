import vocabulary from './whisperVocabulary.json';
import { MANUFACTURERS } from '../normalize/catalog';

/** Whisper initial-prompt budget (~224 tokens). ~4 chars/token is a safe heuristic on-device. */
export const WHISPER_PROMPT_MAX_CHARS = 880;

type Vocabulary = {
  countries: string[];
  panama: { provinces: string[]; cities: string[]; hospitals: string[] };
  colombia: { regions: string[]; cities: string[]; hospitals: string[] };
  equipmentModels: string[];
  clinical: string[];
};

export const WHISPER_VOCABULARY = vocabulary as Vocabulary;

function dedupeKey(term: string): string {
  return term.trim().toLowerCase();
}

/**
 * Joins tiered term lists (highest-priority tiers first) until the character budget is
 * full — lower-priority tiers are dropped rather than truncating mid-word.
 */
export function joinWhisperPromptTiers(tiers: string[][], maxChars = WHISPER_PROMPT_MAX_CHARS): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  let len = 0;

  for (const tier of tiers) {
    for (const raw of tier) {
      const term = raw.trim();
      if (!term) continue;
      const key = dedupeKey(term);
      if (seen.has(key)) continue;

      const separator = parts.length > 0 ? 2 : 0;
      if (len + separator + term.length > maxChars) return parts.join(', ');

      seen.add(key);
      parts.push(term);
      len += separator + term.length;
    }
  }

  return parts.join(', ');
}

export type WhisperInstitutionHint = { name: string; city: string | null };
export type WhisperEquipmentHint = {
  manufacturer: string | null;
  model: string | null;
  modality: string;
};

function institutionTerms(rows: WhisperInstitutionHint[]): string[] {
  const terms: string[] = [];
  for (const row of rows) {
    terms.push(row.name);
    if (row.city) terms.push(row.city);
  }
  return terms;
}

function equipmentTerms(rows: WhisperEquipmentHint[]): string[] {
  const terms: string[] = [];
  for (const row of rows) {
    if (row.manufacturer) terms.push(row.manufacturer);
    if (row.model) terms.push(row.model);
  }
  return terms;
}

function referenceHospitalTerms(): string[] {
  return [...WHISPER_VOCABULARY.panama.hospitals, ...WHISPER_VOCABULARY.colombia.hospitals];
}

/**
 * Builds tiered Whisper prompt terms: live DB clients → reference hospitals → DB/catalog
 * equipment → geo → manufacturers → clinical vocabulary.
 */
export function whisperPromptTiers(
  institutions: WhisperInstitutionHint[] = [],
  equipment: WhisperEquipmentHint[] = []
): string[][] {
  return [
    institutionTerms(institutions),
    [...equipmentTerms(equipment), ...WHISPER_VOCABULARY.equipmentModels],
    referenceHospitalTerms(),
    [
      ...WHISPER_VOCABULARY.panama.cities,
      ...WHISPER_VOCABULARY.colombia.cities,
      ...WHISPER_VOCABULARY.panama.provinces,
      ...WHISPER_VOCABULARY.colombia.regions,
      ...WHISPER_VOCABULARY.countries,
    ],
    MANUFACTURERS.flatMap((m) => [m.name, ...m.aliases.slice(0, 1)]),
    WHISPER_VOCABULARY.clinical,
  ];
}

export function buildWhisperPromptFromInstitutions(
  institutions: WhisperInstitutionHint[] = [],
  equipment: WhisperEquipmentHint[] = []
): string {
  return joinWhisperPromptTiers(whisperPromptTiers(institutions, equipment));
}

/** Flat list of all reference hospitals (for docs/tests). */
export function referenceHospitalNames(): string[] {
  return referenceHospitalTerms();
}
