// JSON Schema objects passed verbatim to QVAC's `completion({ responseFormat: { type:
// 'json_schema', json_schema: { name, schema } } })`. llama.cpp compiles this into a GBNF
// grammar, so the model's output is guaranteed to validate against it — this is the
// mirror of src/core/schema/observation.ts but in raw JSON Schema form (not zod), since
// that's what the QVAC completion API expects on the wire.
//
// Kept `additionalProperties: false` and every field `required` explicitly: QVAC's
// `strict` flag does NOT auto-tighten the schema the way OpenAI's does.

import { MODALITIES } from './observation';

const FIELD_STATUS_ENUM = ['Confirmado', 'Reportado', 'Estimado', 'Desconocido'] as const;

const equipmentItemSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'modality',
    'count',
    'manufacturer',
    'model',
    'ageYearsMin',
    'ageYearsMax',
    'installYear',
    'serial',
    'whichUnit',
    'fieldStatus',
    'evidence',
  ],
  properties: {
    modality: { type: 'string', enum: [...MODALITIES] },
    count: { type: ['integer', 'null'] },
    manufacturer: { type: ['string', 'null'] },
    model: { type: ['string', 'null'] },
    ageYearsMin: { type: ['number', 'null'] },
    ageYearsMax: { type: ['number', 'null'] },
    installYear: { type: ['integer', 'null'] },
    serial: { type: ['string', 'null'] },
    whichUnit: {
      type: ['string', 'null'],
      description: 'Which unit(s) this claim refers to, e.g. "one of the MR systems".',
    },
    fieldStatus: {
      type: 'object',
      additionalProperties: false,
      required: ['manufacturer', 'model', 'age', 'count'],
      properties: {
        manufacturer: { type: 'string', enum: [...FIELD_STATUS_ENUM] },
        model: { type: 'string', enum: [...FIELD_STATUS_ENUM] },
        age: { type: 'string', enum: [...FIELD_STATUS_ENUM] },
        count: { type: 'string', enum: [...FIELD_STATUS_ENUM] },
      },
    },
    evidence: {
      type: 'array',
      items: { type: 'string' },
      description: 'Literal spans copied from the input text that support this equipment entry.',
    },
  },
} as const;

export const OBSERVATION_EXTRACTION_SCHEMA = {
  name: 'observation_extraction',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['institution', 'equipment', 'comments', 'missing'],
    properties: {
      institution: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'site', 'city', 'country', 'evidence'],
        properties: {
          name: { type: ['string', 'null'] },
          site: { type: ['string', 'null'], description: 'Building, floor, or department, if mentioned.' },
          city: { type: ['string', 'null'] },
          country: { type: ['string', 'null'] },
          evidence: { type: 'array', items: { type: 'string' } },
        },
      },
      equipment: { type: 'array', items: equipmentItemSchema },
      comments: { type: ['string', 'null'] },
      missing: {
        type: 'array',
        items: { type: 'string' },
        description: 'Field names the model could not find in the text (e.g. "manufacturer", "age").',
      },
    },
  },
} as const;

// The DSL the LLM translates natural-language analytics questions into — never raw SQL.
// See src/core/query/dsl.ts and compile.ts for the compiler that turns this into
// parameterized SQL.
export const QUERY_DSL_SCHEMA = {
  name: 'installed_base_query',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: [
      'region',
      'country',
      'city',
      'modality',
      'manufacturer',
      'minAge',
      'maxAge',
      'minConfidence',
      'incomplete',
      'stale',
      'groupBy',
      'metric',
    ],
    properties: {
      region: { type: 'array', items: { type: 'string' } },
      country: { type: 'array', items: { type: 'string' }, description: 'ISO-3166 alpha-2 codes.' },
      city: { type: 'array', items: { type: 'string' } },
      modality: { type: 'array', items: { type: 'string', enum: [...MODALITIES] } },
      manufacturer: { type: 'array', items: { type: 'string' } },
      minAge: { type: ['number', 'null'] },
      maxAge: { type: ['number', 'null'] },
      minConfidence: { type: ['number', 'null'] },
      incomplete: { type: ['boolean', 'null'] },
      stale: { type: ['boolean', 'null'] },
      groupBy: { type: ['string', 'null'], enum: ['country', 'city', 'modality', 'manufacturer', null] },
      metric: { type: ['string', 'null'], enum: ['count', 'avgAge', 'confidence', null] },
    },
  },
} as const;

// Used by the entity-resolution "gray zone" adjudicator (see src/core/resolve) — the LLM
// never merges records on its own; its vote only ever feeds into the resolver's score or
// escalates to a human question.
export const ENTITY_ADJUDICATION_SCHEMA = {
  name: 'entity_adjudication',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['same', 'reason'],
    properties: {
      same: { type: 'string', enum: ['yes', 'no', 'unsure'] },
      reason: { type: 'string' },
    },
  },
} as const;
