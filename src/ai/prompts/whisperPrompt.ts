import { MANUFACTURERS } from '@/core/normalize/catalog';

// Whisper's `prompt` biases recognition toward vocabulary it's given — useful here
// because the fictional catalog's brand names (per the data-guardrail requirement) are
// exactly the kind of unusual proper nouns a general-purpose ASR model has never heard
// and otherwise mishears phonetically (e.g. "Kestrel Health Systems" -> "que extrae el
// norte", "Solara Health" -> "solar a Held" — both observed on-device). A short list of
// the brand names plus common modality terms is enough to nudge recognition without
// derailing transcription of everything else in the clip.
export const WHISPER_VOCABULARY_PROMPT = [
  ...MANUFACTURERS.map((m) => m.name),
  'resonador',
  'tomógrafo',
  'ecógrafo',
  'mamógrafo',
  'hospital',
  'clínica',
].join(', ');
