import { listInstitutions, type InstitutionRow } from '@/db/repos/institutions';
import { listAllEquipment, listEquipmentForInstitution } from '@/db/repos/equipment';
import { seedIfEmpty } from '@/db/seed';
import { resetDb } from '@/db/client';
import { Icon } from '@/components/Icon';
import { TabScreenSafeAreaEdges } from '@/constants/theme';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type InstitutionSummary = InstitutionRow & { equipmentCount: number; modalities: string[] };

export default function ClientsScreen() {
  const router = useRouter();
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

  function handleReset() {
    Alert.alert(
      'Reiniciar datos de prueba',
      'Borra todos los clientes y equipos guardados y vuelve a cargar los 6 clientes ficticios de siembra (Panamá y Colombia). Esto no se puede deshacer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Reiniciar',
          style: 'destructive',
          onPress: async () => {
            await resetDb();
            await load();
          },
        },
      ]
    );
  }

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-white items-center justify-center" edges={TabScreenSafeAreaEdges}>
        <ActivityIndicator color="#0066CC" size="large" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white" edges={TabScreenSafeAreaEdges}>
      <View className="px-4 pt-4 pb-4 border-b border-gray-200">
        <View className="flex-row items-center justify-between mb-3">
          <View>
            <Text className="text-gray-900 text-2xl font-bold">Clientes</Text>
            <Text className="text-gray-500 text-sm mt-1">
              {institutions.length} clientes · {Object.values(totalsByModality).reduce((a, b) => a + b, 0)} equipos
            </Text>
          </View>
          <Pressable onPress={handleReset} className="bg-red-50 rounded-lg px-3 py-2 flex-row items-center gap-1">
            <Icon name="close" size="sm" color="#DC2626" />
            <Text className="text-red-600 text-xs font-semibold">Restablecer</Text>
          </Pressable>
        </View>
        <View className="flex-row flex-wrap gap-2">
          {Object.entries(totalsByModality)
            .sort((a, b) => b[1] - a[1])
            .map(([modality, count]) => (
              <View key={modality} className="bg-blue-100 rounded-full px-3 py-1.5">
                <Text className="text-blue-700 text-xs font-semibold">
                  {modality}: <Text className="font-bold">{count}</Text>
                </Text>
              </View>
            ))}
        </View>
      </View>

      <FlatList
        data={institutions}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12 }}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/clients/${item.id}`)}
            className="bg-white border border-gray-200 rounded-xl p-4 mb-3">
            <View className="flex-row items-start justify-between">
              <View className="flex-1">
                <Text className="text-gray-900 font-bold text-base">{item.name}</Text>
                <Text className="text-gray-600 text-sm mt-1">
                  {[item.city, item.countryIso].filter(Boolean).join(', ') || 'Ubicación no especificada'}
                </Text>
              </View>
              <Icon name="chevron-right" size="md" color="#D1D5DB" />
            </View>
            <View className="flex-row flex-wrap gap-2 mt-3">
              {item.modalities.map((m) => (
                <View key={m} className="bg-blue-50 rounded-lg px-2.5 py-1">
                  <Text className="text-blue-700 text-xs font-semibold">{m}</Text>
                </View>
              ))}
              {item.modalities.length === 0 && (
                <Text className="text-gray-500 text-xs">Sin equipos registrados</Text>
              )}
            </View>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}
