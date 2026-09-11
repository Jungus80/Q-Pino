import { parseNaturalLanguageQuery } from '@/ai/queryParser';
import { summarizeQueryResult } from '@/ai/querySummary';
import { runStructuralQuery } from '@/db/repos/query';
import { listInstitutions } from '@/db/repos/institutions';
import {
  buildDeterministicAnswer,
  computeQueryAnswer,
  formatAnswerForSummary,
  summaryIsGrounded,
  type QueryAnswer,
} from '@/core/query/answer';
import type { QueryDsl } from '@/core/query/dsl';
import { describeQueryDsl, formatMetricValue, GROUP_BY_LABEL, METRIC_LABEL, plural } from '@/core/labels';
import { countryLabel } from '@/core/normalize/geo';
import { Icon } from '@/components/Icon';
import { TabScreenSafeAreaEdges } from '@/constants/theme';
import { useLlmPreload } from '@/hooks/use-llm-preload';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const EXAMPLES = [
  'Clientes en Brasil con resonadores de más de 7 años',
  'Equipos por modalidad',
  'Antigüedad promedio de los tomógrafos',
  'Equipos para renovar',
  'Top 3 clientes con más equipos',
  'Clientes desactualizados',
];

const ARRAY_KEYS = new Set<keyof QueryDsl>(['region', 'country', 'city', 'modality', 'manufacturer', 'institution']);

type Result = {
  question: string;
  dsl: QueryDsl;
  notes: string[];
  answer: QueryAnswer;
  /** Templated answer first; replaced by the LLM's phrasing only if it passes summaryIsGrounded. */
  text: string;
  /** Set when this result comes from removing a chip, not from a brand-new question. */
  refinementNote: string | null;
};

export default function QueryScreen() {
  const router = useRouter();
  const { llmPreloading } = useLlmPreload();
  const [question, setQuestion] = useState('');
  const [phase, setPhase] = useState<'idle' | 'parsing' | 'computing'>('idle');
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notUnderstood, setNotUnderstood] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  // Android: KeyboardAvoidingView's native resize doesn't take effect inside this
  // NativeTabs-hosted screen, so we track the keyboard height ourselves and apply
  // it as padding — see the matching note in (tabs)/index.tsx.
  const [androidKeyboardHeight, setAndroidKeyboardHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (e) => setAndroidKeyboardHeight(e?.endCoordinates?.height ?? 0));
    const hideSub = Keyboard.addListener(hideEvent, () => setAndroidKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Every question or chip edit bumps this; async work from an older request checks it
  // and drops its result instead of overwriting a newer answer.
  const requestId = useRef(0);
  // Parse and summary share one resident model, so LLM calls are chained rather than run
  // concurrently: a new question waits for an in-flight summary instead of racing it.
  const llmQueue = useRef<Promise<unknown>>(Promise.resolve());
  function serialLlm<T>(fn: () => Promise<T>): Promise<T> {
    const run = llmQueue.current.then(fn, fn);
    llmQueue.current = run.catch(() => {});
    return run;
  }

  // The answer's numbers are computed deterministically and shown immediately; the LLM
  // only rephrases them afterwards, and its text is used only if every number in it
  // matches the computed data. A slow or failed summary costs polish, never correctness.
  async function showAnswer(
    dsl: QueryDsl,
    questionText: string,
    notes: string[],
    id: number,
    refinementNote: string | null = null
  ) {
    const rows = await runStructuralQuery(dsl);
    if (id !== requestId.current) return;
    const answer = computeQueryAnswer(rows, dsl);
    setResult({ question: questionText, dsl, notes, answer, text: buildDeterministicAnswer(answer, dsl), refinementNote });
    setPhase('idle');

    setSummarizing(true);
    try {
      const dataBlock = formatAnswerForSummary(answer, dsl, notes);
      const summary = await serialLlm(() => summarizeQueryResult(questionText, dataBlock));
      if (id !== requestId.current) return;
      if (summaryIsGrounded(summary, dataBlock, questionText)) {
        setResult((prev) => (prev && prev.answer === answer ? { ...prev, text: summary } : prev));
      } else {
        console.warn('[consultas] summary rejected, keeping templated answer:', summary);
      }
    } catch (e) {
      console.warn('[consultas] summary failed, keeping templated answer:', e);
    } finally {
      if (id === requestId.current) setSummarizing(false);
    }
  }

  async function handleAsk(text: string = question) {
    const questionText = text.trim();
    if (!questionText || phase !== 'idle' || summarizing) return;
    const id = ++requestId.current;
    // Clear the previous answer the instant a new question is submitted, so stale
    // results never sit under the spinner looking like the new question's answer.
    setPhase('parsing');
    setError(null);
    setProgress(null);
    setResult(null);
    setNotUnderstood(null);
    setSummarizing(false);
    try {
      const institutions = (await listInstitutions()).map((i) => i.name);
      const parsed = await serialLlm(() =>
        parseNaturalLanguageQuery(questionText, {
          institutions,
          onProgress: (p) => {
            if (id === requestId.current) setProgress(p);
          },
        })
      );
      if (id !== requestId.current) return;
      if (!parsed.understood) {
        setNotUnderstood(questionText);
        setPhase('idle');
        setQuestion('');
        return;
      }
      setPhase('computing');
      await showAnswer(parsed.dsl, questionText, parsed.notes, id);
      if (id === requestId.current) setQuestion('');
    } catch (e) {
      if (id !== requestId.current) return;
      console.warn('[consultas] query failed:', e);
      setError('No pude responder esa pregunta. Probá reformularla o usá uno de los ejemplos.');
      setPhase('idle');
    } finally {
      if (id === requestId.current) setProgress(null);
    }
  }

  async function removeChip(key: keyof QueryDsl) {
    if (!result || phase !== 'idle' || summarizing) return;
    const removedLabel = describeQueryDsl(result.dsl).find((c) => c.key === key)?.label ?? null;
    const next: QueryDsl = { ...result.dsl };
    if (ARRAY_KEYS.has(key)) (next as Record<string, unknown>)[key] = [];
    else if (key === 'metric') next.metric = 'count';
    else if (key === 'groupBy') {
      delete next.groupBy;
      delete next.limit;
      delete next.order;
    } else delete (next as Record<string, unknown>)[key];

    const id = ++requestId.current;
    setPhase('computing');
    setError(null);
    setResult(null);
    setSummarizing(false);
    try {
      // Refining re-answers the question that produced this result (not whatever is in
      // the input box). Notes are dropped: they described the original interpretation.
      await showAnswer(next, result.question, [], id, removedLabel ? `Sin "${removedLabel}"` : null);
    } catch (e) {
      if (id !== requestId.current) return;
      console.warn('[consultas] refine failed:', e);
      setError('No se pudo recalcular el resultado.');
      setPhase('idle');
    }
  }

  const busy = phase !== 'idle';
  const chips = result ? describeQueryDsl(result.dsl) : [];
  const answer = result?.answer;
  const canClear = !busy && (result || notUnderstood || error || question);

  function clearAll() {
    if (busy) return;
    requestId.current += 1;
    setQuestion('');
    setResult(null);
    setNotUnderstood(null);
    setError(null);
    setSummarizing(false);
  }

  function renderExamples() {
    return EXAMPLES.map((ex) => (
      <Pressable
        key={ex}
        onPress={() => {
          setQuestion(ex);
          handleAsk(ex);
        }}
        className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-2">
        <Text className="text-blue-700 text-sm font-medium">{ex}</Text>
      </Pressable>
    ));
  }

  const askDisabled = busy || summarizing || !question.trim();

  return (
    <SafeAreaView className="flex-1 bg-white" edges={TabScreenSafeAreaEdges}>
      <KeyboardAvoidingView
        className="flex-1"
        // Android: see the matching note in (tabs)/index.tsx — native resize doesn't
        // take effect here, so we apply the measured keyboard height as padding below.
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        // NativeTabs bar sits below this screen — offset so the footer clears it.
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        style={{ paddingBottom: androidKeyboardHeight }}>
        <View className="flex-row items-center justify-between px-4 pt-4 pb-2">
          <View className="flex-1 pr-2">
            <Text className="text-gray-900 text-2xl font-bold">Búsqueda Avanzada</Text>
            <Text className="text-gray-500 text-sm mt-1">Preguntá en lenguaje natural sobre el parque instalado.</Text>
          </View>
          {canClear && (
            <Pressable onPress={clearAll} className="flex-row items-center gap-1 bg-gray-100 rounded-lg px-3 py-2">
              <Icon name="plus" size="xs" color="#374151" />
              <Text className="text-gray-700 text-xs font-semibold">Nueva consulta</Text>
            </Pressable>
          )}
        </View>

        {llmPreloading && (
          <View className="flex-row items-center gap-2 px-4 pb-2">
            <ActivityIndicator color="#0066CC" size="small" />
            <Text className="text-gray-500 text-xs">Preparando IA para respuestas más rápidas…</Text>
          </View>
        )}

        <ScrollView className="flex-1" contentContainerClassName="px-4 pb-4" keyboardShouldPersistTaps="handled">
          {!result && !notUnderstood && !busy && (
            <View className="mb-6">
              <Text className="text-gray-700 text-sm font-bold uppercase mb-3">Sugerencias</Text>
              {renderExamples()}
            </View>
          )}

          {busy && (
            <View className="items-center py-12">
              <ActivityIndicator color="#0066CC" size="large" />
              <Text className="text-gray-900 text-base font-semibold mt-4">
                {phase === 'computing' ? 'Calculando resultado' : 'Analizando información'}
              </Text>
              <Text className="text-gray-600 text-sm mt-2">
                {phase === 'computing' ? 'Procesando datos' : 'Interpretando tu pregunta'}
              </Text>
            </View>
          )}

          {error && (
            <View className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 flex-row items-start gap-2">
              <Icon name="error" size="sm" color="#DC2626" />
              <Text className="text-red-700 text-sm font-medium flex-1">{error}</Text>
            </View>
          )}

          {notUnderstood && !busy && (
            <>
              <View className="bg-gray-100 rounded-xl rounded-br-sm p-3 mb-3 self-end">
                <Text className="text-gray-700 text-sm">{notUnderstood}</Text>
              </View>
              <View className="bg-gray-50 border border-gray-200 rounded-xl rounded-tl-sm p-4 mb-4">
                <Text className="text-gray-800 text-base leading-6">
                  No entendí la pregunta. Puedo responder sobre equipos y clientes del parque: modalidades, fabricantes, países, ciudades,
                  antigüedad, confianza, renovación y datos incompletos o desactualizados. Probá con alguno de estos:
                </Text>
              </View>
              {renderExamples()}
            </>
          )}

          {result && answer && !busy && (
            <>
              <View className="bg-gray-100 rounded-xl rounded-br-sm p-3 mb-3 self-end">
                <Text className="text-gray-700 text-sm">{result.question}</Text>
                {result.refinementNote && (
                  <Text className="text-gray-500 text-xs mt-1 italic">Ajustado: {result.refinementNote}</Text>
                )}
              </View>

              <View className="bg-blue-600 rounded-xl rounded-tl-sm p-4 mb-3">
                <Text className="text-white text-base leading-6">{result.text}</Text>
                {summarizing && (
                  <View className="flex-row items-center gap-2 mt-2">
                    <ActivityIndicator color="#fff" size="small" />
                    <Text className="text-blue-100 text-xs">Redactando respuesta…</Text>
                  </View>
                )}
              </View>

              {result.notes.map((note) => (
                <View key={note} className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-2 flex-row items-start gap-2">
                  <Icon name="alert" size="sm" color="#D97706" />
                  <Text className="text-amber-800 text-sm flex-1">{note}</Text>
                </View>
              ))}

              <Text className="text-gray-700 text-sm font-bold uppercase mb-3 mt-3">Filtros Aplicados</Text>
              <View className="flex-row flex-wrap gap-2 mb-6">
                {chips.length === 0 && <Text className="text-gray-500 text-sm">Sin filtros: todo el parque.</Text>}
                {chips.map(({ key, label }) => (
                  <Pressable key={key} onPress={() => removeChip(key)} className="bg-blue-100 rounded-full px-3 py-1.5">
                    <Text className="text-blue-700 text-xs font-semibold">{label} ×</Text>
                  </Pressable>
                ))}
              </View>

              {answer.groups && result.dsl.groupBy ? (
                <View className="mb-6">
                  <Text className="text-gray-700 text-sm font-bold uppercase mb-3">
                    {METRIC_LABEL[result.dsl.metric]} por {GROUP_BY_LABEL[result.dsl.groupBy].singular} (
                    {answer.groups.length < answer.groupsTotal ? `${answer.groups.length} de ${answer.groupsTotal}` : answer.groupsTotal})
                  </Text>
                  {answer.groups.map((g) => {
                    const isClient = result.dsl.groupBy === 'institution';
                    return (
                      <Pressable
                        key={g.key}
                        disabled={!isClient}
                        onPress={() => router.push(`/clients/${g.key}`)}
                        className="bg-white border border-gray-200 rounded-lg p-3 mb-2 flex-row justify-between items-center">
                        <View className="flex-1 pr-3">
                          <Text className="text-gray-900 text-sm font-semibold">{g.label}</Text>
                          {result.dsl.metric !== 'count' && (
                            <Text className="text-gray-500 text-xs mt-0.5">{plural(g.equipmentCount, 'equipo', 'equipos')}</Text>
                          )}
                        </View>
                        <View className="bg-blue-100 rounded-lg px-2.5 py-1">
                          <Text className="text-blue-700 text-sm font-bold">{formatMetricValue(result.dsl.metric, g.value)}</Text>
                        </View>
                      </Pressable>
                    );
                  })}
                  {answer.groups.length === 0 && (
                    <View className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                      <Text className="text-gray-600 text-sm">Sin resultados.</Text>
                    </View>
                  )}
                </View>
              ) : (
                <View className="mb-6">
                  <Text className="text-gray-700 text-sm font-bold uppercase mb-1">
                    {plural(answer.equipmentTotal, 'equipo', 'equipos')} en {plural(answer.clientTotal, 'cliente', 'clientes')}
                  </Text>
                  {(result.dsl.metric === 'avgAge' || result.dsl.metric === 'confidence') && (
                    <Text className="text-gray-600 text-sm mb-2">
                      {METRIC_LABEL[result.dsl.metric]}: {formatMetricValue(result.dsl.metric, answer.overall)}
                    </Text>
                  )}
                  <View className="mt-2">
                    {answer.institutions.map((inst) => (
                      <Pressable
                        key={inst.id}
                        onPress={() => router.push(`/clients/${inst.id}`)}
                        className="bg-white border border-gray-200 rounded-lg p-3 mb-2 flex-row justify-between items-center">
                        <View className="flex-1 pr-3">
                          <Text className="text-gray-900 text-sm font-semibold">{inst.name}</Text>
                          <Text className="text-gray-600 text-xs mt-1">
                            {inst.city ?? '—'}, {inst.countryIso ? countryLabel(inst.countryIso) : '—'}
                          </Text>
                        </View>
                        <Text className="text-gray-500 text-xs">{plural(inst.equipmentCount, 'equipo', 'equipos')}</Text>
                      </Pressable>
                    ))}
                  </View>
                  {answer.clientTotal === 0 && (
                    <View className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                      <Text className="text-gray-600 text-sm">Sin resultados.</Text>
                    </View>
                  )}
                </View>
              )}
            </>
          )}
        </ScrollView>

        <View className="border-t border-gray-200 bg-white px-3 pt-3" style={{ paddingBottom: 12 }}>
          {(phase === 'parsing' || phase === 'computing' || summarizing) && (
            <Text className="text-gray-500 text-xs mb-2">
              {phase === 'parsing' ? 'Interpretando tu pregunta…' : phase === 'computing' ? 'Procesando datos…' : 'Redactando respuesta…'}
            </Text>
          )}
          <View className="flex-row items-end gap-2">
            <TextInput
              value={question}
              onChangeText={setQuestion}
              placeholder="Preguntá algo, ej: equipos por modalidad"
              placeholderTextColor="#9CA3AF"
              className="flex-1 text-gray-900 text-base bg-gray-100 rounded-2xl px-4 py-3"
              multiline
              editable={!busy && !summarizing}
            />
            <Pressable
              onPress={() => handleAsk()}
              disabled={askDisabled}
              className="w-11 h-11 rounded-full items-center justify-center"
              style={{ backgroundColor: askDisabled ? '#E5E7EB' : '#0066CC' }}>
              {busy ? (
                <ActivityIndicator color={askDisabled ? '#9CA3AF' : '#fff'} size="small" />
              ) : (
                <Icon name="search" size="md" color={askDisabled ? '#9CA3AF' : '#fff'} />
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
