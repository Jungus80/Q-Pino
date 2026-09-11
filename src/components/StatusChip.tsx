import React from 'react';
import { Pressable, Text, View, StyleSheet } from 'react-native';
import { FIELD_STATUSES, type FieldStatus } from '@/core/schema/observation';
import { Icon, type IconName } from './Icon';

export const STATUS_CONFIG: Record<FieldStatus, { bg: string; text: string; icon: IconName }> = {
  Confirmado: { bg: '#DCFCE7', text: '#166534', icon: 'check' },
  Reportado: { bg: '#DBEAFE', text: '#1E40AF', icon: 'alert' },
  Estimado: { bg: '#FEF3C7', text: '#92400E', icon: 'info' },
  Desconocido: { bg: '#F3F4F6', text: '#374151', icon: 'help' },
};

export function cycleStatus(current: FieldStatus): FieldStatus {
  const i = FIELD_STATUSES.indexOf(current);
  return FIELD_STATUSES[(i + 1) % FIELD_STATUSES.length];
}

interface StatusChipProps {
  status: FieldStatus;
  onPress?: () => void;
  size?: 'sm' | 'md';
}

export function StatusChip({ status, onPress, size = 'md' }: StatusChipProps) {
  const config = STATUS_CONFIG[status];
  const isSmall = size === 'sm';
  const iconSize = isSmall ? 'xs' : 'sm';
  const fontSize = isSmall ? 11 : 12;
  const paddingHorizontal = isSmall ? 8 : 12;
  const paddingVertical = isSmall ? 4 : 6;

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={[
        styles.chip,
        {
          backgroundColor: config.bg,
          paddingHorizontal,
          paddingVertical,
          opacity: onPress ? 1 : 0.7,
        },
      ]}>
      <Icon name={config.icon} size={iconSize} color={config.text} />
      <Text style={[styles.text, { color: config.text, fontSize }]}>{status}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  text: {
    fontWeight: '600',
  },
});
