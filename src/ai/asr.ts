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
    try {
      // startRecording() never requests mic permission itself — on iOS this makes it
      // fail with an unlocalized native error ("undefined reason") instead of ever
      // showing the system prompt, because the permission status starts as
      // "undetermined" and the native code doesn't request-and-await it first.
      const permission = await AudioStudioModule.requestPermissionsAsync();
      if (!permission.granted) {
        throw new Error(
          'Sin permiso de micrófono. Actívalo en Ajustes > QVAC > Micrófono y vuelve a intentar.'
        );
      }

      const modelId = await loadExclusive({
        modelSrc: PARAKEET_TDT_0_6B_V3_Q4_0,
        modelType: 'parakeet-transcription',
        // Parakeet's streaming duplex mode is configured at LOAD time, not per-call —
        // opening a transcribeStream() session against a model loaded without this
        // almost certainly explains the native error every audio-format attempt hit
        // identically: the session itself was never viable, regardless of the audio.
        modelConfig: { streaming: true, streamingEmitPartials: true },
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
        sampleRate: CAPTURE_SAMPLE_RATE,
        channels: 1,
        // pcm_16bit + the default 'raw' streamFormat is audio-studio's most-exercised
        // native path (its Quick Start example). Both pcm_32bit+streamFormat:'float32'
        // and pcm_16bit at 16kHz directly threw an unlocalized native error on-device
        // ("undefined reason") — capturing at the standard 44.1kHz rate and downsampling
        // in JS (below) sidesteps whatever native audio-engine path that hit.
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
      console.error('[voice] start failed:', e);
      setIsLoadingModel(false);
      setError(e?.message || e?.code || JSON.stringify(e) || 'Error desconocido al iniciar la grabación');
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
