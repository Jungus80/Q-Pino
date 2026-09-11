import { useColor } from '@/hooks/useColor';
import { BORDER_RADIUS } from '@/theme/globals';
import type { ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

export function StickyActionBar({ children }: { children: ReactNode }) {
  const card = useColor('card');
  return <View style={[styles.bar, { backgroundColor: card }]}>{children}</View>;
}

const styles = StyleSheet.create({
  bar: {
    marginHorizontal: 16,
    padding: 12,
    borderRadius: BORDER_RADIUS,
    shadowColor: '#1A1714',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: Platform.OS === 'android' ? 6 : 0,
  },
});
