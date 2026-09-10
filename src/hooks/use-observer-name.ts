import { getObserverName, setObserverName } from '@/db/repos/settings';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Platform } from 'react-native';

const FALLBACK_NAME = 'Colaborador sin nombre';

/**
 * The field observer's own name — asked once (Alert.prompt, iOS-only per the current
 * deploy target) and persisted locally, so every observation/claim records who actually
 * reported it instead of a hardcoded placeholder. Falls back to a generic label until set.
 */
export function useObserverName() {
  const [name, setNameState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const stored = await getObserverName();
      setNameState(stored);
      setLoading(false);
    })();
  }, []);

  const promptForName = useCallback(() => {
    if (Platform.OS !== 'ios') {
      Alert.alert('No disponible', 'Editar el nombre solo está soportado en iOS por ahora.');
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

  return {
    name: name ?? FALLBACK_NAME,
    isSet: name != null,
    loading,
    promptForName,
  };
}
