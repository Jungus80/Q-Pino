import { Text } from '@/components/ui/text';
import { useColor } from '@/hooks/useColor';
import { FontFamily } from '@/theme/fonts';
import { CORNERS } from '@/theme/globals';
import { Pressable, StyleSheet } from 'react-native';

export function FilterChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
}) {
  const primary = useColor('primary');
  const primaryFg = useColor('primaryForeground');
  const accent = useColor('accent');
  const accentFg = useColor('accentForeground');

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      android_ripple={{ color: primary + '33' }}
      style={[
        styles.chip,
        { backgroundColor: selected ? primary : accent },
      ]}
    >
      <Text
        style={{
          fontFamily: FontFamily.sansSemi,
          fontSize: 12,
          color: selected ? primaryFg : accentFg,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderRadius: CORNERS,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
});
