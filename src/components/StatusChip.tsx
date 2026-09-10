import { Pressable, Text, View } from 'react-native';
import { FIELD_STATUSES, type FieldStatus } from '@/core/schema/observation';

export const STATUS_COLOR: Record<FieldStatus, { bg: string; text: string; icon: string }> = {
  Confirmado: { bg: 'bg-green-100', text: 'text-green-700', icon: '✓' },
  Reportado: { bg: 'bg-blue-100', text: 'text-blue-700', icon: '📋' },
  Estimado: { bg: 'bg-amber-100', text: 'text-amber-700', icon: '~' },
  Desconocido: { bg: 'bg-gray-100', text: 'text-gray-700', icon: '?' },
};

export function cycleStatus(current: FieldStatus): FieldStatus {
  const i = FIELD_STATUSES.indexOf(current);
  return FIELD_STATUSES[(i + 1) % FIELD_STATUSES.length];
}

export function StatusChip({ status, onPress }: { status: FieldStatus; onPress?: () => void }) {
  const colors = STATUS_COLOR[status];
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      className={`px-3 py-1.5 rounded-full flex-row items-center gap-1 ${colors.bg}`}>
      <Text className={`text-xs font-semibold ${colors.text}`}>{colors.icon}</Text>
      <Text className={`text-xs font-semibold ${colors.text}`}>{status}</Text>
    </Pressable>
  );
}
