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
import { Screen } from '@/components/kit/Screen';
import { ScreenHeader } from '@/components/kit/ScreenHeader';
import { FilterChip } from '@/components/kit/FilterChip';
import { EmptyState } from '@/components/kit/EmptyState';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Text } from '@/components/ui/text';
import { View } from '@/components/ui/view';
import { useLlmPreload } from '@/hooks/use-llm-preload';
import { useAppStyles } from '@/theme/useAppStyles';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView } from 'react-native';

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
  const { styles, muted, primary, primaryFg, orange, red } = useAppStyles();
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
      <Pressable key={ex} onPress={() => { setQuestion(ex); handleAsk(ex); }} style={[styles.listRow, { marginBottom: 8 }]}>
        <Text variant="body" style={{ color: primary }}>{ex}</Text>
      </Pressable>
    ));
  }

  const askDisabled = busy || summarizing || !question.trim();

  return (
    <Screen>
      <KeyboardAvoidingView
        style={{ flex: 1, paddingBottom: androidKeyboardHeight }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
          <ScreenHeader
            title="Búsqueda avanzada"
            subtitle="Preguntá en lenguaje natural sobre todos los equipos."
            right={
              canClear ? (
                <Pressable onPress={clearAll} style={styles.ghostChip}>
                  <Icon name="plus" size="xs" color={muted} />
                  <Text style={styles.ghostChipText}>Nueva consulta</Text>
                </Pressable>
              ) : null
            }
          />
          {llmPreloading && (
            <Text variant="caption" style={{ marginBottom: 8 }}>Preparando IA para respuestas más rápidas…</Text>
          )}
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }} keyboardShouldPersistTaps="handled">
          {!result && !notUnderstood && !busy && (
            <View style={{ marginBottom: 24 }}>
              <Text variant="caption" style={{ marginBottom: 12 }}>Sugerencias</Text>
              {renderExamples()}
            </View>
          )}

          {busy && (
            <View style={{ alignItems: 'center', paddingVertical: 40 }}>
              <Spinner size="lg" />
              <Text variant="subtitle" style={{ marginTop: 16 }}>
                {phase === 'computing' ? 'Calculando resultado' : 'Analizando información'}
              </Text>
              <Text variant="caption" style={{ marginTop: 8 }}>
                {phase === 'computing' ? 'Procesando datos' : 'Interpretando tu pregunta'}
              </Text>
            </View>
          )}

          {error && (
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
              <Icon name="error" size="sm" color={red} />
              <Text style={[styles.bodySm, { color: red, flex: 1 }]}>{error}</Text>
            </View>
          )}

          {notUnderstood && !busy && (
            <>
              <Card style={{ alignSelf: 'flex-end', marginBottom: 10, maxWidth: '92%' }}>
                <Text variant="body">{notUnderstood}</Text>
              </Card>
              <Card style={{ marginBottom: 12 }}>
                <Text variant="body">
                  No entendí la pregunta. Puedo responder sobre equipos y clientes: modalidades, fabricantes, países, ciudades,
                  antigüedad, confianza, renovación y datos incompletos o desactualizados. Probá con alguno de estos:
                </Text>
              </Card>
              {renderExamples()}
            </>
          )}

          {result && answer && !busy && (
            <>
              <Card style={{ alignSelf: 'flex-end', marginBottom: 10, maxWidth: '92%' }}>
                <Text variant="body">{result.question}</Text>
                {result.refinementNote && (
                  <Text variant="caption" style={{ marginTop: 6, fontStyle: 'italic' }}>Ajustado: {result.refinementNote}</Text>
                )}
              </Card>

              <Card style={{ marginBottom: 12 }}>
                <Text variant="body">{result.text}</Text>
                {summarizing && (
                  <View style={{ marginTop: 10 }}>
                    <Skeleton height={12} />
                    <Text variant="caption" style={{ marginTop: 6 }}>Redactando respuesta…</Text>
                  </View>
                )}
              </Card>

              {result.notes.map((note) => (
                <View key={note} style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                  <Icon name="alert" size="sm" color={orange} />
                  <Text variant="caption" style={{ flex: 1 }}>{note}</Text>
                </View>
              ))}

              <Text variant="caption" style={{ marginBottom: 10, marginTop: 12 }}>Filtros aplicados</Text>
              <View style={[styles.wrap, { marginBottom: 20 }]}>
                {chips.length === 0 && <Text variant="caption">Sin filtros: todos los equipos.</Text>}
                {chips.map(({ key, label }) => (
                  <FilterChip key={key} selected label={`${label} ×`} onPress={() => removeChip(key)} />
                ))}
              </View>

              {answer.groups && result.dsl.groupBy ? (
                <View style={{ marginBottom: 24 }}>
                  <Text variant="caption" style={{ marginBottom: 12 }}>
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
                        style={styles.listRow}
                      >
                        <View style={{ flex: 1, paddingRight: 12 }}>
                          <Text variant="subtitle">{g.label}</Text>
                          {result.dsl.metric !== 'count' && (
                            <Text variant="caption">{plural(g.equipmentCount, 'equipo', 'equipos')}</Text>
                          )}
                        </View>
                        <View style={styles.ghostChip}>
                          <Text style={styles.ghostChipText}>{formatMetricValue(result.dsl.metric, g.value)}</Text>
                        </View>
                      </Pressable>
                    );
                  })}
                  {answer.groups.length === 0 && <EmptyState>Sin resultados.</EmptyState>}
                </View>
              ) : (
                <View style={{ marginBottom: 24 }}>
                  <Text variant="caption" style={{ marginBottom: 4 }}>
                    {plural(answer.equipmentTotal, 'equipo', 'equipos')} en {plural(answer.clientTotal, 'cliente', 'clientes')}
                  </Text>
                  {(result.dsl.metric === 'avgAge' || result.dsl.metric === 'confidence') && (
                    <Text variant="caption" style={{ marginBottom: 8 }}>
                      {METRIC_LABEL[result.dsl.metric]}: {formatMetricValue(result.dsl.metric, answer.overall)}
                    </Text>
                  )}
                  {answer.institutions.map((inst) => (
                    <Pressable key={inst.id} onPress={() => router.push(`/clients/${inst.id}`)} style={styles.listRow}>
                      <View style={{ flex: 1, paddingRight: 12 }}>
                        <Text variant="subtitle">{inst.name}</Text>
                        <Text variant="caption">
                          {inst.city ?? '—'}, {inst.countryIso ? countryLabel(inst.countryIso) : '—'}
                        </Text>
                      </View>
                      <Text variant="caption">{plural(inst.equipmentCount, 'equipo', 'equipos')}</Text>
                    </Pressable>
                  ))}
                  {answer.clientTotal === 0 && <EmptyState>Sin resultados.</EmptyState>}
                </View>
              )}
            </>
          )}
        </ScrollView>

        <View style={{ borderTopWidth: 1, borderTopColor: styles.card.borderColor, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 12 }}>
          {(phase === 'parsing' || phase === 'computing' || summarizing) && (
            <Text variant="caption" style={{ marginBottom: 8 }}>
              {phase === 'parsing' ? 'Interpretando tu pregunta…' : phase === 'computing' ? 'Procesando datos…' : 'Redactando respuesta…'}
            </Text>
          )}
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Input
                value={question}
                onChangeText={setQuestion}
                placeholder="Preguntá algo, ej: equipos por modalidad"
                multiline
                editable={!busy && !summarizing}
              />
            </View>
            <Button
              size="icon"
              onPress={() => handleAsk()}
              disabled={askDisabled}
              loading={busy}
              style={{ backgroundColor: askDisabled ? styles.card.borderColor : primary }}
            >
              <Icon name="search" size="md" color={askDisabled ? muted : primaryFg} />
            </Button>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
