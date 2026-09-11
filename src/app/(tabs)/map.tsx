import { listInstitutions, type InstitutionRow } from '@/db/repos/institutions';
import { listAllEquipment } from '@/db/repos/equipment';
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
import { useAppStyles } from '@/theme/useAppStyles';
import geoData from '../../../assets/geo/latam.simplified.json';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Dimensions, Pressable, ScrollView } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { geoMercator, geoPath } from 'd3-geo';
import type { FeatureCollection, Geometry } from 'geojson';

const geoJson = geoData as unknown as FeatureCollection<Geometry, { iso: string }>;

const MAP_WIDTH = Dimensions.get('window').width - 32;
const MAP_HEIGHT = 320;

function colorForCount(count: number, max: number, empty: string, steps: string[]): string {
  if (count === 0) return empty;
  const intensity = max === 0 ? 0 : count / max;
  if (intensity > 0.75) return steps[3];
  if (intensity > 0.5) return steps[2];
  if (intensity > 0.25) return steps[1];
  return steps[0];
}

export default function MapScreen() {
  const router = useRouter();
  const { styles, muted, primary } = useAppStyles();
  const emptyFill = useColor('muted');
  const border = useColor('border');
  const [loading, setLoading] = useState(true);
  const [institutions, setInstitutions] = useState<InstitutionRow[]>([]);
  const [equipmentCountByCountry, setEquipmentCountByCountry] = useState<Record<string, number>>({});
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [inst, equipment] = await Promise.all([listInstitutions(), listAllEquipment()]);
    setInstitutions(inst);

    const instById = new Map(inst.map((i) => [i.id, i]));
    const totals: Record<string, number> = {};
    for (const eq of equipment) {
      const country = instById.get(eq.institutionId)?.countryIso;
      if (!country) continue;
      totals[country] = (totals[country] ?? 0) + (eq.count ?? 1);
    }
    setEquipmentCountByCountry(totals);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const projection = useMemo(
    () => geoMercator().fitSize([MAP_WIDTH, MAP_HEIGHT], geoJson),
    []
  );
  const pathGenerator = useMemo(() => geoPath(projection), [projection]);
  const maxCount = Math.max(1, ...Object.values(equipmentCountByCountry));

  const institutionsByCountry = useMemo(() => {
    const map = new Map<string, InstitutionRow[]>();
    for (const inst of institutions) {
      if (!inst.countryIso) continue;
      const list = map.get(inst.countryIso) ?? [];
      list.push(inst);
      map.set(inst.countryIso, list);
    }
    return map;
  }, [institutions]);

  const citiesInSelected = useMemo(() => {
    if (!selectedCountry) return [];
    const byCity = new Map<string, InstitutionRow[]>();
    for (const inst of institutionsByCountry.get(selectedCountry) ?? []) {
      const key = inst.city ?? 'Ciudad desconocida';
      const list = byCity.get(key) ?? [];
      list.push(inst);
      byCity.set(key, list);
    }
    return Array.from(byCity.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [selectedCountry, institutionsByCountry]);

  if (loading) {
    return (
      <Screen centered>
        <Spinner size="lg" />
      </Screen>
    );
  }

  const pineSteps = ['#A8C9C4', '#6FA39B', '#3D7A73', '#1F5C56'];

  return (
    <Screen>
      <ScrollView contentContainerStyle={[styles.pad, styles.padBottom]}>
        <ScreenHeader title="Mapa de cobertura" subtitle="Selecciona un país para ver detalles." />

        <Card style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
          <Svg width={MAP_WIDTH} height={MAP_HEIGHT}>
            {geoJson.features.map((feature) => {
              const iso = feature.properties.iso;
              const count = equipmentCountByCountry[iso] ?? 0;
              const d = pathGenerator(feature as any) ?? '';
              return (
                <Path
                  key={iso}
                  d={d}
                  fill={colorForCount(count, maxCount, emptyFill, pineSteps)}
                  stroke={selectedCountry === iso ? primary : border}
                  strokeWidth={selectedCountry === iso ? 2 : 1}
                  onPress={() => setSelectedCountry((prev) => (prev === iso ? null : iso))}
                />
              );
            })}
          </Svg>
        </Card>

        <View style={[styles.wrap, { marginBottom: 24 }]}>
          {Object.entries(equipmentCountByCountry)
            .sort((a, b) => b[1] - a[1])
            .map(([iso, count]) => (
              <FilterChip
                key={iso}
                selected={selectedCountry === iso}
                label={`${iso}: ${count}`}
                onPress={() => setSelectedCountry((prev) => (prev === iso ? null : iso))}
              />
            ))}
        </View>

        {selectedCountry ? (
          <View>
            <Text variant="caption" style={{ marginBottom: 12 }}>
              {selectedCountry} — {citiesInSelected.reduce((sum, [, list]) => sum + list.length, 0)} clientes
            </Text>
            {citiesInSelected.map(([city, insts]) => (
              <View key={city} style={{ marginBottom: 16 }}>
                <Text variant="subtitle" style={{ marginBottom: 8 }}>{city}</Text>
                {insts.map((inst) => (
                  <Pressable key={inst.id} onPress={() => router.push(`/clients/${inst.id}`)} style={styles.listRow}>
                    <Text variant="subtitle" style={{ flex: 1 }}>{inst.name}</Text>
                    <Icon name="chevron-right" size="sm" color={muted} />
                  </Pressable>
                ))}
              </View>
            ))}
            {citiesInSelected.length === 0 && <EmptyState>Sin clientes registrados en este país.</EmptyState>}
          </View>
        ) : (
          <Text variant="caption">Selecciona un país en el mapa o en la lista de arriba.</Text>
        )}
      </ScrollView>
    </Screen>
  );
}
