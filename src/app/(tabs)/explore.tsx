import { listInstitutions, type InstitutionRow } from '@/db/repos/institutions';
import { listAllEquipment, listEquipmentForInstitution } from '@/db/repos/equipment';
import { seedIfEmpty } from '@/db/seed';
import { resetDb } from '@/db/client';
import { Icon } from '@/components/Icon';
import { Screen } from '@/components/kit/Screen';
import { ScreenHeader } from '@/components/kit/ScreenHeader';
import { FilterChip } from '@/components/kit/FilterChip';
import { AlertDialog, useAlertDialog } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { Text } from '@/components/ui/text';
import { View } from '@/components/ui/view';
import { useAppStyles } from '@/theme/useAppStyles';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable } from 'react-native';

type InstitutionSummary = InstitutionRow & { equipmentCount: number; modalities: string[] };

export default function ClientsScreen() {
  const router = useRouter();
  const { muted, styles } = useAppStyles();
  const dialog = useAlertDialog();
  const [loading, setLoading] = useState(true);
  const [institutions, setInstitutions] = useState<InstitutionSummary[]>([]);
  const [totalsByModality, setTotalsByModality] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    setLoading(true);
    await seedIfEmpty();
    const [rows, allEquipment] = await Promise.all([listInstitutions(), listAllEquipment()]);

    const totals: Record<string, number> = {};
    for (const eq of allEquipment) {
      totals[eq.modality] = (totals[eq.modality] ?? 0) + (eq.count ?? 1);
    }
    setTotalsByModality(totals);

    const summaries = await Promise.all(
      rows.map(async (inst) => {
        const equipment = await listEquipmentForInstitution(inst.id);
        return {
          ...inst,
          equipmentCount: equipment.reduce((sum, e) => sum + (e.count ?? 1), 0),
          modalities: Array.from(new Set(equipment.map((e) => e.modality))),
        };
      })
    );
    setInstitutions(summaries);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (loading) {
    return (
      <Screen centered>
        <Spinner size="lg" />
      </Screen>
    );
  }

  const totalEq = Object.values(totalsByModality).reduce((a, b) => a + b, 0);

  return (
    <Screen>
      <View style={[styles.pad, { paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: styles.card.borderColor }]}>
        <ScreenHeader
          title="Clientes"
          subtitle={`${institutions.length} clientes · ${totalEq} equipos`}
          right={
            <Button variant="ghost" size="sm" onPress={dialog.open} haptic>
              Restablecer
            </Button>
          }
        />
        <View style={styles.wrap}>
          {Object.entries(totalsByModality)
            .sort((a, b) => b[1] - a[1])
            .map(([modality, count]) => (
              <FilterChip key={modality} label={`${modality}: ${count}`} />
            ))}
        </View>
      </View>

      <FlatList
        data={institutions}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12 }}
        renderItem={({ item }) => (
          <Pressable onPress={() => router.push(`/clients/${item.id}`)} style={{ marginBottom: 10 }}>
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text variant="subtitle">{item.name}</Text>
                  <Text variant="caption" style={{ marginTop: 4 }}>
                    {[item.city, item.countryIso].filter(Boolean).join(', ') || 'Ubicación no especificada'}
                  </Text>
                </View>
                <Icon name="chevron-right" size="md" color={muted} />
              </View>
              <View style={[styles.wrap, { marginTop: 12 }]}>
                {item.modalities.map((m) => (
                  <FilterChip key={m} label={m} />
                ))}
                {item.modalities.length === 0 && (
                  <Text variant="caption">Sin equipos registrados</Text>
                )}
              </View>
            </Card>
          </Pressable>
        )}
      />

      <AlertDialog
        isVisible={dialog.isVisible}
        onClose={dialog.close}
        title="Reiniciar datos de prueba"
        description="Borra todos los clientes y equipos guardados y vuelve a cargar los 6 clientes ficticios de siembra (Panamá y Colombia). Esto no se puede deshacer."
        confirmText="Reiniciar"
        cancelText="Cancelar"
        onConfirm={async () => {
          await resetDb();
          await load();
          dialog.close();
        }}
        onCancel={dialog.close}
      />
    </Screen>
  );
}
