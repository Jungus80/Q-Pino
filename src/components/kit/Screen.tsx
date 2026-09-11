import { useColor } from '@/hooks/useColor';
import { TabScreenSafeAreaEdges } from '@/constants/theme';
import type { ReactNode } from 'react';
import { ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export function Screen({ children, style, centered }: { children: ReactNode; style?: ViewStyle; centered?: boolean }) {
  const background = useColor('background');
  return (
    <SafeAreaView
      edges={TabScreenSafeAreaEdges}
      style={[{ flex: 1, backgroundColor: background }, centered && { alignItems: 'center', justifyContent: 'center' }, style]}
    >
      {children}
    </SafeAreaView>
  );
}
