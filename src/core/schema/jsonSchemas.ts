// JSON Schema objects passed verbatim to QVAC's `completion({ responseFormat: { type:
// 'json_schema', json_schema: { name, schema } } })`. llama.cpp compiles this into a GBNF
// grammar, so the model's output is guaranteed to validate against it — this is the
// mirror of src/core/schema/observation.ts but in raw JSON Schema form (not zod), since
// that's what the QVAC completion API expects on the wire.
//
// Three llama.cpp/small-model quirks shaped this file (found via the phase-0 device spike
// and on-device extraction testing, see git history):
//  1. `type: [X, 'null']` (nullable unions) hits known bugs in json-schema-to-grammar.cpp
//     (empty required+optional short-circuit, minLength/maxLength clamping). Never used
//     here — every field is a plain single type.
//  2. Making fields merely *optional* (out of `required`) let QWEN3_5_2B skip filling in
//     values that were clearly present in the input text — a 2B model under grammar
//     constraint takes the path of least resistance, and omitting an optional key is
//     cheaper than extracting it. So every field is `required`, but uses a sentinel value
//     instead of an omitted key or `null` when unknown: `""` for strings, `-1` for
//     numbers. This forces the model to actively decide something for each field rather
//     than skip it — src/core/schema/observation.ts's zod schema converts the sentinels
//     back to `null` on the way out, so nothing downstream needs to know about them.
//  3. Load the model with `modelConfig: { reasoning_budget: 0 }` — Qwen3.5 thinks by
//     default, and its reasoning-channel tokens aren't part of this grammar's root, which
//     crashes the grammar sampler ("Unexpected empty grammar stack") the moment it tries
//     to emit one.

import { MODALITIES } from './observation';
import { QUERY_GROUP_BYS, QUERY_METRICS, QUERY_ORDERS } from '../query/dsl';

const FIELD_STATUS_ENUM = ['Confirmado', 'Reportado', 'Estimado', 'Desconocido'] as const;
const UNKNOWN_STRING_NOTE = 'Use "" (empty string) if not mentioned in the text — never omit this key.';
const UNKNOWN_NUMBER_NOTE = 'Use -1 if not mentioned in the text — never omit this key.';

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
    count: { type: 'integer', description: UNKNOWN_NUMBER_NOTE },
    manufacturer: { type: 'string', description: UNKNOWN_STRING_NOTE },
    model: { type: 'string', description: UNKNOWN_STRING_NOTE },
    ageYearsMin: { type: 'number', description: UNKNOWN_NUMBER_NOTE },
    ageYearsMax: { type: 'number', description: UNKNOWN_NUMBER_NOTE },
    installYear: { type: 'integer', description: UNKNOWN_NUMBER_NOTE },
    serial: { type: 'string', description: UNKNOWN_STRING_NOTE },
    whichUnit: {
      type: 'string',
      description: `Which unit(s) this claim refers to, e.g. "one of the MR systems". ${UNKNOWN_STRING_NOTE}`,
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
          name: { type: 'string', description: UNKNOWN_STRING_NOTE },
          site: { type: 'string', description: `Building, floor, or department, if mentioned. ${UNKNOWN_STRING_NOTE}` },
          city: { type: 'string', description: UNKNOWN_STRING_NOTE },
          country: { type: 'string', description: UNKNOWN_STRING_NOTE },
          evidence: { type: 'array', items: { type: 'string' } },
        },
      },
      equipment: { type: 'array', items: equipmentItemSchema },
      comments: { type: 'string', description: UNKNOWN_STRING_NOTE },
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
    required: ['region', 'country', 'city', 'modality', 'manufacturer', 'institution'],
    properties: {
      region: { type: 'array', items: { type: 'string' } },
      country: {
        type: 'array',
        items: { type: 'string' },
        description: 'Country names exactly as written in the question (free text, normalized later).',
      },
      city: { type: 'array', items: { type: 'string' } },
      modality: { type: 'array', items: { type: 'string', enum: [...MODALITIES] } },
      manufacturer: { type: 'array', items: { type: 'string' } },
      institution: { type: 'array', items: { type: 'string' } },
      minAge: { type: 'number' },
      maxAge: { type: 'number' },
      minConfidence: { type: 'number' },
      maxConfidence: { type: 'number' },
      incomplete: { type: 'boolean' },
      stale: { type: 'boolean' },
      renewalDue: { type: 'boolean' },
      groupBy: { type: 'string', enum: [...QUERY_GROUP_BYS] },
      metric: { type: 'string', enum: [...QUERY_METRICS] },
      limit: { type: 'integer' },
      order: { type: 'string', enum: [...QUERY_ORDERS] },
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
