import catalogData from './catalog.json';
import { jaroWinkler, normalizeText } from './text';
import type { Modality } from '../schema/observation';

export type Manufacturer = { id: string; name: string; aliases: string[] };
export type EquipmentModel = {
  id: string;
  manufacturerId: string;
  name: string;
  modality: Modality;
  launchYear: number;
  endOfSupportYear: number;
};

const catalog = catalogData as {
  manufacturers: Manufacturer[];
  models: EquipmentModel[];
  renewalThresholdYears: Record<Modality, number>;
};

export const MANUFACTURERS = catalog.manufacturers;
export const MODELS = catalog.models;
export const RENEWAL_THRESHOLD_YEARS = catalog.renewalThresholdYears;

const manufacturerById = new Map(MANUFACTURERS.map((m) => [m.id, m]));
const modelById = new Map(MODELS.map((m) => [m.id, m]));

export function getManufacturer(id: string): Manufacturer | undefined {
  return manufacturerById.get(id);
}

export function getModel(id: string): EquipmentModel | undefined {
  return modelById.get(id);
}

/**
 * Fuzzy-match free text against the manufacturer catalog (name + aliases).
 * Returns the best match at or above `threshold`, or undefined.
 */
export function findManufacturer(freeText: string | null | undefined, threshold = 0.92): Manufacturer | undefined {
  if (!freeText) return undefined;
  const target = normalizeText(freeText);
  if (!target) return undefined;

  let best: { manufacturer: Manufacturer; score: number } | undefined;
  for (const manufacturer of MANUFACTURERS) {
    const candidates = [manufacturer.name, ...manufacturer.aliases];
    for (const candidate of candidates) {
      const score = jaroWinkler(target, normalizeText(candidate));
      if (score >= threshold && (!best || score > best.score)) {
        best = { manufacturer, score };
      }
    }
  }
  return best?.manufacturer;
}

/**
 * Fuzzy-match free text against the model catalog. Optionally constrained to a
 * known modality (narrows false positives when the modality was already extracted).
 */
export function findModel(
  freeText: string | null | undefined,
  modality?: Modality | null,
  threshold = 0.92
): EquipmentModel | undefined {
  if (!freeText) return undefined;
  const target = normalizeText(freeText);
  if (!target) return undefined;

  let best: { model: EquipmentModel; score: number } | undefined;
  for (const model of MODELS) {
    if (modality && model.modality !== modality) continue;
    const score = jaroWinkler(target, normalizeText(model.name));
    if (score >= threshold && (!best || score > best.score)) {
      best = { model, score };
    }
  }
  return best?.model;
}

/**
 * Cross-checks and completes a (manufacturer, model, modality) triple against the
 * catalog: a recognized model fills in/corrects manufacturer and modality, and caps
 * how old the unit can be (it cannot predate the model's launch year).
 */
export function enrichFromCatalog(input: {
  manufacturer?: string | null;
  model?: string | null;
  modality?: Modality | null;
}): {
  manufacturer: string | null;
  model: string | null;
  modality: Modality | null;
  minInstallYear: number | null;
  endOfSupportYear: number | null;
  catalogModelId: string | null;
} {
  const catalogModel = findModel(input.model, input.modality ?? undefined);
  if (catalogModel) {
    const manufacturer = getManufacturer(catalogModel.manufacturerId);
    return {
      manufacturer: manufacturer?.name ?? input.manufacturer ?? null,
      model: catalogModel.name,
      modality: catalogModel.modality,
      minInstallYear: catalogModel.launchYear,
      endOfSupportYear: catalogModel.endOfSupportYear,
      catalogModelId: catalogModel.id,
    };
  }

  const catalogManufacturer = findManufacturer(input.manufacturer);
  return {
    manufacturer: catalogManufacturer?.name ?? (input.manufacturer || null),
    model: input.model || null,
    modality: input.modality ?? null,
    minInstallYear: null,
    endOfSupportYear: null,
    catalogModelId: null,
  };
}

export function renewalThresholdYears(modality: Modality): number {
  return RENEWAL_THRESHOLD_YEARS[modality] ?? RENEWAL_THRESHOLD_YEARS.OTHER;
}
