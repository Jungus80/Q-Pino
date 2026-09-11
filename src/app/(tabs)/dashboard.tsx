import { computeDashboard, ageBucketForRange, type DashboardData } from '@/core/score/dashboard';
import type { Modality } from '@/core/schema/observation';
import { listInstitutions, type InstitutionRow } from '@/db/repos/institutions';
import { listAllEquipment, type EquipmentRow } from '@/db/repos/equipment';
import { Icon } from '@/components/Icon';
import { Screen } from '@/components/kit/Screen';
import { ScreenHeader } from '@/components/kit/ScreenHeader';
import { FilterChip } from '@/components/kit/FilterChip';
import { EmptyState } from '@/components/kit/EmptyState';
import { Card } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { Text } from '@/components/ui/text';
import { View } from '@/components/ui/view';
import { useColor } from '@/hooks/useColor';
import { FontFamily } from '@/theme/fonts';
import { CORNERS } from '@/theme/globals';
import { useAppStyles } from '@/theme/useAppStyles';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView } from 'react-native';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 24 }}>
      <Text variant="caption" style={{ marginBottom: 12 }}>{title}</Text>
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
  const primary = useColor('primary');
  const muted = useColor('muted');
  const text = useColor('text');
  const textMuted = useColor('textMuted');
  const pct = max === 0 ? 0 : Math.max(4, (count / max) * 100);
  return (
    <Pressable onPress={onPress} disabled={count === 0} style={{ marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
        <Text style={{ fontFamily: FontFamily.sansSemi, fontSize: 14, color: active ? primary : textMuted }}>{label}</Text>
        <Text style={{ fontFamily: FontFamily.monoMedium, fontSize: 14, color: active ? primary : text }}>{count}</Text>
      </View>
      <View style={{ height: 8, backgroundColor: muted, borderRadius: CORNERS, overflow: 'hidden' }}>
        <View style={{ height: '100%', width: `${pct}%`, borderRadius: CORNERS, backgroundColor: primary, opacity: active ? 1 : 0.55 }} />
      </View>
    </Pressable>
  );
}

type Filters = { modality: Modality | null; countryIso: string | null; ageBucket: string | null };
const EMPTY_FILTERS: Filters = { modality: null, countryIso: null, ageBucket: null };

export default function DashboardScreen() {
  const router = useRouter();
  const { styles, orange, red, primary } = useAppStyles();
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

  const fullData = useMemo(() => computeDashboard(institutions, equipment, now), [institutions, equipment, now]);

  if (loading) {
    return (
      <Screen centered>
        <Spinner size="lg" />
      </Screen>
    );
  }

  function toggle<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((prev) => ({ ...prev, [key]: prev[key] === value ? null : value }));
  }

  const maxModality = Math.max(1, ...fullData.byModality.map((m) => m.count));
  const maxCountry = Math.max(1, ...fullData.byCountry.map((c) => c.count));
  const maxAge = Math.max(1, ...fullData.byAgeBucket.map((a) => a.count));
  const confidenceBand = data.avgConfidence >= 70 ? 'Alta' : data.avgConfidence >= 40 ? 'Media' : 'Baja';
  const confidenceColor = data.avgConfidence >= 70 ? primary : data.avgConfidence >= 40 ? orange : red;
  const hasActiveFilters = Boolean(filters.modality || filters.countryIso || filters.ageBucket);

  return (
    <Screen>
      <ScrollView contentContainerStyle={[styles.pad, styles.padBottom]}>
        <ScreenHeader
          title="Panel de Control"
          subtitle={`${data.totalEquipment} equipos${hasActiveFilters ? ' (filtrado)' : ' en total'}`}
          right={
            hasActiveFilters ? (
              <Pressable onPress={() => setFilters(EMPTY_FILTERS)} style={styles.ghostChip}>
                <Icon name="close" size="sm" color={red} />
                <Text style={[styles.ghostChipText, { color: red }]}>Limpiar</Text>
              </Pressable>
            ) : null
          }
        />

        {hasActiveFilters && (
          <View style={[styles.wrap, { marginBottom: 16 }]}>
            {filters.modality && (
              <FilterChip selected label={`${filters.modality} ×`} onPress={() => toggle('modality', filters.modality)} />
            )}
            {filters.countryIso && (
              <FilterChip selected label={`${filters.countryIso} ×`} onPress={() => toggle('countryIso', filters.countryIso)} />
            )}
            {filters.ageBucket && (
              <FilterChip selected label={`${filters.ageBucket} ×`} onPress={() => toggle('ageBucket', filters.ageBucket)} />
            )}
          </View>
        )}

        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 24 }}>
          <Card style={{ flex: 1 }}>
            <Text variant="caption">Confianza promedio</Text>
            <Text style={[styles.monoLg, { color: confidenceColor, marginTop: 6 }]}>{data.avgConfidence}</Text>
            <Text variant="caption">{confidenceBand}</Text>
          </Card>
          <Card style={{ flex: 1 }}>
            <Text variant="caption">Sin actualización</Text>
            <Text style={[styles.monoLg, { color: orange, marginTop: 6 }]}>{data.staleClients.length}</Text>
            <Text variant="caption">clientes</Text>
          </Card>
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
          {fullData.byCountry.length === 0 && <EmptyState>Sin datos de país.</EmptyState>}
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
            <EmptyState>Ningún equipo alcanzó la antigüedad recomendada para renovación.</EmptyState>
          )}
          {data.renewalOpportunities.map((r, i) => (
            <Pressable key={i} onPress={() => router.push(`/clients/${r.institutionId}`)} style={styles.listRow}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text variant="subtitle">{r.institutionName}</Text>
                <Text variant="caption" style={{ marginTop: 4 }}>
                  {r.modality} · ~{r.ageYears} años (se recomienda renovar desde los {r.thresholdYears})
                </Text>
              </View>
              <View style={[styles.ghostChip, { gap: 4 }]}>
                <Icon name="alert" size="xs" color={orange} />
                <Text style={[styles.ghostChipText, { color: orange }]}>{r.confidence}</Text>
              </View>
            </Pressable>
          ))}
        </Section>

        <Section title={`Clientes con tecnología antigua (${data.agingClients.length})`}>
          {data.agingClients.length === 0 && <EmptyState>Ninguno.</EmptyState>}
          {data.agingClients.slice(0, 8).map((c, i) => (
            <Pressable key={i} onPress={() => router.push(`/clients/${c.institutionId}`)} style={styles.listRow}>
              <View>
                <Text variant="subtitle">{c.institutionName}</Text>
                <Text variant="caption" style={{ marginTop: 4 }}>{c.modality}, ~{c.ageYears} años</Text>
              </View>
            </Pressable>
          ))}
        </Section>

        <Section title={`Clientes con información incompleta (${data.incompleteClients.length})`}>
          {data.incompleteClients.length === 0 && <EmptyState>Ninguno.</EmptyState>}
          {data.incompleteClients.slice(0, 8).map((c) => (
            <Pressable key={c.institutionId} onPress={() => router.push(`/clients/${c.institutionId}`)} style={styles.listRow}>
              <View>
                <Text variant="subtitle">{c.institutionName}</Text>
                <Text variant="caption" style={{ marginTop: 4 }}>{c.incompleteCount} campo(s) sin dato</Text>
              </View>
            </Pressable>
          ))}
        </Section>

        <Section title="Sitios actualizados recientemente">
          {data.recentlyUpdated.length === 0 && <EmptyState>Sin observaciones aún.</EmptyState>}
          {data.recentlyUpdated.map((c) => (
            <Pressable key={c.institutionId} onPress={() => router.push(`/clients/${c.institutionId}`)} style={styles.listRow}>
              <View>
                <Text variant="subtitle">{c.institutionName}</Text>
                <Text variant="caption" style={{ marginTop: 4 }}>
                  {new Date(c.lastVerifiedAt).toLocaleDateString('es', { year: 'numeric', month: 'short', day: 'numeric' })}
                </Text>
              </View>
            </Pressable>
          ))}
        </Section>

        {data.staleClients.length > 0 && (
          <Section title={`Clientes desactualizados (${data.staleClients.length})`}>
            {data.staleClients.map((c) => (
              <Pressable
                key={c.institutionId}
                onPress={() => router.push(`/clients/${c.institutionId}`)}
                style={[styles.listRow, { borderLeftWidth: 3, borderLeftColor: red }]}
              >
                <View>
                  <Text variant="subtitle">{c.institutionName}</Text>
                  <Text variant="caption" style={{ marginTop: 4 }}>Sin verificar hace {c.daysSinceVerified} días</Text>
                </View>
              </Pressable>
            ))}
          </Section>
        )}
      </ScrollView>
    </Screen>
  );
}
