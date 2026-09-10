import { parseNaturalLanguageQuery } from '@/ai/queryParser';
import { runStructuralQuery } from '@/db/repos/query';
import { applyComputedFilters, aggregateQuery, type QueryEquipmentRow, type QueryGroup } from '@/core/query/compile';
import type { QueryDsl } from '@/core/query/dsl';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const EXAMPLES = [
  'Clientes en Brasil con resonadores de más de 7 años',
  'Equipos por modalidad',
  'Clientes con información incompleta',
  'Confianza promedio por país',
];

export default function QueryScreen() {
  const router = useRouter();
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dsl, setDsl] = useState<QueryDsl | null>(null);
  const [rows, setRows] = useState<QueryEquipmentRow[]>([]);
  const [groups, setGroups] = useState<QueryGroup[] | null>(null);

  async function runQuery(nextDsl: QueryDsl) {
    const structural = await runStructuralQuery(nextDsl);
    const filtered = applyComputedFilters(structural, nextDsl);
    setRows(filtered);
    setGroups(aggregateQuery(filtered, nextDsl));
  }

  async function handleAsk() {
    if (!question.trim()) return;
    setLoading(true);
    setError(null);
    setProgress(null);
    try {
      const parsedDsl = await parseNaturalLanguageQuery(question.trim(), (p) => setProgress(p));
      setDsl(parsedDsl);
      await runQuery(parsedDsl);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo interpretar la pregunta.');
    } finally {
      setLoading(false);
      setProgress(null);
    }
  }

  function clearFilter(key: keyof QueryDsl) {
    if (!dsl) return;
    const next: QueryDsl = { ...dsl, [key]: Array.isArray(dsl[key]) ? [] : undefined };
    setDsl(next);
    runQuery(next);
  }

  const chipLabels: [keyof QueryDsl, string][] = dsl
    ? [
        ['region', dsl.region.length ? `Región: ${dsl.region.join(', ')}` : ''],
        ['country', dsl.country.length ? `País: ${dsl.country.join(', ')}` : ''],
        ['city', dsl.city.length ? `Ciudad: ${dsl.city.join(', ')}` : ''],
        ['modality', dsl.modality.length ? `Modalidad: ${dsl.modality.join(', ')}` : ''],
        ['manufacturer', dsl.manufacturer.length ? `Fabricante: ${dsl.manufacturer.join(', ')}` : ''],
        ['minAge', dsl.minAge !== undefined ? `Antigüedad ≥ ${dsl.minAge}a` : ''],
        ['maxAge', dsl.maxAge !== undefined ? `Antigüedad ≤ ${dsl.maxAge}a` : ''],
        ['minConfidence', dsl.minConfidence !== undefined ? `Confianza ≥ ${dsl.minConfidence}` : ''],
        ['incomplete', dsl.incomplete ? 'Información incompleta' : ''],
        ['stale', dsl.stale ? 'Desactualizado' : ''],
        ['groupBy', dsl.groupBy ? `Agrupar por ${dsl.groupBy}` : ''],
      ]
    : [];

  return (
    <SafeAreaView className="flex-1 bg-neutral-950">
      <ScrollView contentContainerClassName="p-4 pb-12" keyboardShouldPersistTaps="handled">
        <Text className="text-white text-2xl font-bold mb-1">Consultas</Text>
        <Text className="text-neutral-400 mb-4">Pregunta sobre el parque instalado en lenguaje natural.</Text>

        <View className="bg-neutral-900 rounded-xl p-3 mb-3">
          <TextInput
            value={question}
            onChangeText={setQuestion}
            placeholder="Ej: clientes en Brasil con resonadores de más de 7 años"
            placeholderTextColor="#71717a"
            className="text-white text-base mb-3"
            multiline
          />
          <Pressable
            onPress={handleAsk}
            disabled={loading || !question.trim()}
            className={`rounded-lg py-2.5 items-center ${loading || !question.trim() ? 'bg-neutral-800' : 'bg-blue-600'}`}>
            <Text className="text-white font-semibold">
              {loading ? (progress !== null ? `Cargando modelo… ${progress}%` : 'Pensando…') : 'Preguntar'}
            </Text>
          </Pressable>
        </View>

        {!dsl && !loading && (
          <View className="mb-4">
            <Text className="text-neutral-500 text-xs uppercase mb-2">Ejemplos</Text>
            {EXAMPLES.map((ex) => (
              <Pressable key={ex} onPress={() => setQuestion(ex)} className="py-1.5">
                <Text className="text-blue-400 text-sm">{ex}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {error && <Text className="text-red-400 text-sm mb-4">{error}</Text>}

        {dsl && (
          <>
            <Text className="text-neutral-500 text-xs uppercase mb-2">Filtro interpretado (toca × para quitar)</Text>
            <View className="flex-row flex-wrap gap-2 mb-5">
              {chipLabels
                .filter(([, label]) => label !== '')
                .map(([key, label]) => (
                  <Pressable key={key} onPress={() => clearFilter(key)} className="bg-blue-600 rounded-full px-3 py-1">
                    <Text className="text-white text-xs">{label} ×</Text>
                  </Pressable>
                ))}
            </View>

            {groups ? (
              <View className="mb-5">
                <Text className="text-neutral-500 text-xs uppercase mb-2">Resultado ({groups.length} grupos)</Text>
                {groups.map((g) => (
                  <View key={g.key} className="bg-neutral-900 rounded-lg p-3 mb-1.5 flex-row justify-between">
                    <Text className="text-white text-sm">{g.key}</Text>
                    <Text className="text-blue-400 text-sm font-semibold">{g.value}</Text>
                  </View>
                ))}
                {groups.length === 0 && <Text className="text-neutral-600 text-sm">Sin resultados.</Text>}
              </View>
            ) : (
              <View className="mb-5">
                <Text className="text-neutral-500 text-xs uppercase mb-2">
                  {rows.length} equipo(s) en {new Set(rows.map((r) => r.institutionId)).size} cliente(s)
                </Text>
                {Array.from(new Map(rows.map((r) => [r.institutionId, r])).values()).map((r) => (
                  <Pressable
                    key={r.institutionId}
                    onPress={() => router.push(`/clients/${r.institutionId}`)}
                    className="bg-neutral-900 rounded-lg p-3 mb-1.5">
                    <Text className="text-white text-sm">{r.institutionName}</Text>
                    <Text className="text-neutral-500 text-xs">
                      {r.city ?? '—'}, {r.countryIso ?? '—'}
                    </Text>
                  </Pressable>
                ))}
                {rows.length === 0 && <Text className="text-neutral-600 text-sm">Sin resultados.</Text>}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
