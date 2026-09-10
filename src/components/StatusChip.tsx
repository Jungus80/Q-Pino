import { Pressable, Text } from 'react-native';
import { FIELD_STATUSES, type FieldStatus } from '@/core/schema/observation';

export const STATUS_COLOR: Record<FieldStatus, string> = {
  Confirmado: 'bg-emerald-500',
  Reportado: 'bg-blue-500',
  Estimado: 'bg-amber-500',
  Desconocido: 'bg-neutral-600',
};

export function cycleStatus(current: FieldStatus): FieldStatus {
  const i = FIELD_STATUSES.indexOf(current);
  return FIELD_STATUSES[(i + 1) % FIELD_STATUSES.length];
}

export function StatusChip({ status, onPress }: { status: FieldStatus; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} className={`px-2 py-0.5 rounded-full ${STATUS_COLOR[status]}`}>
      <Text className="text-white text-xs font-medium">{status}</Text>
    </Pressable>
  );
}
