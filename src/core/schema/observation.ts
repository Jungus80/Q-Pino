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

/** One piece of equipment as extracted from a single observation, before normalization. */
export const extractedEquipmentSchema = z.object({
  modality: modalitySchema,
  count: z.number().int().min(0).max(200).nullable(),
  manufacturer: z.string().nullable(),
  model: z.string().nullable(),
  ageYearsMin: z.number().min(0).max(60).nullable(),
  ageYearsMax: z.number().min(0).max(60).nullable(),
  installYear: z.number().int().min(1970).max(2100).nullable(),
  serial: z.string().nullable(),
  whichUnit: z.string().nullable(),
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
    name: z.string().nullable(),
    site: z.string().nullable(),
    city: z.string().nullable(),
    country: z.string().nullable(),
    evidence: z.array(z.string()),
  }),
  equipment: z.array(extractedEquipmentSchema),
  comments: z.string().nullable(),
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
