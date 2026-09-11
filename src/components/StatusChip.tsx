import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { FIELD_STATUSES, type FieldStatus } from '@/core/schema/observation';
import { Icon, type IconName } from './Icon';
import { useColor } from '@/hooks/useColor';
import { FontFamily } from '@/theme/fonts';
import { CORNERS } from '@/theme/globals';

export function cycleStatus(current: FieldStatus): FieldStatus {
  const i = FIELD_STATUSES.indexOf(current);
  return FIELD_STATUSES[(i + 1) % FIELD_STATUSES.length];
}

const ICONS: Record<FieldStatus, IconName> = {
  Confirmado: 'check',
  Reportado: 'alert',
  Estimado: 'info',
  Desconocido: 'help',
};

interface StatusChipProps {
  status: FieldStatus;
  onPress?: () => void;
  size?: 'sm' | 'md';
}

export function StatusChip({ status, onPress, size = 'md' }: StatusChipProps) {
  const green = useColor('green');
  const blue = useColor('blue');
  const orange = useColor('orange');
  const muted = useColor('textMuted');
  const card = useColor('card');
  const secondary = useColor('secondary');

  const palette: Record<FieldStatus, { bg: string; text: string }> = {
    Confirmado: { bg: secondary, text: green },
    Reportado: { bg: secondary, text: blue },
    Estimado: { bg: secondary, text: orange },
    Desconocido: { bg: card, text: muted },
  };

  const config = palette[status];
  const isSmall = size === 'sm';

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={[
        styles.chip,
        {
          backgroundColor: config.bg,
          paddingHorizontal: isSmall ? 8 : 12,
          paddingVertical: isSmall ? 4 : 6,
          opacity: onPress ? 1 : 0.75,
        },
      ]}
    >
      <Icon name={ICONS[status]} size={isSmall ? 'xs' : 'sm'} color={config.text} />
      <Text style={[styles.text, { color: config.text, fontSize: isSmall ? 11 : 12 }]}>{status}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: CORNERS,
    alignSelf: 'flex-start',
  },
  text: {
    fontFamily: FontFamily.sansSemi,
  },
});
