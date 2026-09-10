import { MODALITIES, type Modality } from '../schema/observation';
import { normalizeText } from './text';

// Synonym dictionary (es/pt/en) so free-text like "resonador" or "ressonância"
// resolves to the closed enum the LLM's JSON-schema grammar already constrains to.
// Kept here (not in the LLM prompt) so it is testable and correctable without
// touching the model or re-running inference.
const MODALITY_SYNONYMS: Record<Modality, string[]> = {
  MR: [
    'mr',
    'rm',
    'rmn',
    'resonador',
    'resonadores',
    'resonancia magnetica',
    'resonancia',
    'ressonancia magnetica',
    'ressonancia',
    'magnetic resonance',
    'mri',
  ],
  CT: [
    'ct',
    'tc',
    'tac',
    'tomografo',
    'tomografos',
    'tomografia',
    'tomografia computadorizada',
    'tomografia computarizada',
    'ct scan',
    'computed tomography',
  ],
  US: [
    'us',
    'ecografo',
    'ecografos',
    'ecografia',
    'ecografias',
    'ultrasonido',
    'ultrasonidos',
    'ultrassom',
    'ecografia',
    'ultrasound',
    'ultrasound machine',
  ],
  XR: [
    'xr',
    'rx',
    'rayos x',
    'radiografo',
    'radiografia',
    'raio x',
    'raio-x',
    'radiografia',
    'x ray',
    'xray',
  ],
  MG: [
    'mg',
    'mamografo',
    'mamografos',
    'mamografia',
    'mamografia',
    'mammography',
    'mammogram',
    'mammograph',
  ],
  PET_CT: ['pet ct', 'pet/ct', 'pet-ct', 'petct', 'tomografia por emissao de positrons'],
  SPECT: ['spect', 'camara gamma spect', 'camara spect'],
  NM: ['nm', 'medicina nuclear', 'gammacamara', 'gama camara', 'camara gama', 'nuclear medicine'],
  ANGIO: ['angio', 'angiografo', 'angiografia', 'sala de hemodinamia', 'hemodinamia', 'angiography'],
  MONITORING: [
    'monitoreo',
    'monitor',
    'monitores',
    'monitor multiparametro',
    'monitores multiparametro',
    'central de monitoreo',
    'monitor de signos vitales',
    'monitor de sinais vitais',
    'patient monitor',
    'patient monitoring',
  ],
  OTHER: [],
};

const lookup = new Map<string, Modality>();
for (const modality of MODALITIES) {
  for (const synonym of MODALITY_SYNONYMS[modality]) {
    lookup.set(normalizeText(synonym), modality);
  }
}

/** Resolve free text (es/pt/en, any casing/accents) to a closed Modality, or null. */
export function normalizeModality(freeText: string | null | undefined): Modality | null {
  if (!freeText) return null;
  const normalized = normalizeText(freeText);
  if (lookup.has(normalized)) return lookup.get(normalized)!;

  // Fall back to substring match for phrases like "tienen dos resonadores magnéticos".
  for (const [synonym, modality] of lookup) {
    if (synonym.length >= 3 && normalized.includes(synonym)) return modality;
  }
  return null;
}
