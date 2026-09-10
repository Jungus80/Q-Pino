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
    <View className="mb-5">
      <Text className="text-neutral-500 text-xs uppercase mb-2">{title}</Text>
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
    <Pressable onPress={onPress} className="mb-2" disabled={count === 0}>
      <View className="flex-row justify-between mb-1">
        <Text className={`text-sm ${active ? 'text-blue-400 font-semibold' : 'text-neutral-300'}`}>{label}</Text>
        <Text className={`text-sm font-medium ${active ? 'text-blue-400' : 'text-white'}`}>{count}</Text>
      </View>
      <View className="h-2 bg-neutral-800 rounded-full overflow-hidden">
        <View className={`h-full rounded-full ${active ? 'bg-blue-400' : 'bg-blue-600'}`} style={{ width: `${pct}%` }} />
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
      <SafeAreaView className="flex-1 bg-neutral-950 items-center justify-center">
        <ActivityIndicator color="#fff" />
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
    <SafeAreaView className="flex-1 bg-neutral-950">
      <ScrollView contentContainerClassName="p-4 pb-12">
        <View className="flex-row items-center justify-between mb-1">
          <Text className="text-white text-2xl font-bold">Dashboard</Text>
          {hasActiveFilters && (
            <Pressable onPress={() => setFilters(EMPTY_FILTERS)}>
              <Text className="text-red-400 text-xs">Limpiar filtros</Text>
            </Pressable>
          )}
        </View>
        <Text className="text-neutral-400 mb-2">{data.totalEquipment} equipos{hasActiveFilters ? ' (filtrado)' : ' en total'}</Text>

        {hasActiveFilters && (
          <View className="flex-row flex-wrap gap-2 mb-3">
            {filters.modality && (
              <Pressable onPress={() => toggle('modality', filters.modality)} className="bg-blue-600 rounded-full px-3 py-1">
                <Text className="text-white text-xs">{filters.modality} ×</Text>
              </Pressable>
            )}
            {filters.countryIso && (
              <Pressable onPress={() => toggle('countryIso', filters.countryIso)} className="bg-blue-600 rounded-full px-3 py-1">
                <Text className="text-white text-xs">{filters.countryIso} ×</Text>
              </Pressable>
            )}
            {filters.ageBucket && (
              <Pressable onPress={() => toggle('ageBucket', filters.ageBucket)} className="bg-blue-600 rounded-full px-3 py-1">
                <Text className="text-white text-xs">{filters.ageBucket} ×</Text>
              </Pressable>
            )}
          </View>
        )}

        <View className="flex-row gap-3 mb-5">
          <View className="flex-1 bg-neutral-900 rounded-xl p-3">
            <Text className="text-neutral-500 text-xs">Confianza promedio</Text>
            <Text className={`text-2xl font-bold ${confidenceColor}`}>{data.avgConfidence}</Text>
            <Text className="text-neutral-500 text-xs">{confidenceBand}</Text>
          </View>
          <View className="flex-1 bg-neutral-900 rounded-xl p-3">
            <Text className="text-neutral-500 text-xs">Sin actualizar +1 año</Text>
            <Text className="text-2xl font-bold text-white">{data.staleClients.length}</Text>
            <Text className="text-neutral-500 text-xs">clientes</Text>
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

        <Section title={`Oportunidades de renovación (${data.renewalOpportunities.length})`}>
          {data.renewalOpportunities.length === 0 && (
            <Text className="text-neutral-600 text-sm">Ningún equipo supera el umbral de renovación de su modalidad.</Text>
          )}
          {data.renewalOpportunities.map((r, i) => (
            <Pressable
              key={i}
              onPress={() => router.push(`/clients/${r.institutionId}`)}
              className="bg-neutral-900 rounded-lg p-3 mb-2 flex-row items-center justify-between">
              <View className="flex-1">
                <Text className="text-white text-sm font-medium">{r.institutionName}</Text>
                <Text className="text-neutral-500 text-xs">
                  {r.modality} · ~{r.ageYears} años (umbral: {r.thresholdYears})
                </Text>
              </View>
              <Text className="text-amber-400 text-xs font-medium">Confianza {r.confidence}</Text>
            </Pressable>
          ))}
        </Section>

        <Section title={`Clientes con tecnología envejecida (${data.agingClients.length})`}>
          {data.agingClients.length === 0 && <Text className="text-neutral-600 text-sm">Ninguno.</Text>}
          {data.agingClients.slice(0, 8).map((c, i) => (
            <Pressable key={i} onPress={() => router.push(`/clients/${c.institutionId}`)} className="py-1.5">
              <Text className="text-neutral-300 text-sm">
                {c.institutionName} — {c.modality}, ~{c.ageYears} años
              </Text>
            </Pressable>
          ))}
        </Section>

        <Section title={`Clientes con información incompleta (${data.incompleteClients.length})`}>
          {data.incompleteClients.length === 0 && <Text className="text-neutral-600 text-sm">Ninguno.</Text>}
          {data.incompleteClients.slice(0, 8).map((c) => (
            <Pressable key={c.institutionId} onPress={() => router.push(`/clients/${c.institutionId}`)} className="py-1.5">
              <Text className="text-neutral-300 text-sm">
                {c.institutionName} — {c.incompleteCount} campo(s) sin dato
              </Text>
            </Pressable>
          ))}
        </Section>

        <Section title="Sitios actualizados recientemente">
          {data.recentlyUpdated.length === 0 && <Text className="text-neutral-600 text-sm">Sin observaciones aún.</Text>}
          {data.recentlyUpdated.map((c) => (
            <Pressable key={c.institutionId} onPress={() => router.push(`/clients/${c.institutionId}`)} className="py-1.5">
              <Text className="text-neutral-300 text-sm">
                {c.institutionName} — {new Date(c.lastVerifiedAt).toLocaleDateString('es', { year: 'numeric', month: 'short', day: 'numeric' })}
              </Text>
            </Pressable>
          ))}
        </Section>

        {data.staleClients.length > 0 && (
          <Section title={`Alertas de frescura (${data.staleClients.length})`}>
            {data.staleClients.map((c) => (
              <Pressable key={c.institutionId} onPress={() => router.push(`/clients/${c.institutionId}`)} className="py-1.5">
                <Text className="text-red-400 text-sm">
                  {c.institutionName} — sin verificar hace {c.daysSinceVerified} días
                </Text>
              </Pressable>
            ))}
          </Section>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
