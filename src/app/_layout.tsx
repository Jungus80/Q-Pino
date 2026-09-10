import '../global.css';

import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { LockScreen } from '@/components/LockScreen';
import { useAppLock } from '@/hooks/use-app-lock';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const lock = useAppLock();

  const showLock = lock.ready && lock.available && lock.locked;

  return (
    <ThemeProvider value={DefaultTheme}>
      <AnimatedSplashOverlay />
      {showLock ? (
        <LockScreen lock={lock} />
      ) : (
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="clients/[id]" options={{ headerShown: true, title: 'Cliente' }} />
          <Stack.Screen name="equipment/[id]" options={{ headerShown: true, title: 'Equipo' }} />
        </Stack>
      )}
    </ThemeProvider>
  );
}
