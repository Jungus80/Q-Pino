import '../global.css';

import {
  IBMPlexMono_400Regular,
  IBMPlexMono_500Medium,
} from '@expo-google-fonts/ibm-plex-mono';
import {
  IBMPlexSans_400Regular,
  IBMPlexSans_500Medium,
  IBMPlexSans_600SemiBold,
  IBMPlexSans_700Bold,
} from '@expo-google-fonts/ibm-plex-sans';
import { Newsreader_600SemiBold, Newsreader_700Bold } from '@expo-google-fonts/newsreader';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';

import { ModelPrefetchBanner } from '@/components/kit/ModelPrefetchBanner';
import { useColor } from '@/hooks/useColor';
import { useColorScheme } from '@/hooks/useColorScheme';
import { ThemeProvider } from '@/providers/theme-provider';

SplashScreen.preventAutoHideAsync();

function NavigationStack() {
  const background = useColor('background');
  const text = useColor('text');
  const scheme = useColorScheme();

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(background).catch(() => {});
    SplashScreen.hideAsync().catch(() => {});
  }, [background]);

  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <ModelPrefetchBanner />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: background },
          headerStyle: { backgroundColor: background },
          headerTintColor: text,
          headerShadowVisible: false,
          headerTitleStyle: { color: text },
          headerBackTitle: 'Atrás',
          headerBackButtonDisplayMode: 'minimal',
        }}
      >
        <Stack.Screen name="(tabs)" options={{ title: 'Atrás' }} />
        <Stack.Screen
          name="clients/[id]"
          options={{
            headerShown: true,
            title: 'Cliente',
            headerBackTitle: 'Atrás',
            headerBackButtonDisplayMode: 'minimal',
            headerStyle: { backgroundColor: background },
            headerTintColor: text,
          }}
        />
        <Stack.Screen
          name="equipment/[id]"
          options={{
            headerShown: true,
            title: 'Equipo',
            headerBackTitle: 'Atrás',
            headerBackButtonDisplayMode: 'minimal',
            headerStyle: { backgroundColor: background },
            headerTintColor: text,
          }}
        />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Newsreader_600SemiBold,
    Newsreader_700Bold,
    IBMPlexSans_400Regular,
    IBMPlexSans_500Medium,
    IBMPlexSans_600SemiBold,
    IBMPlexSans_700Bold,
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
  });

  if (!fontsLoaded) return null;

  return (
    <ThemeProvider defaultMode="light">
      <NavigationStack />
    </ThemeProvider>
  );
}
