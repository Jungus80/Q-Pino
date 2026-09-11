import { isLlmLoaded, preloadLlm } from '@/ai/modelManager';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

/**
 * Warms the shared on-device LLM when a tab that needs it gains focus (Capturar,
 * Consultas). Mirrors the Whisper preload pattern in asr.ts — load in the background
 * while the user reads the screen, so the first action feels instant.
 *
 * Exposes load percentage — on a memory-constrained device this can take a minute or
 * more (the model competes with backgrounded apps for RAM), and a bare spinner with no
 * feedback for that long reads as frozen.
 */
export function useLlmPreload() {
  const [preloading, setPreloading] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (isLlmLoaded()) return;

      let cancelled = false;
      setPreloading(true);
      setProgress(null);
      preloadLlm((percentage) => {
        if (!cancelled) setProgress(percentage);
      })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) {
            setPreloading(false);
            setProgress(null);
          }
        });

      return () => {
        cancelled = true;
      };
    }, [])
  );

  return { llmPreloading: preloading, llmPreloadProgress: progress };
}
