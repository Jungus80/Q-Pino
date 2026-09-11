import { listInstitutions } from '../../db/repos/institutions';
import { listAllEquipment } from '../../db/repos/equipment';
import { buildWhisperPromptFromInstitutions } from './whisperPromptVocabulary';

export {
  WHISPER_PROMPT_MAX_CHARS,
  joinWhisperPromptTiers,
  buildWhisperPromptFromInstitutions,
  referenceHospitalNames,
  whisperPromptTiers,
} from './whisperPromptVocabulary';

/** Loads live DB data and builds the Whisper initial prompt. */
export async function buildWhisperPrompt(): Promise<string> {
  try {
    const [institutions, equipment] = await Promise.all([listInstitutions(), listAllEquipment()]);
    return buildWhisperPromptFromInstitutions(
      institutions.map((i) => ({ name: i.name, city: i.city })),
      equipment.map((e) => ({ manufacturer: e.manufacturer, model: e.model, modality: e.modality }))
    );
  } catch {
    return buildWhisperPromptFromInstitutions([]);
  }
}
