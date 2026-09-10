import { listInstitutions, type InstitutionRow } from '@/db/repos/institutions';
import { listAllEquipment, listEquipmentForInstitution } from '@/db/repos/equipment';
import { seedIfEmpty } from '@/db/seed';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
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

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-neutral-950 items-center justify-center">
        <ActivityIndicator color="#fff" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-neutral-950">
      <View className="px-4 pt-2 pb-3">
        <Text className="text-white text-2xl font-bold mb-1">Clientes</Text>
        <Text className="text-neutral-400 mb-3">
          {institutions.length} clientes · {Object.values(totalsByModality).reduce((a, b) => a + b, 0)} equipos
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {Object.entries(totalsByModality)
            .sort((a, b) => b[1] - a[1])
            .map(([modality, count]) => (
              <View key={modality} className="bg-neutral-900 rounded-full px-3 py-1">
                <Text className="text-neutral-300 text-xs">
                  {modality}: <Text className="text-white font-semibold">{count}</Text>
                </Text>
              </View>
            ))}
        </View>
      </View>

      <FlatList
        data={institutions}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/clients/${item.id}`)}
            className="bg-neutral-900 rounded-xl p-4 mb-3">
            <Text className="text-white font-semibold text-base">{item.name}</Text>
            <Text className="text-neutral-400 text-sm mt-0.5">
              {[item.city, item.countryIso].filter(Boolean).join(', ') || 'Ubicación desconocida'}
            </Text>
            <View className="flex-row flex-wrap gap-1 mt-2">
              {item.modalities.map((m) => (
                <View key={m} className="bg-neutral-800 rounded px-2 py-0.5">
                  <Text className="text-neutral-300 text-xs">{m}</Text>
                </View>
              ))}
              {item.modalities.length === 0 && (
                <Text className="text-neutral-600 text-xs">Sin equipos registrados</Text>
              )}
            </View>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}
