import { DarkTheme, DefaultTheme, ThemeProvider as NavigationThemeProvider } from 'expo-router';
import { useMemo } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { ToastProvider } from '@/components/ui/toast';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Mode, ModeProvider, ModeStorage } from '@/providers/mode-provider';
import { Colors } from '@/theme/colors';

type Props = {
  children: React.ReactNode;
  storage?: ModeStorage;
  storageKey?: string;
  defaultMode?: Mode;
};

export const ThemeProvider = ({
  children,
  storage,
  storageKey,
  defaultMode,
}: Props) => (
  <ModeProvider
    storage={storage}
    storageKey={storageKey}
    defaultMode={defaultMode}
  >
    <NavigationTheme>{children}</NavigationTheme>
  </ModeProvider>
);

const NavigationTheme = ({ children }: { children: React.ReactNode }) => {
  const colorScheme = useColorScheme();

  const theme = useMemo(() => {
    if (colorScheme === 'dark') {
      return {
        ...DarkTheme,
        colors: {
          ...DarkTheme.colors,
          primary: Colors.dark.primary,
          background: Colors.dark.background,
          card: Colors.dark.card,
          text: Colors.dark.text,
          border: Colors.dark.border,
          notification: Colors.dark.red,
        },
      };
    }

    return {
      ...DefaultTheme,
      colors: {
        ...DefaultTheme.colors,
        primary: Colors.light.primary,
        background: Colors.light.background,
        card: Colors.light.card,
        text: Colors.light.text,
        border: Colors.light.border,
        notification: Colors.light.red,
      },
    };
  }, [colorScheme]);

  return (
    <NavigationThemeProvider value={theme}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ToastProvider>{children}</ToastProvider>
      </GestureHandlerRootView>
    </NavigationThemeProvider>
  );
};
