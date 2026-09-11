import { Text } from '@/components/ui/text';
import { View } from '@/components/ui/view';
import { StyleSheet } from 'react-native';

export function EmptyState({ children }: { children: string }) {
  return (
    <View style={styles.box}>
      <Text variant="caption">{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { paddingVertical: 12 },
});
