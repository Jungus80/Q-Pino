import { transcribeStream, PARAKEET_TDT_0_6B_V3_Q4_0, type TranscribeStreamSession } from '@qvac/sdk';
import { useAudioRecorder } from '@siteed/audio-studio';
import { useCallback, useRef, useState } from 'react';
import { loadExclusive, unloadCurrentModel } from './modelManager';

const SAMPLE_RATE = 16000;

/**
 * Push-to-talk voice capture: loads Parakeet TDT v3 (multilingual, es/pt/en — see the
 * architecture plan), opens a duplex transcribeStream() session, and feeds it 16kHz mono
 * float32 chunks from the microphone as they arrive. `partialText` updates live so the UI
 * can show transcription as it happens; `stop()` closes the mic and the session and
 * resolves with the final transcript.
 */
export function useVoiceCapture() {
  const { startRecording, stopRecording } = useAudioRecorder();
  const [isRecording, setIsRecording] = useState(false);
  const [isLoadingModel, setIsLoadingModel] = useState(false);
  const [partialText, setPartialText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const sessionRef = useRef<TranscribeStreamSession | null>(null);
  const drainPromiseRef = useRef<Promise<void> | null>(null);
  const textRef = useRef('');

  const start = useCallback(async () => {
    setError(null);
    setPartialText('');
    textRef.current = '';
    setIsLoadingModel(true);
    try {
      const modelId = await loadExclusive({
        modelSrc: PARAKEET_TDT_0_6B_V3_Q4_0,
        modelType: 'parakeet-transcription',
      });
      setIsLoadingModel(false);

      const session = (await transcribeStream({ modelId })) as TranscribeStreamSession;
      sessionRef.current = session;

      drainPromiseRef.current = (async () => {
        for await (const chunk of session) {
          const text = typeof chunk === 'string' ? chunk : (chunk as { text?: string }).text ?? '';
          if (text) {
            textRef.current += text;
            setPartialText(textRef.current);
          }
        }
      })();

      await startRecording({
        sampleRate: SAMPLE_RATE,
        channels: 1,
        encoding: 'pcm_32bit',
        streamFormat: 'float32',
        onAudioStream: async (event: { data: string | Float32Array | Int16Array }) => {
          // streamFormat: 'float32' guarantees a Float32Array per the audio-studio docs;
          // the SDK's event type is still a union across every recorder config, so guard.
          if (!(event.data instanceof Float32Array)) return;
          const samples = event.data;
          const bytes = new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
          session.write(bytes);
        },
      });
      setIsRecording(true);
    } catch (e: any) {
      setIsLoadingModel(false);
      setError(e?.message ?? String(e));
    }
  }, [startRecording]);

  const stop = useCallback(async (): Promise<string> => {
    setIsRecording(false);
    try {
      await stopRecording();
    } catch {
      // recorder may already be stopped; ignore
    }

    const session = sessionRef.current;
    if (session) {
      session.end();
      await drainPromiseRef.current?.catch(() => {});
      sessionRef.current = null;
      drainPromiseRef.current = null;
    }
    await unloadCurrentModel();
    return textRef.current;
  }, [stopRecording]);

  return { isRecording, isLoadingModel, partialText, error, start, stop };
}
