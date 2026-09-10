import { listInstitutions, type InstitutionRow } from '@/db/repos/institutions';
import { listAllEquipment } from '@/db/repos/equipment';
import geoData from '../../../assets/geo/latam.simplified.json';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Dimensions, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { geoMercator, geoPath } from 'd3-geo';
import type { FeatureCollection, Geometry } from 'geojson';

const geoJson = geoData as unknown as FeatureCollection<Geometry, { iso: string }>;

const MAP_WIDTH = Dimensions.get('window').width - 32;
const MAP_HEIGHT = 320;

// Blue intensity scale for equipment density — deliberately coarse (5 steps) rather than
// a continuous gradient, since with a handful of demo clients the exact shade doesn't
// carry more signal than "none / a little / a lot" does.
function colorForCount(count: number, max: number): string {
  if (count === 0) return '#27272a'; // neutral-800, no data
  const intensity = max === 0 ? 0 : count / max;
  if (intensity > 0.75) return '#1d4ed8';
  if (intensity > 0.5) return '#2563eb';
  if (intensity > 0.25) return '#3b82f6';
  return '#60a5fa';
}

export default function MapScreen() {
  const router = useRouter();
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
      <SafeAreaView className="flex-1 bg-neutral-950 items-center justify-center">
        <ActivityIndicator color="#fff" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-neutral-950">
      <ScrollView contentContainerClassName="p-4 pb-12">
        <Text className="text-white text-2xl font-bold mb-1">Mapa</Text>
        <Text className="text-neutral-400 mb-4">Toca un país para ver sus ciudades y clientes.</Text>

        <View className="bg-neutral-900 rounded-xl overflow-hidden mb-4">
          <Svg width={MAP_WIDTH} height={MAP_HEIGHT}>
            {geoJson.features.map((feature) => {
              const iso = feature.properties.iso;
              const count = equipmentCountByCountry[iso] ?? 0;
              const d = pathGenerator(feature as any) ?? '';
              return (
                <Path
                  key={iso}
                  d={d}
                  fill={colorForCount(count, maxCount)}
                  stroke={selectedCountry === iso ? '#93c5fd' : '#0a0a0a'}
                  strokeWidth={selectedCountry === iso ? 1.5 : 0.5}
                  onPress={() => setSelectedCountry((prev) => (prev === iso ? null : iso))}
                />
              );
            })}
          </Svg>
        </View>

        <View className="flex-row flex-wrap gap-2 mb-5">
          {Object.entries(equipmentCountByCountry)
            .sort((a, b) => b[1] - a[1])
            .map(([iso, count]) => (
              <Pressable
                key={iso}
                onPress={() => setSelectedCountry((prev) => (prev === iso ? null : iso))}
                className={`rounded-full px-3 py-1 ${selectedCountry === iso ? 'bg-blue-600' : 'bg-neutral-900'}`}>
                <Text className="text-white text-xs">
                  {iso}: <Text className="font-semibold">{count}</Text>
                </Text>
              </Pressable>
            ))}
        </View>

        {selectedCountry ? (
          <View>
            <Text className="text-neutral-500 text-xs uppercase mb-2">
              {selectedCountry} — {citiesInSelected.reduce((sum, [, list]) => sum + list.length, 0)} clientes
            </Text>
            {citiesInSelected.map(([city, insts]) => (
              <View key={city} className="mb-3">
                <Text className="text-neutral-400 text-sm font-medium mb-1">{city}</Text>
                {insts.map((inst) => (
                  <Pressable
                    key={inst.id}
                    onPress={() => router.push(`/clients/${inst.id}`)}
                    className="bg-neutral-900 rounded-lg p-3 mb-1.5">
                    <Text className="text-white text-sm">{inst.name}</Text>
                  </Pressable>
                ))}
              </View>
            ))}
            {citiesInSelected.length === 0 && (
              <Text className="text-neutral-600 text-sm">Sin clientes registrados en este país.</Text>
            )}
          </View>
        ) : (
          <Text className="text-neutral-600 text-sm">Selecciona un país en el mapa o en la lista de arriba.</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
