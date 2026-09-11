import {
  prefetchOnDeviceModels,
  subscribeModelPrefetch,
  type ModelPrefetchState,
} from '@/ai/modelManager';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

const BANNER_DELAY_MS = 400;

/**
 * Starts the on-disk model download on native boot and exposes progress for a banner.
 * Cached launches usually finish before the delay, so the banner does not flash.
 */
export function useModelPrefetch() {
  const [state, setState] = useState<ModelPrefetchState>(() => ({
    status: 'idle',
    label: '',
    index: 0,
    total: 0,
    percentage: null,
  }));
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const unsubscribe = subscribeModelPrefetch(setState);
    prefetchOnDeviceModels();
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (state.status === 'error') {
      setShowBanner(true);
      return;
    }
    if (state.status !== 'running') {
      setShowBanner(false);
      return;
    }
    const timer = setTimeout(() => setShowBanner(true), BANNER_DELAY_MS);
    return () => clearTimeout(timer);
  }, [state.status]);

  return { ...state, showBanner };
}
