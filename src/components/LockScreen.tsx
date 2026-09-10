import { useEffect } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { AppLockState } from '@/hooks/use-app-lock';

export function LockScreen({ lock }: { lock: AppLockState }) {
  useEffect(() => {
    if (lock.ready && lock.available && !lock.unlocking) {
      lock.unlock();
    }
    // Trigger the system prompt automatically on first mount / re-lock, so the user
    // doesn't have to tap a button just to see the Face ID sheet — the button below is
    // only needed if they dismissed it or it failed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lock.ready]);

  return (
    <SafeAreaView className="flex-1 bg-neutral-950 items-center justify-center px-8">
      <Text className="text-5xl mb-4">🔒</Text>
      <Text className="text-white text-xl font-bold mb-2 text-center">Datos protegidos</Text>
      <Text className="text-neutral-400 text-sm text-center mb-8">
        Verifica tu identidad para ver el parque de equipos instalados.
      </Text>
      {lock.unlocking ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <Pressable onPress={lock.unlock} className="bg-blue-600 rounded-xl px-6 py-3">
          <Text className="text-white font-semibold">Desbloquear</Text>
        </Pressable>
      )}
      {lock.error && <Text className="text-red-400 text-sm mt-4 text-center">{lock.error}</Text>}
    </SafeAreaView>
  );
}
