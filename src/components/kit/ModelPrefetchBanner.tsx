import { retryPrefetchOnDeviceModels } from '@/ai/modelManager';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Text } from '@/components/ui/text';
import { View } from '@/components/ui/view';
import { useModelPrefetch } from '@/hooks/use-model-prefetch';
import { useColor } from '@/hooks/useColor';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const LABELS: Record<string, string> = {
  lenguaje: 'modelo de lenguaje',
  voz: 'modelo de voz',
  placa: 'modelo de placa',
};

export function ModelPrefetchBanner() {
  const { showBanner, status, label, index, total, percentage } = useModelPrefetch();
  const insets = useSafeAreaInsets();
  const card = useColor('card');
  const border = useColor('border');

  if (!showBanner) return null;

  const name = LABELS[label] ?? 'modelos';
  const pct = percentage != null ? Math.round(percentage) : null;
  const failed = status === 'error';

  return (
    <View
      pointerEvents={failed ? 'box-none' : 'none'}
      style={{
        position: 'absolute',
        top: insets.top + 8,
        left: 16,
        right: 16,
        zIndex: 80,
      }}
    >
      <Card style={{ backgroundColor: card, borderWidth: 1, borderColor: border, padding: 14 }}>
        {failed ? (
          <>
            <Text variant="body" style={{ marginBottom: 8 }}>
              No se pudieron descargar los modelos.
            </Text>
            <Text variant="caption" style={{ marginBottom: 12 }}>
              Para la primera descarga hace falta conexión a internet. Después la app funciona sin red.
            </Text>
            <Button size="sm" onPress={() => retryPrefetchOnDeviceModels()} haptic>
              Reintentar
            </Button>
          </>
        ) : (
          <>
            <Text variant="body" style={{ marginBottom: 8 }}>
              Descargando {name}
              {pct != null ? ` · ${pct}%` : ''}
            </Text>
            <Progress value={pct ?? 0} height={6} />
            <Text variant="caption" style={{ marginTop: 8 }}>
              {Math.min(index + 1, total)} de {total}. La primera descarga necesita internet; luego funciona sin conexión.
            </Text>
          </>
        )}
      </Card>
    </View>
  );
}
