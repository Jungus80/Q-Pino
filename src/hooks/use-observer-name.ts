import { getObserverName, setObserverName } from '@/db/repos/settings';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Platform } from 'react-native';

const FALLBACK_NAME = 'Colaborador sin nombre';

/**
 * The field observer's own name — asked once and persisted locally, so every
 * observation/claim records who actually reported it instead of a hardcoded
 * placeholder. Falls back to a generic label until set.
 *
 * iOS uses the native Alert.prompt; Android has no such API, so callers render
 * a custom modal driven by `androidPrompt` (visible/draft/confirm/cancel).
 */
export function useObserverName() {
  const [name, setNameState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [androidPromptVisible, setAndroidPromptVisible] = useState(false);
  const [androidDraft, setAndroidDraft] = useState('');

  useEffect(() => {
    (async () => {
      const stored = await getObserverName();
      setNameState(stored);
      setLoading(false);
    })();
  }, []);

  const promptForName = useCallback(() => {
    if (Platform.OS !== 'ios') {
      setAndroidDraft(name ?? '');
      setAndroidPromptVisible(true);
      return;
    }
    Alert.prompt(
      'Tu nombre',
      'Aparecerá como el autor de tus observaciones.',
      async (value) => {
        const trimmed = (value ?? '').trim();
        if (!trimmed) return;
        await setObserverName(trimmed);
        setNameState(trimmed);
      },
      'plain-text',
      name ?? ''
    );
  }, [name]);

  const confirmAndroidName = useCallback(async () => {
    const trimmed = androidDraft.trim();
    setAndroidPromptVisible(false);
    if (!trimmed) return;
    await setObserverName(trimmed);
    setNameState(trimmed);
  }, [androidDraft]);

  const cancelAndroidPrompt = useCallback(() => {
    setAndroidPromptVisible(false);
  }, []);

  return {
    name: name ?? FALLBACK_NAME,
    isSet: name != null,
    loading,
    promptForName,
    androidPrompt: {
      visible: androidPromptVisible,
      draft: androidDraft,
      setDraft: setAndroidDraft,
      confirm: confirmAndroidName,
      cancel: cancelAndroidPrompt,
    },
  };
}
