import { findManufacturer, findModel, getManufacturer } from './catalog';
import type { Modality } from '../schema/observation';

export type PlateExtraction = {
  serial: string | null;
  manufacturer: string | null;
  model: string | null;
  installYear: number | null;
  catalogModelId: string | null;
};

// SIN is a common OCR misread of S/N (slash read as I).
const SERIAL_LABEL_RE = /^(?:S\s*\/?\s*N|SIN|SN|SER(?:IAL)?|SERIE)\b/i;
const SERIAL_INLINE_RE = /(?:S\s*\/?\s*N|SIN|SN|SER(?:IAL)?|SERIE)[:\s#-]+([A-Z0-9][A-Z0-9-]{3,24})\b/i;
const SERIAL_VALUE_RE = /^[A-Z0-9][A-Z0-9-]{3,24}$/i;
// Standalone nameplate serial like MD2012-00487 — not a REF/MOD catalog code.
const SERIAL_STANDALONE_RE = /^[A-Z]{2,5}\d{4}-\d{3,8}$/i;

function extractSerial(lines: string[]): string | null {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!SERIAL_LABEL_RE.test(line)) continue;

    const sameLine = line.match(SERIAL_INLINE_RE);
    if (sameLine) return joinSerialContinuation(sameLine[1], lines, i + 1);

    // Label and value often land in separate OCR blocks ("S/N:" then "MD2012-00487").
    let value = lines[i + 1]?.trim() ?? '';
    if (SERIAL_VALUE_RE.test(value)) {
      if (value.endsWith('-') && lines[i + 2]?.trim()) {
        value = value + lines[i + 2].trim();
      }
      return normalizeSerial(value);
    }
  }

  const joined = lines.join('\n');
  const inline = joined.match(SERIAL_INLINE_RE);
  if (inline) {
    const labelIndex = lines.findIndex((l) => SERIAL_LABEL_RE.test(l.trim()));
    return joinSerialContinuation(inline[1], lines, labelIndex >= 0 ? labelIndex + 1 : 0);
  }

  for (const line of lines) {
    const t = line.trim();
    if (/^(?:REF|MOD|MFG|FAB|A[ÑN]O|YEAR|FECHA|220V|MADE)/i.test(t)) continue;
    if (SERIAL_STANDALONE_RE.test(t)) return normalizeSerial(t);
  }

  return null;
}

/** OCR often splits "MD2012-00487" into "MD2012-" + "00487" across blocks. */
function joinSerialContinuation(partial: string, lines: string[], fromIndex: number): string {
  let serial = normalizeSerial(partial);
  if (!serial.endsWith('-')) return serial;
  for (let i = fromIndex; i < lines.length; i++) {
    const next = lines[i].trim().replace(/\s/g, '');
    if (/^\d{3,8}$/.test(next)) return serial + next;
    if (SERIAL_VALUE_RE.test(next) && !next.endsWith('-')) return normalizeSerial(next);
  }
  return serial.replace(/-+$/, '');
}

function normalizeSerial(raw: string): string {
  return raw.replace(/\s/g, '').toUpperCase();
}
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

  const serial = extractSerial(lines);

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
