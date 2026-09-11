import {
  loadModel,
  QWEN3_5_0_8B_MULTIMODAL_Q4_K_M,
  QWEN3_5_2B_MULTIMODAL_Q4_K_M,
  unloadModel,
  type ModelProgressUpdate,
} from '@qvac/sdk';
import { Platform } from 'react-native';

// Enforces the sequential load/unload discipline from the architecture plan: only one
// model is ever resident at a time (the standard-profile phone has enough RAM for one
// LLM/ASR/embedding model at a time, not several concurrently). Every AI capability in
// src/ai goes through withModel() instead of calling loadModel()/unloadModel() directly.
let currentModelId: string | null = null;
let currentModelType: string | null = null;
let pendingLoad: { key: string; promise: Promise<string> } | null = null;

export type OnProgress = (percentage: number) => void;

export type LoadParams = {
  modelSrc: unknown;
  modelType: string;
  modelConfig?: Record<string, unknown>;
  onProgress?: OnProgress;
};

// GPU inference on Android goes through OpenCL on this SDK build, and the vendor's
// OpenCL JIT compiler (seen on a Honor/Adreno device: libllvm-qcom.so, clBuildProgram)
// has a null-pointer crash compiling the LLM's kernels — a SIGSEGV that takes down the
// whole app, not something fixable on our side. CPU is the only reliable backend on
// Android until that's fixed upstream. A smaller model offsets CPU's lower throughput
// so extraction still feels responsive; iOS hasn't shown this crash and keeps the
// bigger model on GPU.
const ANDROID_LLM = { modelSrc: QWEN3_5_0_8B_MULTIMODAL_Q4_K_M, device: 'cpu' as const };
const DEFAULT_LLM = { modelSrc: QWEN3_5_2B_MULTIMODAL_Q4_K_M, device: 'gpu' as const };
const { modelSrc: LLM_MODEL_SRC, device: LLM_DEVICE } = Platform.OS === 'android' ? ANDROID_LLM : DEFAULT_LLM;

/** Shared on-device LLM used for extraction and Consultas. */
export const LLM_LOAD_PARAMS: LoadParams = {
  modelSrc: LLM_MODEL_SRC,
  modelType: 'llm',
  modelConfig: { device: LLM_DEVICE, ctx_size: 4096, reasoning_budget: 0 },
};

let llmPreloadPromise: Promise<string> | null = null;

function llmKey(): string {
  return `${LLM_LOAD_PARAMS.modelType}:${JSON.stringify(LLM_LOAD_PARAMS.modelSrc)}`;
}

export function isLlmLoaded(): boolean {
  return currentModelId !== null && currentModelType === llmKey();
}

/**
 * Starts loading the shared LLM in the background. Safe to call on tab focus — dedupes
 * concurrent callers and no-ops when the model is already resident.
 */
export function preloadLlm(onProgress?: OnProgress): Promise<string> {
  if (isLlmLoaded()) return Promise.resolve(currentModelId!);
  if (!llmPreloadPromise) {
    llmPreloadPromise = loadExclusive({ ...LLM_LOAD_PARAMS, onProgress }).finally(() => {
      llmPreloadPromise = null;
    });
  }
  return llmPreloadPromise;
}

/**
 * Loads `modelSrc` (unloading whatever model is currently resident first) and returns its
 * modelId. Reuses the already-loaded model instead of reloading when the same
 * (modelSrc, modelType) is requested back-to-back. The caller owns unloading it (via
 * `unloadCurrentModel()`) — use this instead of `withModel()` for capabilities that need
 * the model to stay resident across more than one call, e.g. a streaming ASR session that
 * spans start()...stop().
 */
export async function loadExclusive(params: LoadParams): Promise<string> {
  const key = `${params.modelType}:${JSON.stringify(params.modelSrc)}`;

  if (currentModelId && currentModelType === key) return currentModelId;

  // Dedupe concurrent callers requesting the same model (e.g. tab-focus preload
  // racing a user-triggered extraction) so they share one loadModel() call instead
  // of each starting their own — loading the same ~GB model twice at once would
  // otherwise double GPU/memory pressure on the device.
  if (pendingLoad && pendingLoad.key === key) return pendingLoad.promise;

  if (currentModelId && currentModelType !== key) {
    await unloadModel({ modelId: currentModelId, clearStorage: false }).catch(() => {});
    currentModelId = null;
    currentModelType = null;
  }

  const promise = loadModel({
    modelSrc: params.modelSrc as any,
    modelType: params.modelType as any,
    modelConfig: params.modelConfig,
    onProgress: (p: ModelProgressUpdate) => params.onProgress?.(p.percentage),
  }).then((modelId) => {
    currentModelId = modelId;
    currentModelType = key;
    return modelId;
  });

  pendingLoad = { key, promise };
  try {
    return await promise;
  } finally {
    if (pendingLoad?.promise === promise) pendingLoad = null;
  }
}

/**
 * Loads `modelSrc`, runs `fn` with the resulting modelId, and leaves it loaded for reuse
 * (see `loadExclusive`) — it is only unloaded when a *different* model is subsequently
 * requested, or `unloadCurrentModel()` is called explicitly.
 */
export async function withModel<T>(params: LoadParams, fn: (modelId: string) => Promise<T>): Promise<T> {
  const modelId = await loadExclusive(params);
  return fn(modelId);
}

/** Releases whatever model is currently resident. Call when leaving the capture flow. */
export async function unloadCurrentModel(): Promise<void> {
  if (!currentModelId) return;
  await unloadModel({ modelId: currentModelId, clearStorage: false }).catch(() => {});
  currentModelId = null;
  currentModelType = null;
}
