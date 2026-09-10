import { computeDashboard, type DashboardData } from '@/core/score/dashboard';
import { listInstitutions } from '@/db/repos/institutions';
import { listAllEquipment } from '@/db/repos/equipment';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
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

function Bar({ label, count, max }: { label: string; count: number; max: number }) {
  const pct = max === 0 ? 0 : Math.max(4, (count / max) * 100);
  return (
    <View className="mb-2">
      <View className="flex-row justify-between mb-1">
        <Text className="text-neutral-300 text-sm">{label}</Text>
        <Text className="text-white text-sm font-medium">{count}</Text>
      </View>
      <View className="h-2 bg-neutral-800 rounded-full overflow-hidden">
        <View className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
      </View>
    </View>
  );
}

export default function DashboardScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DashboardData | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [institutions, equipment] = await Promise.all([listInstitutions(), listAllEquipment()]);
    setData(computeDashboard(institutions, equipment, new Date()));
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (loading || !data) {
    return (
      <SafeAreaView className="flex-1 bg-neutral-950 items-center justify-center">
        <ActivityIndicator color="#fff" />
      </SafeAreaView>
    );
  }

  const maxModality = Math.max(1, ...data.byModality.map((m) => m.count));
  const maxCountry = Math.max(1, ...data.byCountry.map((c) => c.count));
  const maxAge = Math.max(1, ...data.byAgeBucket.map((a) => a.count));
  const confidenceBand = data.avgConfidence >= 70 ? 'Alta' : data.avgConfidence >= 40 ? 'Media' : 'Baja';
  const confidenceColor = data.avgConfidence >= 70 ? 'text-emerald-400' : data.avgConfidence >= 40 ? 'text-amber-400' : 'text-red-400';

  return (
    <SafeAreaView className="flex-1 bg-neutral-950">
      <ScrollView contentContainerClassName="p-4 pb-12">
        <Text className="text-white text-2xl font-bold mb-1">Dashboard</Text>
        <Text className="text-neutral-400 mb-5">{data.totalEquipment} equipos en total</Text>

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

        <Section title="Equipos por modalidad">
          {data.byModality.map((m) => (
            <Bar key={m.modality} label={m.modality} count={m.count} max={maxModality} />
          ))}
        </Section>

        <Section title="Equipos por país">
          {data.byCountry.map((c) => (
            <Bar key={c.countryIso} label={c.countryIso} count={c.count} max={maxCountry} />
          ))}
          {data.byCountry.length === 0 && <Text className="text-neutral-600 text-sm">Sin datos de país.</Text>}
        </Section>

        <Section title="Equipos por antigüedad estimada">
          {data.byAgeBucket.map((a) => (
            <Bar key={a.bucket} label={a.bucket} count={a.count} max={maxAge} />
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
