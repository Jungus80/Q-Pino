import { z } from 'zod';

export const MODALITIES = [
  'MR',
  'CT',
  'US',
  'XR',
  'MG',
  'PET_CT',
  'SPECT',
  'NM',
  'ANGIO',
  'MONITORING',
  'OTHER',
] as const;
export type Modality = (typeof MODALITIES)[number];

export const FIELD_STATUSES = ['Confirmado', 'Reportado', 'Estimado', 'Desconocido'] as const;
export type FieldStatus = (typeof FIELD_STATUSES)[number];

export const fieldStatusSchema = z.enum(FIELD_STATUSES);
export const modalitySchema = z.enum(MODALITIES);

// Every field the LLM extracts is `required` in the JSON Schema the grammar is compiled
// from (see src/core/schema/jsonSchemas.ts) — a small model under grammar constraint was
// found to skip merely-*optional* keys even when the value was clearly present in the
// text. "Unknown" is instead signaled with a sentinel the model must actively write:
// `""` for strings, `-1` for numbers. These helpers turn the sentinel back into `null`
// once parsed, so nothing downstream (normalization, DB, UI) needs to know it existed.
const sentinelString = () => z.string().transform((v) => (v.trim().length === 0 ? null : v));

const sentinelNumber = (min: number, max: number, integer = false) => {
  const base = integer ? z.number().int() : z.number();
  return base
    .refine((v) => v === -1 || (v >= min && v <= max), { message: `must be -1 (unknown) or between ${min} and ${max}` })
    .transform((v) => (v === -1 ? null : v));
};

/** One piece of equipment as extracted from a single observation, before normalization. */
export const extractedEquipmentSchema = z.object({
  modality: modalitySchema,
  count: sentinelNumber(0, 200, true),
  manufacturer: sentinelString(),
  model: sentinelString(),
  ageYearsMin: sentinelNumber(0, 60),
  ageYearsMax: sentinelNumber(0, 60),
  installYear: sentinelNumber(1970, 2100, true),
  serial: sentinelString(),
  whichUnit: sentinelString(),
  fieldStatus: z.object({
    manufacturer: fieldStatusSchema,
    model: fieldStatusSchema,
    age: fieldStatusSchema,
    count: fieldStatusSchema,
  }),
  evidence: z.array(z.string()),
});
export type ExtractedEquipment = z.infer<typeof extractedEquipmentSchema>;

/** The full structured payload the LLM must produce for one observation. */
export const extractedObservationSchema = z.object({
  institution: z.object({
    name: sentinelString(),
    site: sentinelString(),
    city: sentinelString(),
    country: sentinelString(),
    evidence: z.array(z.string()),
  }),
  equipment: z.array(extractedEquipmentSchema),
  comments: sentinelString(),
  missing: z.array(z.string()),
});
export type ExtractedObservation = z.infer<typeof extractedObservationSchema>;

/** A normalized equipment claim after catalog enrichment and age-interval parsing. */
export const normalizedEquipmentSchema = extractedEquipmentSchema.extend({
  installYearLo: z.number().int().nullable(),
  installYearHi: z.number().int().nullable(),
  catalogModelId: z.string().nullable(),
});
export type NormalizedEquipment = z.infer<typeof normalizedEquipmentSchema>;

/** The institution half of a normalized observation (geo-resolved, evidence-checked). */
export const normalizedInstitutionSchema = z.object({
  name: z.string().nullable(),
  site: z.string().nullable(),
  city: z.string().nullable(),
  countryIso: z.string().nullable(),
  region: z.string().nullable(),
});
export type NormalizedInstitution = z.infer<typeof normalizedInstitutionSchema>;

export const observationSourceSchema = z.enum(['voice', 'text', 'photo']);
export type ObservationSource = z.infer<typeof observationSourceSchema>;

export const observationRecordSchema = z.object({
  id: z.string(),
  observerId: z.string(),
  createdAt: z.string(),
  source: observationSourceSchema,
  rawText: z.string(),
  transcript: z.string().nullable(),
  comments: z.string().nullable(),
  extraction: extractedObservationSchema,
  modelVersions: z.record(z.string(), z.string()),
});
export type ObservationRecord = z.infer<typeof observationRecordSchema>;
