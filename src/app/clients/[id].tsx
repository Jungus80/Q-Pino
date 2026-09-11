import { modalityLabel } from '@/core/labels';
import { computeConfidence } from '@/core/score/confidence';
import { getInstitution, type InstitutionRow } from '@/db/repos/institutions';
import { listEquipmentForInstitution, type EquipmentRow } from '@/db/repos/equipment';
import { listObservationsForInstitution, type ObservationRow } from '@/db/repos/observations';
import { Icon } from '@/components/Icon';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const BAND_COLOR: Record<'Alta' | 'Media' | 'Baja', string> = {
  Alta: 'bg-emerald-500',
  Media: 'bg-amber-500',
  Baja: 'bg-red-500',
};

const SOURCE_LABEL: Record<string, string> = {
  voice: 'Voz',
  text: 'Texto',
  photo: 'Foto',
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
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [institution, setInstitution] = useState<InstitutionRow | null>(null);
  const [groups, setGroups] = useState<ModalityGroup[]>([]);
  const [comments, setComments] = useState<ObservationRow[]>([]);

  useEffect(() => {
    (async () => {
      if (!id) return;
      const [inst, equipment, observations] = await Promise.all([
        getInstitution(id),
        listEquipmentForInstitution(id),
        listObservationsForInstitution(id),
      ]);
      setInstitution(inst);
      setGroups(groupByModality(equipment, new Date()));
      setComments(observations.filter((o) => o.comments));
      setLoading(false);
    })();
  }, [id]);

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-white items-center justify-center">
        <ActivityIndicator color="#0066CC" size="large" />
      </SafeAreaView>
    );
  }

  if (!institution) {
    return (
      <SafeAreaView className="flex-1 bg-white items-center justify-center">
        <Text className="text-gray-600">Cliente no encontrado.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView contentContainerClassName="p-4 pb-12">
        <Text className="text-gray-900 text-2xl font-bold">{institution.name}</Text>
        <Text className="text-gray-600 text-sm mt-1 mb-1">
          {[institution.site, institution.city, institution.countryIso].filter(Boolean).join(' · ') || 'Ubicación desconocida'}
        </Text>
        <Text className="text-gray-500 text-xs mb-6">
          Cliente desde {new Date(institution.createdAt).toLocaleDateString('es')}
        </Text>

        {groups.length === 0 && (
          <View className="bg-gray-50 border border-gray-200 rounded-xl p-4">
            <Text className="text-gray-600">Todavía no hay equipos registrados para este cliente.</Text>
          </View>
        )}

        {groups.map((g) => (
          <View key={g.modality} className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
            <View className="flex-row items-center justify-between mb-1">
              <Text className="text-gray-900 font-bold text-base">{modalityLabel(g.modality)}</Text>
              <View className={`px-3 py-1 rounded-full ${BAND_COLOR[g.band]}`}>
                <Text className="text-white text-xs font-bold">
                  {g.band} ({g.score})
                </Text>
              </View>
            </View>
            <Text className="text-gray-500 text-xs mb-4">
              {g.count} {g.count === 1 ? 'unidad' : 'unidades'} · {g.items.length}{' '}
              {g.items.length === 1 ? 'registro' : 'registros'}
            </Text>
            <View className="flex-row justify-between mb-4 pb-4 border-b border-gray-200">
              <View>
                <Text className="text-gray-600 text-xs font-semibold mb-1">Cantidad</Text>
                <Text className="text-gray-900 text-2xl font-bold">{g.count}</Text>
              </View>
              <View className="items-end">
                <Text className="text-gray-600 text-xs font-semibold mb-1">Antigüedad aprox.</Text>
                <Text className="text-gray-900 text-2xl font-bold">{g.ageLabel}</Text>
              </View>
            </View>
            <Text className="text-gray-600 text-xs font-semibold uppercase mb-2">Equipos registrados</Text>
            {g.items.map((item, index) => {
              const title = [item.manufacturer, item.model].filter(Boolean).join(' ') || 'Fabricante/modelo desconocido';
              const units = item.count != null ? `${item.count} ${item.count === 1 ? 'unidad' : 'unidades'}` : null;
              return (
                <Pressable
                  key={item.id}
                  onPress={() => router.push(`/equipment/${item.id}`)}
                  accessibilityRole="button"
                  accessibilityLabel={`Ver detalle de ${title}`}
                  className={`flex-row items-center bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 active:bg-blue-100 ${
                    index < g.items.length - 1 ? 'mb-2' : ''
                  }`}>
                  <View className="flex-1 pr-3">
                    <Text className="text-gray-900 text-sm font-semibold">{title}</Text>
                    {units ? <Text className="text-gray-600 text-xs mt-0.5">{units}</Text> : null}
                  </View>
                  <View className="flex-row items-center gap-1 shrink-0">
                    <Text className="text-blue-700 text-sm font-semibold">Ver detalle</Text>
                    <Icon name="chevron-right" size="md" color="#0066CC" />
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}

        {comments.length > 0 && (
          <>
            <Text className="text-gray-700 text-sm font-bold uppercase mb-3 mt-6">
              Observaciones ({comments.length})
            </Text>
            {comments.map((o) => (
              <View key={o.id} className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-2">
                <Text className="text-gray-900 text-sm mb-2">{o.comments}</Text>
                <Text className="text-gray-600 text-xs">
                  {new Date(o.createdAt).toLocaleDateString('es', { year: 'numeric', month: 'short', day: 'numeric' })}
                  {' · '}
                  {o.observerId} · {SOURCE_LABEL[o.source] ?? o.source}
                </Text>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
