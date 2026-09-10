import { parseNaturalLanguageQuery } from '@/ai/queryParser';
import { summarizeQueryResult } from '@/ai/querySummary';
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
  const [askedQuestion, setAskedQuestion] = useState('');
  const [rows, setRows] = useState<QueryEquipmentRow[]>([]);
  const [groups, setGroups] = useState<QueryGroup[] | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [summarizing, setSummarizing] = useState(false);

  // The answer numbers/names are always computed deterministically first (never by the
  // LLM) — summarizeQueryResult only phrases them in prose afterward, so a failure or
  // slow response there is a UX nicety lost, not a correctness risk: the chips/table
  // below stay accurate either way.
  async function runQuery(nextDsl: QueryDsl, questionText: string) {
    const structural = await runStructuralQuery(nextDsl);
    const filtered = applyComputedFilters(structural, nextDsl);
    const computedGroups = aggregateQuery(filtered, nextDsl);
    setRows(filtered);
    setGroups(computedGroups);
    setSummary(null);
    setSummarizing(true);
    try {
      const text = await summarizeQueryResult(questionText, filtered, computedGroups);
      setSummary(text);
    } catch {
      // silently skip — the structured result below still answers the question
    } finally {
      setSummarizing(false);
    }
  }

  async function handleAsk() {
    const questionText = question.trim();
    if (!questionText) return;
    setLoading(true);
    setError(null);
    setProgress(null);
    // Clear the previous question's everything the instant a new one is submitted —
    // otherwise the old answer/chips/table stay fully visible under the loading
    // indicator for the several seconds the model takes, and it reads as if the new
    // question already got answered with stale data.
    setDsl(null);
    setAskedQuestion('');
    setRows([]);
    setGroups(null);
    setSummary(null);
    try {
      const parsedDsl = await parseNaturalLanguageQuery(questionText, (p) => setProgress(p));
      setDsl(parsedDsl);
      setAskedQuestion(questionText);
      await runQuery(parsedDsl, questionText);
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
    // Refining a chip re-runs against the question that produced this result, not
    // whatever is currently typed in the input box — the user may have already started
    // typing their next, unrelated question without submitting it yet.
    runQuery(next, askedQuestion);
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
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView contentContainerClassName="p-4 pb-12" keyboardShouldPersistTaps="handled">
        <Text className="text-gray-900 text-2xl font-bold mb-1">Consultas</Text>
        <Text className="text-gray-500 text-sm mb-4">Pregunta sobre el parque instalado en lenguaje natural.</Text>

        <View className="bg-white border-2 border-gray-200 rounded-xl p-4 mb-4">
          <Text className="text-gray-700 text-sm font-semibold mb-3">Tu pregunta</Text>
          <TextInput
            value={question}
            onChangeText={setQuestion}
            placeholder="Ej: clientes en Brasil con resonadores de más de 7 años"
            placeholderTextColor="#9CA3AF"
            className="text-gray-900 text-base mb-4 border border-gray-200 rounded-lg p-3"
            multiline
          />
          <Pressable
            onPress={handleAsk}
            disabled={loading || !question.trim()}
            className={`rounded-lg py-3 items-center ${loading || !question.trim() ? 'bg-gray-300' : 'bg-blue-600'}`}>
            <Text className={`font-semibold ${loading || !question.trim() ? 'text-gray-500' : 'text-white'}`}>
              {loading ? (progress !== null ? `Cargando… ${progress}%` : 'Pensando…') : '🔍 Preguntar'}
            </Text>
          </Pressable>
        </View>

        {!dsl && !loading && (
          <View className="mb-6">
            <Text className="text-gray-700 text-sm font-bold uppercase mb-3">Ejemplos</Text>
            {EXAMPLES.map((ex) => (
              <Pressable key={ex} onPress={() => setQuestion(ex)} className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-2">
                <Text className="text-blue-700 text-sm font-medium">{ex}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {loading && (
          <View className="items-center py-12">
            <ActivityIndicator color="#0066CC" size="large" />
            <Text className="text-gray-500 text-sm mt-3">
              {progress !== null ? `Cargando modelo… ${progress}%` : 'Interpretando tu pregunta…'}
            </Text>
          </View>
        )}

        {error && (
          <View className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
            <Text className="text-red-700 text-sm font-medium">{error}</Text>
          </View>
        )}

        {dsl && !loading && (
          <>
            <View className="bg-gray-100 rounded-xl rounded-br-sm p-3 mb-3 self-end">
              <Text className="text-gray-700 text-sm">{askedQuestion}</Text>
            </View>

            {(summary || summarizing) && (
              <View className="bg-blue-600 rounded-xl rounded-tl-sm p-4 mb-4">
                {summarizing ? (
                  <View className="flex-row items-center gap-2">
                    <ActivityIndicator color="#fff" size="small" />
                    <Text className="text-white text-sm">Redactando respuesta…</Text>
                  </View>
                ) : (
                  <Text className="text-white text-base leading-6">{summary}</Text>
                )}
              </View>
            )}

            <Text className="text-gray-700 text-sm font-bold uppercase mb-3">Filtro Interpretado</Text>
            <View className="flex-row flex-wrap gap-2 mb-6">
              {chipLabels
                .filter(([, label]) => label !== '')
                .map(([key, label]) => (
                  <Pressable key={key} onPress={() => clearFilter(key)} className="bg-blue-100 rounded-full px-3 py-1.5">
                    <Text className="text-blue-700 text-xs font-semibold">{label} ×</Text>
                  </Pressable>
                ))}
            </View>

            {groups ? (
              <View className="mb-6">
                <Text className="text-gray-700 text-sm font-bold uppercase mb-3">Resultado ({groups.length} grupos)</Text>
                {groups.map((g) => (
                  <View key={g.key} className="bg-white border border-gray-200 rounded-lg p-3 mb-2 flex-row justify-between items-center">
                    <Text className="text-gray-900 text-sm font-semibold">{g.key}</Text>
                    <View className="bg-blue-100 rounded-lg px-2.5 py-1">
                      <Text className="text-blue-700 text-sm font-bold">{g.value}</Text>
                    </View>
                  </View>
                ))}
                {groups.length === 0 && (
                  <View className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                    <Text className="text-gray-600 text-sm">Sin resultados.</Text>
                  </View>
                )}
              </View>
            ) : (
              <View className="mb-6">
                <Text className="text-gray-700 text-sm font-bold uppercase mb-3">
                  {rows.length} equipo(s) en {new Set(rows.map((r) => r.institutionId)).size} cliente(s)
                </Text>
                {Array.from(new Map(rows.map((r) => [r.institutionId, r])).values()).map((r) => (
                  <Pressable
                    key={r.institutionId}
                    onPress={() => router.push(`/clients/${r.institutionId}`)}
                    className="bg-white border border-gray-200 rounded-lg p-3 mb-2">
                    <Text className="text-gray-900 text-sm font-semibold">{r.institutionName}</Text>
                    <Text className="text-gray-600 text-xs mt-1">
                      {r.city ?? '—'}, {r.countryIso ?? '—'}
                    </Text>
                  </Pressable>
                ))}
                {rows.length === 0 && (
                  <View className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                    <Text className="text-gray-600 text-sm">Sin resultados.</Text>
                  </View>
                )}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
