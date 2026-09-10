import { transcribeStream, PARAKEET_TDT_0_6B_V3_Q4_0, type TranscribeStreamSession } from '@qvac/sdk';
import { AudioStudioModule, useAudioRecorder } from '@siteed/audio-studio';
import { toByteArray } from 'base64-js';
import { useCallback, useRef, useState } from 'react';
import { loadExclusive, unloadCurrentModel } from './modelManager';
import { bytesToPCM16, pcm16ToBytes, resamplePCM16 } from './resample';

// The QVAC ASR models expect 16kHz; the recorder captures at this standard hardware
// rate instead (44.1kHz caused no native failures in testing, whereas requesting 16kHz
// directly from the recorder threw an unlocalized native error on-device — see the
// resample() call below for the downsampling this trades in for reliability).
const CAPTURE_SAMPLE_RATE = 44100;
const TARGET_SAMPLE_RATE = 16000;

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
  const busyRef = useRef(false); // guards against a double-tap firing start() twice

  // Shared by stop() and start()'s failure path — a session or model left open when
  // something fails mid-start blocks every subsequent attempt with "concurrent
  // runStreaming() during an open streaming session", since the QVAC worker only allows
  // one active streaming session per model.
  const cleanup = useCallback(async () => {
    const session = sessionRef.current;
    if (session) {
      try {
        session.end();
      } catch {
        // already ended
      }
      await drainPromiseRef.current?.catch(() => {});
      sessionRef.current = null;
      drainPromiseRef.current = null;
    }
    await unloadCurrentModel();
  }, []);

  const start = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setError(null);
    setPartialText('');
    textRef.current = '';
    setIsLoadingModel(true);
    // Every previous fix attempt (audio format, sample rate, streaming:true) produced
    // the byte-for-byte identical native error, which means guessing which awaited call
    // actually threw was unreliable — instrument each step so the error message itself
    // says which one failed instead of continuing to guess blind.
    let step = 'PERMISSION';
    try {
      const permission = await AudioStudioModule.requestPermissionsAsync();
      if (!permission.granted) {
        throw new Error(
          'Sin permiso de micrófono. Actívalo en Ajustes > QVAC > Micrófono y vuelve a intentar.'
        );
      }

      step = 'LOAD_MODEL';
      const modelId = await loadExclusive({
        modelSrc: PARAKEET_TDT_0_6B_V3_Q4_0,
        modelType: 'parakeet-transcription',
        modelConfig: { streaming: true, streamingEmitPartials: true },
      });
      setIsLoadingModel(false);

      step = 'OPEN_STREAM';
      const session = (await transcribeStream({ modelId })) as TranscribeStreamSession;
      sessionRef.current = session;

      step = 'DRAIN_LOOP_SETUP';
      drainPromiseRef.current = (async () => {
        for await (const chunk of session) {
          const text = typeof chunk === 'string' ? chunk : (chunk as { text?: string }).text ?? '';
          if (text) {
            textRef.current += text;
            setPartialText(textRef.current);
          }
        }
      })();

      step = 'START_RECORDING';
      await startRecording({
        sampleRate: CAPTURE_SAMPLE_RATE,
        channels: 1,
        encoding: 'pcm_16bit',
        onAudioStream: async (event: { data: string | Float32Array | Int16Array }) => {
          if (typeof event.data !== 'string') return; // native hands back base64 PCM16LE
          const captured = bytesToPCM16(toByteArray(event.data));
          const resampled = resamplePCM16(captured, CAPTURE_SAMPLE_RATE, TARGET_SAMPLE_RATE);
          session.write(pcm16ToBytes(resampled));
        },
      });
      setIsRecording(true);
    } catch (e: any) {
      console.error(`[voice] start failed at step ${step}:`, e, e?.stack);
      setIsLoadingModel(false);
      setError(`[${step}] ` + (e?.message || e?.code || JSON.stringify(e) || 'Error desconocido'));
      await cleanup();
    } finally {
      busyRef.current = false;
    }
  }, [startRecording, cleanup]);

  const stop = useCallback(async (): Promise<string> => {
    setIsRecording(false);
    try {
      await stopRecording();
    } catch {
      // recorder may already be stopped; ignore
    }
    await cleanup();
    return textRef.current;
  }, [stopRecording, cleanup]);

  return { isRecording, isLoadingModel, partialText, error, start, stop };
}
