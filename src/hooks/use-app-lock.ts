import * as LocalAuthentication from 'expo-local-authentication';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

export type AppLockState = {
  ready: boolean; // hardware/enrollment check finished
  available: boolean; // device has biometrics enrolled — lock is enforced only when true
  locked: boolean;
  unlocking: boolean;
  error: string | null;
  unlock: () => Promise<void>;
};

/**
 * Gates the app behind Face ID / Touch ID (expo-local-authentication is already a
 * dependency; this is the first thing that actually uses it). Re-locks whenever the app
 * leaves the foreground — a phone with cached hospital equipment data left unlocked on a
 * desk is exactly the kind of exposure the PDF brief's "seguridad/privacidad" requirement
 * calls out. On a device with no biometrics enrolled (e.g. the simulator, or a phone with
 * no Face ID set up) the lock is skipped entirely rather than trapping the user behind an
 * auth method they have no way to satisfy.
 */
export function useAppLock(): AppLockState {
  const [ready, setReady] = useState(false);
  const [available, setAvailable] = useState(false);
  const [locked, setLocked] = useState(true);
  const [unlocking, setUnlocking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wasBackgrounded = useRef(false);

  const checkAvailability = useCallback(async () => {
    const [hasHardware, isEnrolled] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
    ]);
    const canLock = hasHardware && isEnrolled;
    setAvailable(canLock);
    setLocked(canLock);
    setReady(true);
    return canLock;
  }, []);

  const unlock = useCallback(async () => {
    setUnlocking(true);
    setError(null);
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Desbloquear Installed Base Intelligence',
        cancelLabel: 'Cancelar',
        disableDeviceFallback: false,
      });
      if (result.success) {
        setLocked(false);
      } else if (result.error !== 'user_cancel' && result.error !== 'app_cancel') {
        setError('No se pudo verificar tu identidad. Intenta de nuevo.');
      }
    } catch {
      setError('No se pudo verificar tu identidad. Intenta de nuevo.');
    } finally {
      setUnlocking(false);
    }
  }, []);

  useEffect(() => {
    checkAvailability();
  }, [checkAvailability]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'background' || state === 'inactive') {
        wasBackgrounded.current = true;
      } else if (state === 'active' && wasBackgrounded.current) {
        wasBackgrounded.current = false;
        if (available) setLocked(true);
      }
    });
    return () => sub.remove();
  }, [available]);

  return { ready, available, locked, unlocking, error, unlock };
}
