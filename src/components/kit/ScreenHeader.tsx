import { Text } from '@/components/ui/text';
import { View } from '@/components/ui/view';
import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';

export function ScreenHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <View style={styles.block}>
      <Text variant="title">{title}</Text>
      {right ? <View style={styles.actions}>{right}</View> : null}
      {subtitle ? <Text variant="caption" style={styles.sub}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    marginBottom: 12,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    maxWidth: '100%',
  },
  sub: {
    marginTop: 8,
  },
});
