// JSON Schema objects passed verbatim to QVAC's `completion({ responseFormat: { type:
// 'json_schema', json_schema: { name, schema } } })`. llama.cpp compiles this into a GBNF
// grammar, so the model's output is guaranteed to validate against it — this is the
// mirror of src/core/schema/observation.ts but in raw JSON Schema form (not zod), since
// that's what the QVAC completion API expects on the wire.
//
// Two llama.cpp grammar-engine quirks shaped this file (found via the phase-0 device
// spike, see git history):
//  1. `type: [X, 'null']` (nullable unions) hits known bugs in json-schema-to-grammar.cpp
//     (empty required+optional short-circuit, minLength/maxLength clamping). We never use
//     that pattern here — a field that may be unknown is simply omitted from `required`
//     instead of made nullable. src/core/schema/observation.ts fills in `null` for any
//     field the model leaves out.
//  2. Structural fields (the ones that give the payload its shape: `modality`,
//     `fieldStatus`, `evidence`, ...) stay in `required` so the model can't omit the
//     skeleton — only genuinely-optional *values* are left out of `required`.
//
// Also load the model with `modelConfig: { reasoning_budget: 0 }` — Qwen3.5 thinks by
// default, and its reasoning-channel tokens aren't part of this grammar's root, which
// crashes the grammar sampler ("Unexpected empty grammar stack") the moment it tries to
// emit one.

import { MODALITIES } from './observation';

const FIELD_STATUS_ENUM = ['Confirmado', 'Reportado', 'Estimado', 'Desconocido'] as const;

const equipmentItemSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['modality', 'fieldStatus', 'evidence'],
  properties: {
    modality: { type: 'string', enum: [...MODALITIES] },
    count: { type: 'integer' },
    manufacturer: { type: 'string' },
    model: { type: 'string' },
    ageYearsMin: { type: 'number' },
    ageYearsMax: { type: 'number' },
    installYear: { type: 'integer' },
    serial: { type: 'string' },
    whichUnit: {
      type: 'string',
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
    required: ['institution', 'equipment', 'missing'],
    properties: {
      institution: {
        type: 'object',
        additionalProperties: false,
        required: ['evidence'],
        properties: {
          name: { type: 'string' },
          site: { type: 'string', description: 'Building, floor, or department, if mentioned.' },
          city: { type: 'string' },
          country: { type: 'string' },
          evidence: { type: 'array', items: { type: 'string' } },
        },
      },
      equipment: { type: 'array', items: equipmentItemSchema },
      comments: { type: 'string' },
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
    required: ['region', 'country', 'city', 'modality', 'manufacturer'],
    properties: {
      region: { type: 'array', items: { type: 'string' } },
      country: { type: 'array', items: { type: 'string' }, description: 'ISO-3166 alpha-2 codes.' },
      city: { type: 'array', items: { type: 'string' } },
      modality: { type: 'array', items: { type: 'string', enum: [...MODALITIES] } },
      manufacturer: { type: 'array', items: { type: 'string' } },
      minAge: { type: 'number' },
      maxAge: { type: 'number' },
      minConfidence: { type: 'number' },
      incomplete: { type: 'boolean' },
      stale: { type: 'boolean' },
      groupBy: { type: 'string', enum: ['country', 'city', 'modality', 'manufacturer'] },
      metric: { type: 'string', enum: ['count', 'avgAge', 'confidence'] },
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
