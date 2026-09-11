import type { NormalizedEquipment } from '../schema/observation';
import { MODALITY_LABEL } from '../labels';

// Value weights from the architecture plan: which missing field is worth asking about
// first. Manufacturer narrows renewal/support decisions the most; serial is the least
// urgent (nice for exact identification, but rarely blocks any downstream decision).
const FIELD_WEIGHT = {
  manufacturer: 1.0,
  age: 0.9,
  model: 0.7,
  count: 0.6,
} as const;

type FollowUpField = keyof typeof FIELD_WEIGHT;

export type FollowUpQuestion = {
  equipmentIndex: number;
  field: FollowUpField;
  question: string;
};


const QUESTION_TEMPLATE: Record<FollowUpField, (label: string) => string> = {
  manufacturer: (label) => `¿Sabes el fabricante del ${label}?`,
  age: (label) => `¿Qué tan antiguo es el ${label} (años o año de instalación)?`,
  model: (label) => `¿Sabes el modelo del ${label}?`,
  count: (label) => `¿Cuántos ${label}(s) hay en total?`,
};

/**
 * Picks the single highest-value missing field across every equipment item in the
 * observation, and returns a ready-to-show question for it — or null if nothing is
 * missing. Deterministic (no LLM call): asking is cheap and instant, so there's no
 * reason to spend inference on choosing which question to ask.
 */
export function computeNextQuestion(equipment: NormalizedEquipment[]): FollowUpQuestion | null {
  let best: { equipmentIndex: number; field: FollowUpField; weight: number } | null = null;

  equipment.forEach((item, equipmentIndex) => {
    (Object.keys(FIELD_WEIGHT) as FollowUpField[]).forEach((field) => {
      if (item.fieldStatus[field] !== 'Desconocido') return;
      const weight = FIELD_WEIGHT[field];
      if (!best || weight > best.weight) {
        best = { equipmentIndex, field, weight };
      }
    });
  });

  if (!best) return null;
  const { equipmentIndex, field } = best as { equipmentIndex: number; field: FollowUpField; weight: number };
  const label = MODALITY_LABEL[equipment[equipmentIndex].modality] ?? 'equipo';
  return { equipmentIndex, field, question: QUESTION_TEMPLATE[field](label) };
}
