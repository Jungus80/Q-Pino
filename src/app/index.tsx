// PHASE 0 RISK SPIKE — throwaway screen, replaced once the real app screens land.
// Runs the three riskiest QVAC capabilities automatically on mount so results are
// visible both on the device and in the Metro/console logs (no manual taps needed):
//   1. completion() with responseFormat: json_schema on the multimodal Qwen3.5-2B model
//   2. Parakeet TDT v3 non-streaming transcribe() on a bundled short WAV clip
//   3. op-sqlite + sqlite-vec (vec0) insert + cosine similarity search
import { open } from '@op-engineering/op-sqlite';
import {
  completion,
  loadModel,
  PARAKEET_TDT_0_6B_V3_Q4_0,
  QWEN3_5_2B_MULTIMODAL_Q4_K_M,
  transcribe,
  unloadModel,
  VERBOSITY,
} from '@qvac/sdk';
import { Asset } from 'expo-asset';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type StepState = 'pending' | 'running' | 'ok' | 'fail';
type Step = { id: string; label: string; state: StepState; detail: string };

const INITIAL_STEPS: Step[] = [
  { id: 'json', label: '1. JSON-schema completion (Qwen3.5-2B)', state: 'pending', detail: '' },
  { id: 'asr', label: '2. Parakeet TDT v3 transcribe()', state: 'pending', detail: '' },
  { id: 'vec', label: '3. op-sqlite + sqlite-vec', state: 'pending', detail: '' },
];

const EXTRACTION_SCHEMA = {
  name: 'observation',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['institution', 'modality', 'count'],
    properties: {
      institution: { type: 'string' },
      modality: { type: 'string', enum: ['MR', 'CT', 'US', 'XR', 'OTHER'] },
      count: { type: 'integer' },
    },
  },
} as const;

export default function SpikeScreen() {
  const [steps, setSteps] = useState<Step[]>(INITIAL_STEPS);
  const ran = useRef(false);

  function patch(id: string, state: StepState, detail: string) {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, state, detail } : s)));
    console.log(`[spike:${id}] ${state} — ${detail}`);
  }

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    (async () => {
      // --- 1. JSON-schema-constrained completion on the multimodal Qwen3.5-2B model ---
      let llmId: string | null = null;
      try {
        patch('json', 'running', 'downloading + loading…');
        llmId = await loadModel({
          modelSrc: QWEN3_5_2B_MULTIMODAL_Q4_K_M,
          modelType: 'llm',
          modelConfig: {
            device: 'gpu',
            ctx_size: 4096,
            verbosity: VERBOSITY.ERROR,
            // Qwen3.5 thinks by default; its reasoning-channel tokens aren't part of
            // our JSON-root grammar and crash the grammar sampler ("Unexpected empty
            // grammar stack") the moment it tries to emit one. 0 disables reasoning.
            reasoning_budget: 0,
          },
          onProgress: (p) => patch('json', 'running', `loading… ${Math.round(p.percentage)}%`),
        });

        const run = completion({
          modelId: llmId,
          history: [
            {
              role: 'system',
              content:
                'Extract equipment info from the field observation as JSON. Only use evidence present in the text.',
            },
            {
              role: 'user',
              content: 'I visited Hospital DemoCare Pacific. They have two MR systems.',
            },
          ],
          stream: false,
          kvCache: false,
          responseFormat: { type: 'json_schema', json_schema: EXTRACTION_SCHEMA },
          generationParams: { predict: 200, temp: 0 },
        });

        const final = await run.final;
        JSON.parse(final.contentText); // throws if the grammar produced invalid/incomplete JSON
        patch('json', 'ok', final.contentText);
      } catch (e: any) {
        patch('json', 'fail', e?.message ?? String(e));
      } finally {
        if (llmId) await unloadModel({ modelId: llmId, clearStorage: false }).catch(() => {});
      }

      // --- 2. Parakeet TDT v3 transcribe() on a bundled short clip ---
      let asrId: string | null = null;
      try {
        patch('asr', 'running', 'downloading + loading…');
        asrId = await loadModel({
          modelSrc: PARAKEET_TDT_0_6B_V3_Q4_0,
          modelType: 'parakeet-transcription',
          onProgress: (p) => patch('asr', 'running', `loading… ${Math.round(p.percentage)}%`),
        });

        // Metro resolves the tsconfig `@/` alias for JS modules, but not reliably for
        // asset requires — use a relative path for the bundled WAV.
        const asset = Asset.fromModule(require('../assets/audio/spike-sample-es.wav'));
        await asset.downloadAsync();
        const filePath = (asset.localUri ?? asset.uri).replace(/^file:\/\//, '');
        const text = await transcribe({ modelId: asrId, audioChunk: filePath });
        patch('asr', 'ok', text || '(empty transcript)');
      } catch (e: any) {
        patch('asr', 'fail', e?.message ?? String(e));
      } finally {
        if (asrId) await unloadModel({ modelId: asrId, clearStorage: false }).catch(() => {});
      }

      // --- 3. op-sqlite + sqlite-vec (vec0) ---
      try {
        patch('vec', 'running', 'opening db…');
        const db = open({ name: 'spike.db' });
        await db.execute('DROP TABLE IF EXISTS spike_vec');
        await db.execute(
          'CREATE VIRTUAL TABLE spike_vec USING vec0(embedding float[4] distance_metric=cosine)'
        );
        await db.execute('INSERT INTO spike_vec (rowid, embedding) VALUES (?, ?)', [
          1,
          new Float32Array([1, 0, 0, 0]).buffer,
        ]);
        await db.execute('INSERT INTO spike_vec (rowid, embedding) VALUES (?, ?)', [
          2,
          new Float32Array([0, 1, 0, 0]).buffer,
        ]);
        const res = await db.execute(
          'SELECT rowid, distance FROM spike_vec WHERE embedding MATCH ? ORDER BY distance LIMIT 2',
          [new Float32Array([0.9, 0.1, 0, 0]).buffer]
        );
        patch('vec', 'ok', JSON.stringify(res.rows));
      } catch (e: any) {
        patch('vec', 'fail', e?.message ?? String(e));
      }
    })();
  }, []);

  return (
    <SafeAreaView className="flex-1 bg-black">
      <ScrollView contentContainerStyle={styles.container}>
        <Text className="text-white text-lg font-semibold mb-4">QVAC Phase 0 Spike</Text>
        {steps.map((s) => (
          <Text key={s.id} className="text-white mb-3">
            <Text
              className={
                s.state === 'ok'
                  ? 'text-green-400'
                  : s.state === 'fail'
                    ? 'text-red-400'
                    : 'text-yellow-400'
              }
            >
              [{s.state.toUpperCase()}]{' '}
            </Text>
            {s.label}
            {'\n'}
            <Text className="text-gray-400 text-xs">{s.detail}</Text>
          </Text>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingTop: 24 },
});
