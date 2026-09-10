import { computeConfidence } from '@/core/score/confidence';
import { getInstitution, type InstitutionRow } from '@/db/repos/institutions';
import { listEquipmentForInstitution, type EquipmentRow } from '@/db/repos/equipment';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const BAND_COLOR: Record<'Alta' | 'Media' | 'Baja', string> = {
  Alta: 'bg-emerald-500',
  Media: 'bg-amber-500',
  Baja: 'bg-red-500',
};

type ModalityGroup = {
  modality: string;
  count: number;
  ageLo: number | null;
  ageHi: number | null;
  ageLabel: string;
  band: 'Alta' | 'Media' | 'Baja';
  score: number;
  items: EquipmentRow[];
};

function ageRangeYears(rows: EquipmentRow[], now: Date): { lo: number | null; hi: number | null; label: string } {
  const withAge = rows.filter((r) => r.installYearLo != null);
  if (withAge.length === 0) return { lo: null, hi: null, label: 'Desconocida' };

  const currentYear = now.getFullYear();
  const ages = withAge.flatMap((r) => [currentYear - r.installYearHi!, currentYear - r.installYearLo!]);
  const lo = Math.min(...ages);
  const hi = Math.max(...ages);
  if (withAge.length < rows.length) return { lo, hi, label: 'Mixta' };
  return { lo, hi, label: lo === hi ? `${lo} años` : `${lo}–${hi} años` };
}

function groupByModality(rows: EquipmentRow[], now: Date): ModalityGroup[] {
  const byModality = new Map<string, EquipmentRow[]>();
  for (const row of rows) {
    const list = byModality.get(row.modality) ?? [];
    list.push(row);
    byModality.set(row.modality, list);
  }

  return Array.from(byModality.entries()).map(([modality, items]) => {
    const count = items.reduce((sum, r) => sum + (r.count ?? 1), 0);
    const age = ageRangeYears(items, now);
    const scores = items.map((r) =>
      computeConfidence(
        {
          fieldStatus: {
            manufacturer: r.statusManufacturer,
            model: r.statusModel,
            age: r.statusAge,
            count: r.statusCount,
          },
          lastVerifiedAt: r.lastVerifiedAt,
        },
        now
      )
    );
    const avgScore = Math.round(scores.reduce((sum, s) => sum + s.score, 0) / scores.length);
    const band: ModalityGroup['band'] = avgScore >= 70 ? 'Alta' : avgScore >= 40 ? 'Media' : 'Baja';

    return { modality, count, ageLo: age.lo, ageHi: age.hi, ageLabel: age.label, band, score: avgScore, items };
  });
}

export default function ClientDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [institution, setInstitution] = useState<InstitutionRow | null>(null);
  const [groups, setGroups] = useState<ModalityGroup[]>([]);

  useEffect(() => {
    (async () => {
      if (!id) return;
      const [inst, equipment] = await Promise.all([getInstitution(id), listEquipmentForInstitution(id)]);
      setInstitution(inst);
      setGroups(groupByModality(equipment, new Date()));
      setLoading(false);
    })();
  }, [id]);

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-neutral-950 items-center justify-center">
        <ActivityIndicator color="#fff" />
      </SafeAreaView>
    );
  }

  if (!institution) {
    return (
      <SafeAreaView className="flex-1 bg-neutral-950 items-center justify-center">
        <Text className="text-neutral-400">Cliente no encontrado.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-neutral-950">
      <ScrollView contentContainerClassName="p-4 pb-12">
        <Text className="text-white text-2xl font-bold">{institution.name}</Text>
        <Text className="text-neutral-400 mb-1">
          {[institution.site, institution.city, institution.countryIso].filter(Boolean).join(' · ') || 'Ubicación desconocida'}
        </Text>
        <Text className="text-neutral-600 text-xs mb-5">
          Cliente desde {new Date(institution.createdAt).toLocaleDateString('es')}
        </Text>

        {groups.length === 0 && (
          <Text className="text-neutral-500">Todavía no hay equipos registrados para este cliente.</Text>
        )}

        {groups.map((g) => (
          <View key={g.modality} className="bg-neutral-900 rounded-xl p-4 mb-3">
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-white font-semibold text-base">{g.modality}</Text>
              <View className={`px-2 py-0.5 rounded-full ${BAND_COLOR[g.band]}`}>
                <Text className="text-white text-xs font-medium">
                  Confianza {g.band} ({g.score})
                </Text>
              </View>
            </View>
            <View className="flex-row justify-between">
              <View>
                <Text className="text-neutral-500 text-xs">Cantidad</Text>
                <Text className="text-white text-lg font-semibold">{g.count}</Text>
              </View>
              <View>
                <Text className="text-neutral-500 text-xs">Antigüedad aprox.</Text>
                <Text className="text-white text-lg font-semibold">{g.ageLabel}</Text>
              </View>
            </View>
            <View className="mt-3 border-t border-neutral-800 pt-2">
              {g.items.map((item) => (
                <Text key={item.id} className="text-neutral-400 text-xs mb-1">
                  {[item.manufacturer, item.model].filter(Boolean).join(' ') || 'Fabricante/modelo desconocido'}
                  {item.count != null ? ` · ${item.count} unidad(es)` : ''}
                </Text>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
