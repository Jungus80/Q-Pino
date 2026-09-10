import { findManufacturer, findModel, getManufacturer } from './catalog';
import type { Modality } from '../schema/observation';

export type PlateExtraction = {
  serial: string | null;
  manufacturer: string | null;
  model: string | null;
  installYear: number | null;
  catalogModelId: string | null;
};

const SERIAL_RE = /\b(?:S\s*\/?\s*N|SER(?:IAL)?|SERIE)[:\s#-]*([A-Z0-9][A-Z0-9-]{3,19})\b/i;
const MODEL_RE = /\b(?:REF|MOD(?:EL[O]?)?)[:\s#-]*([A-Z0-9][A-Za-z0-9 .-]{1,29}?)\s*$/im;
// A manufacture/install date on a nameplate is usually printed near a label like
// "FAB", "MFG", "AÑO", "YEAR", or "FECHA" — a bare 19xx/20xx elsewhere on the plate is
// too easy to confuse with a model number or serial fragment, so the year regex requires
// one of those labels nearby rather than matching any 4-digit run on the plate.
const YEAR_RE = /\b(?:FAB(?:RICA(?:CI[OÓ]N)?)?|MFG|MANUFACTURED?|A[ÑN]O|YEAR|FECHA)[:\s]*.{0,10}?\b(19[7-9]\d|20[0-4]\d)\b/i;

/**
 * Parses OCR text blocks from a photographed equipment nameplate into structured fields.
 * Regex handles the plate's own labeled fields (S/N, REF, manufacture year); the catalog
 * (src/core/normalize/catalog.ts) is used to recognize a manufacturer or model name
 * printed on the plate without a label, the same fuzzy match extraction uses for dictated
 * text. Everything this returns is treated as 'Confirmado' by the caller — a nameplate
 * reading is the strongest evidence tier there is.
 */
export function parsePlateText(lines: string[], modality?: Modality | null): PlateExtraction {
  const joined = lines.join('\n');

  const serialMatch = joined.match(SERIAL_RE);
  const serial = serialMatch ? serialMatch[1] : null;

  const modelLabelMatch = joined.match(MODEL_RE);
  let model: string | null = null;
  let manufacturer: string | null = null;
  let catalogModelId: string | null = null;

  const catalogModel = findModel(modelLabelMatch?.[1], modality);
  if (catalogModel) {
    model = catalogModel.name;
    manufacturer = getManufacturer(catalogModel.manufacturerId)?.name ?? null;
    catalogModelId = catalogModel.id;
  } else {
    // No labeled REF/MOD field recognized — scan each line for a catalog manufacturer or
    // model name printed as its own text block (common on real nameplates).
    for (const line of lines) {
      if (!manufacturer) manufacturer = findManufacturer(line)?.name ?? null;
      if (!model) {
        const m = findModel(line, modality);
        if (m) {
          model = m.name;
          catalogModelId = m.id;
          manufacturer = manufacturer ?? getManufacturer(m.manufacturerId)?.name ?? null;
        }
      }
    }
    if (!model && modelLabelMatch) model = modelLabelMatch[1];
  }

  const yearMatch = joined.match(YEAR_RE);
  const installYear = yearMatch ? parseInt(yearMatch[1], 10) : null;

  return { serial, manufacturer, model, installYear, catalogModelId };
}
