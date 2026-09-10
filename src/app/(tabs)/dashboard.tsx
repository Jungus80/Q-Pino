import { computeDashboard, ageBucketForRange, type DashboardData } from '@/core/score/dashboard';
import type { Modality } from '@/core/schema/observation';
import { listInstitutions, type InstitutionRow } from '@/db/repos/institutions';
import { listAllEquipment, type EquipmentRow } from '@/db/repos/equipment';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="mb-6">
      <Text className="text-gray-700 text-sm font-bold uppercase mb-3">{title}</Text>
      {children}
    </View>
  );
}

function Bar({
  label,
  count,
  max,
  active,
  onPress,
}: {
  label: string;
  count: number;
  max: number;
  active: boolean;
  onPress: () => void;
}) {
  const pct = max === 0 ? 0 : Math.max(4, (count / max) * 100);
  return (
    <Pressable onPress={onPress} className="mb-3" disabled={count === 0}>
      <View className="flex-row justify-between mb-2">
        <Text className={`text-sm font-semibold ${active ? 'text-blue-600' : 'text-gray-700'}`}>{label}</Text>
        <Text className={`text-sm font-bold ${active ? 'text-blue-600' : 'text-gray-900'}`}>{count}</Text>
      </View>
      <View className="h-2.5 bg-gray-200 rounded-full overflow-hidden">
        <View className={`h-full rounded-full ${active ? 'bg-blue-600' : 'bg-blue-500'}`} style={{ width: `${pct}%` }} />
      </View>
    </Pressable>
  );
}

type Filters = { modality: Modality | null; countryIso: string | null; ageBucket: string | null };
const EMPTY_FILTERS: Filters = { modality: null, countryIso: null, ageBucket: null };

export default function DashboardScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [institutions, setInstitutions] = useState<InstitutionRow[]>([]);
  const [equipment, setEquipment] = useState<EquipmentRow[]>([]);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);

  const load = useCallback(async () => {
    setLoading(true);
    const [inst, eq] = await Promise.all([listInstitutions(), listAllEquipment()]);
    setInstitutions(inst);
    setEquipment(eq);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const now = useMemo(() => new Date(), [equipment]);

  // Country filter narrows institutions first (so byCountry/byModality/byAge, which are
  // all derived from filteredEquipment below, only ever see equipment at matching sites).
  const filteredInstitutions = useMemo(
    () => (filters.countryIso ? institutions.filter((i) => i.countryIso === filters.countryIso) : institutions),
    [institutions, filters.countryIso]
  );
  const institutionIds = useMemo(() => new Set(filteredInstitutions.map((i) => i.id)), [filteredInstitutions]);

  const filteredEquipment = useMemo(
    () =>
      equipment.filter((e) => {
        if (!institutionIds.has(e.institutionId)) return false;
        if (filters.modality && e.modality !== filters.modality) return false;
        if (filters.ageBucket && ageBucketForRange(e.installYearLo, e.installYearHi, now) !== filters.ageBucket) return false;
        return true;
      }),
    [equipment, institutionIds, filters.modality, filters.ageBucket, now]
  );

  const data: DashboardData = useMemo(
    () => computeDashboard(filteredInstitutions, filteredEquipment, now),
    [filteredInstitutions, filteredEquipment, now]
  );

  // Unfiltered totals for the bar-chart "max" scale, so bars don't visually rescale to
  // fill the width every time a filter narrows the data — only the active dimension's
  // own chart should look "selected"; the other two stay comparable to their full range.
  const fullData = useMemo(() => computeDashboard(institutions, equipment, now), [institutions, equipment, now]);

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-white items-center justify-center">
        <ActivityIndicator color="#0066CC" size="large" />
      </SafeAreaView>
    );
  }

  function toggle<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((prev) => ({ ...prev, [key]: prev[key] === value ? null : value }));
  }

  const maxModality = Math.max(1, ...fullData.byModality.map((m) => m.count));
  const maxCountry = Math.max(1, ...fullData.byCountry.map((c) => c.count));
  const maxAge = Math.max(1, ...fullData.byAgeBucket.map((a) => a.count));
  const confidenceBand = data.avgConfidence >= 70 ? 'Alta' : data.avgConfidence >= 40 ? 'Media' : 'Baja';
  const confidenceColor = data.avgConfidence >= 70 ? 'text-emerald-400' : data.avgConfidence >= 40 ? 'text-amber-400' : 'text-red-400';
  const hasActiveFilters = filters.modality || filters.countryIso || filters.ageBucket;

  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView contentContainerClassName="p-4 pb-12">
        <View className="flex-row items-center justify-between mb-2">
          <View>
            <Text className="text-gray-900 text-2xl font-bold">Dashboard</Text>
            <Text className="text-gray-500 text-sm mt-1">{data.totalEquipment} equipos{hasActiveFilters ? ' (filtrado)' : ' en total'}</Text>
          </View>
          {hasActiveFilters && (
            <Pressable onPress={() => setFilters(EMPTY_FILTERS)} className="bg-red-50 rounded-lg px-3 py-2">
              <Text className="text-red-600 text-xs font-semibold">Limpiar</Text>
            </Pressable>
          )}
        </View>

        {hasActiveFilters && (
          <View className="flex-row flex-wrap gap-2 mb-4">
            {filters.modality && (
              <Pressable onPress={() => toggle('modality', filters.modality)} className="bg-blue-100 rounded-full px-3 py-1.5">
                <Text className="text-blue-700 text-xs font-semibold">{filters.modality} ×</Text>
              </Pressable>
            )}
            {filters.countryIso && (
              <Pressable onPress={() => toggle('countryIso', filters.countryIso)} className="bg-blue-100 rounded-full px-3 py-1.5">
                <Text className="text-blue-700 text-xs font-semibold">{filters.countryIso} ×</Text>
              </Pressable>
            )}
            {filters.ageBucket && (
              <Pressable onPress={() => toggle('ageBucket', filters.ageBucket)} className="bg-blue-100 rounded-full px-3 py-1.5">
                <Text className="text-blue-700 text-xs font-semibold">{filters.ageBucket} ×</Text>
              </Pressable>
            )}
          </View>
        )}

        <View className="flex-row gap-3 mb-6">
          <View className="flex-1 bg-blue-50 rounded-xl p-4 border border-blue-200">
            <Text className="text-blue-700 text-xs font-semibold mb-2">Confianza Promedio</Text>
            <Text className={`text-3xl font-bold ${confidenceColor}`}>{data.avgConfidence}</Text>
            <Text className="text-blue-600 text-xs mt-1">{confidenceBand}</Text>
          </View>
          <View className="flex-1 bg-amber-50 rounded-xl p-4 border border-amber-200">
            <Text className="text-amber-700 text-xs font-semibold mb-2">Sin Actualizar +1 Año</Text>
            <Text className="text-3xl font-bold text-amber-600">{data.staleClients.length}</Text>
            <Text className="text-amber-600 text-xs mt-1">clientes</Text>
          </View>
        </View>

        <Section title="Equipos por modalidad (toca para filtrar)">
          {fullData.byModality.map((m) => (
            <Bar
              key={m.modality}
              label={m.modality}
              count={m.count}
              max={maxModality}
              active={filters.modality === m.modality}
              onPress={() => toggle('modality', m.modality)}
            />
          ))}
        </Section>

        <Section title="Equipos por país (toca para filtrar)">
          {fullData.byCountry.map((c) => (
            <Bar
              key={c.countryIso}
              label={c.countryIso}
              count={c.count}
              max={maxCountry}
              active={filters.countryIso === c.countryIso}
              onPress={() => toggle('countryIso', c.countryIso)}
            />
          ))}
          {fullData.byCountry.length === 0 && <Text className="text-neutral-600 text-sm">Sin datos de país.</Text>}
        </Section>

        <Section title="Equipos por antigüedad estimada (toca para filtrar)">
          {fullData.byAgeBucket.map((a) => (
            <Bar
              key={a.bucket}
              label={a.bucket}
              count={a.count}
              max={maxAge}
              active={filters.ageBucket === a.bucket}
              onPress={() => toggle('ageBucket', a.bucket)}
            />
          ))}
        </Section>

        <Section title={`Oportunidades de Renovación (${data.renewalOpportunities.length})`}>
          {data.renewalOpportunities.length === 0 && (
            <View className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <Text className="text-gray-600 text-sm">Ningún equipo supera el umbral de renovación.</Text>
            </View>
          )}
          {data.renewalOpportunities.map((r, i) => (
            <Pressable
              key={i}
              onPress={() => router.push(`/clients/${r.institutionId}`)}
              className="bg-white border border-gray-200 rounded-lg p-3 mb-2 flex-row items-center justify-between">
              <View className="flex-1">
                <Text className="text-gray-900 text-sm font-semibold">{r.institutionName}</Text>
                <Text className="text-gray-600 text-xs mt-1">
                  {r.modality} · ~{r.ageYears} años (umbral: {r.thresholdYears})
                </Text>
              </View>
              <View className="bg-amber-100 rounded-lg px-2 py-1">
                <Text className="text-amber-700 text-xs font-bold">{r.confidence}</Text>
              </View>
            </Pressable>
          ))}
        </Section>

        <Section title={`Clientes con Tecnología Envejecida (${data.agingClients.length})`}>
          {data.agingClients.length === 0 && (
            <View className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <Text className="text-gray-600 text-sm">Ninguno.</Text>
            </View>
          )}
          {data.agingClients.slice(0, 8).map((c, i) => (
            <Pressable key={i} onPress={() => router.push(`/clients/${c.institutionId}`)} className="bg-white border border-gray-200 rounded-lg p-3 mb-2">
              <Text className="text-gray-900 text-sm font-semibold">{c.institutionName}</Text>
              <Text className="text-gray-600 text-xs mt-1">{c.modality}, ~{c.ageYears} años</Text>
            </Pressable>
          ))}
        </Section>

        <Section title={`Clientes con Información Incompleta (${data.incompleteClients.length})`}>
          {data.incompleteClients.length === 0 && (
            <View className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <Text className="text-gray-600 text-sm">Ninguno.</Text>
            </View>
          )}
          {data.incompleteClients.slice(0, 8).map((c) => (
            <Pressable key={c.institutionId} onPress={() => router.push(`/clients/${c.institutionId}`)} className="bg-white border border-gray-200 rounded-lg p-3 mb-2">
              <Text className="text-gray-900 text-sm font-semibold">{c.institutionName}</Text>
              <Text className="text-gray-600 text-xs mt-1">{c.incompleteCount} campo(s) sin dato</Text>
            </Pressable>
          ))}
        </Section>

        <Section title="Sitios Actualizados Recientemente">
          {data.recentlyUpdated.length === 0 && (
            <View className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <Text className="text-gray-600 text-sm">Sin observaciones aún.</Text>
            </View>
          )}
          {data.recentlyUpdated.map((c) => (
            <Pressable key={c.institutionId} onPress={() => router.push(`/clients/${c.institutionId}`)} className="bg-white border border-gray-200 rounded-lg p-3 mb-2">
              <Text className="text-gray-900 text-sm font-semibold">{c.institutionName}</Text>
              <Text className="text-gray-600 text-xs mt-1">{new Date(c.lastVerifiedAt).toLocaleDateString('es', { year: 'numeric', month: 'short', day: 'numeric' })}</Text>
            </Pressable>
          ))}
        </Section>

        {data.staleClients.length > 0 && (
          <Section title={`Alertas de Frescura (${data.staleClients.length})`}>
            {data.staleClients.map((c) => (
              <Pressable key={c.institutionId} onPress={() => router.push(`/clients/${c.institutionId}`)} className="bg-red-50 border border-red-200 rounded-lg p-3 mb-2">
                <Text className="text-red-700 text-sm font-semibold">{c.institutionName}</Text>
                <Text className="text-red-600 text-xs mt-1">Sin verificar hace {c.daysSinceVerified} días</Text>
              </Pressable>
            ))}
          </Section>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
