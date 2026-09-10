import { loadModel, unloadModel, type ModelProgressUpdate } from '@qvac/sdk';

// Enforces the sequential load/unload discipline from the architecture plan: only one
// model is ever resident at a time (the standard-profile phone has enough RAM for one
// LLM/ASR/embedding model at a time, not several concurrently). Every AI capability in
// src/ai goes through withModel() instead of calling loadModel()/unloadModel() directly.
let currentModelId: string | null = null;
let currentModelType: string | null = null;

export type OnProgress = (percentage: number) => void;

/**
 * Loads `modelSrc` (unloading whatever model is currently resident first), runs `fn` with
 * the resulting modelId, then unloads it — even if `fn` throws. Reuses the already-loaded
 * model instead of reloading when the same (modelSrc, modelType) is requested back-to-back.
 */
export async function withModel<T>(
  params: {
    modelSrc: unknown;
    modelType: string;
    modelConfig?: Record<string, unknown>;
    onProgress?: OnProgress;
  },
  fn: (modelId: string) => Promise<T>
): Promise<T> {
  const key = `${params.modelType}:${JSON.stringify(params.modelSrc)}`;

  if (currentModelId && currentModelType !== key) {
    await unloadModel({ modelId: currentModelId, clearStorage: false }).catch(() => {});
    currentModelId = null;
    currentModelType = null;
  }

  if (!currentModelId) {
    currentModelId = await loadModel({
      modelSrc: params.modelSrc as any,
      modelType: params.modelType as any,
      modelConfig: params.modelConfig,
      onProgress: (p: ModelProgressUpdate) => params.onProgress?.(p.percentage),
    });
    currentModelType = key;
  }

  return fn(currentModelId);
}

/** Releases whatever model is currently resident. Call when leaving the capture flow. */
export async function unloadCurrentModel(): Promise<void> {
  if (!currentModelId) return;
  await unloadModel({ modelId: currentModelId, clearStorage: false }).catch(() => {});
  currentModelId = null;
  currentModelType = null;
}
