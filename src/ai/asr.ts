import { transcribe, WHISPER_SMALL_Q8_0 } from '@qvac/sdk';
import { AudioStudioModule, useAudioRecorder } from '@siteed/audio-studio';
import { toByteArray } from 'base64-js';
import { useCallback, useRef, useState } from 'react';
import { loadExclusive, unloadCurrentModel } from './modelManager';
import { bytesToPCM16, rmsLevel } from './resample';

const SAMPLE_RATE = 16000;

/**
 * Push-to-talk voice capture: records to a WAV file, then transcribes the whole clip in
 * one call once the user stops — record and transcribe as two separate phases, not a live
 * streaming session. The streaming duplex API (transcribeStream + session.write() per
 * audio chunk) worked, but stopping mid-utterance raced the QVAC worker's RPC channel
 * teardown against in-flight writes and crashed with an uncaught 'CHANNEL_CLOSED' error
 * from bare-rpc that no JS try/catch could intercept (it fires from the stream's internal
 * 'error' event, not a rejected promise). Two clean request/response calls — record, then
 * transcribe — has no such race and was already proven reliable in the phase-0 spike.
 * `audioLevel` still updates live from the raw mic signal so the UI can show a waveform
 * while recording, independent of transcription (which now only starts after `stop()`).
 */
export function useVoiceCapture() {
  const { startRecording, stopRecording } = useAudioRecorder();
  const [isRecording, setIsRecording] = useState(false);
  const [isLoadingModel, setIsLoadingModel] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const busyRef = useRef(false); // guards against a double-tap firing start() twice

  const start = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setError(null);
    setAudioLevel(0);
    let step = 'PERMISSION';
    try {
      const permission = await AudioStudioModule.requestPermissionsAsync();
      if (!permission.granted) {
        throw new Error(
          'Sin permiso de micrófono. Actívalo en Ajustes > QVAC > Micrófono y vuelve a intentar.'
        );
      }

      step = 'START_RECORDING';
      await startRecording({
        sampleRate: SAMPLE_RATE,
        channels: 1,
        encoding: 'pcm_16bit',
        onAudioStream: async (event: { data: string | Float32Array | Int16Array }) => {
          if (typeof event.data !== 'string') return; // native hands back base64 PCM16LE
          setAudioLevel(rmsLevel(bytesToPCM16(toByteArray(event.data))));
        },
      });
      setIsRecording(true);
    } catch (e: any) {
      console.error(`[voice] start failed at step ${step}:`, e);
      setError(`[${step}] ` + (e?.message || e?.code || 'Error desconocido al iniciar la grabación'));
    } finally {
      busyRef.current = false;
    }
  }, [startRecording]);

  const stop = useCallback(async (): Promise<string> => {
    setIsRecording(false);
    setAudioLevel(0);
    let step = 'STOP_RECORDING';
    let modelId: string | null = null;
    try {
      const result = await stopRecording();
      const filePath = result.fileUri.replace(/^file:\/\//, '');

      step = 'LOAD_MODEL';
      setIsLoadingModel(true);
      modelId = await loadExclusive({
        modelSrc: WHISPER_SMALL_Q8_0,
        modelType: 'whisper',
        // 'auto' lets Whisper detect the spoken language per-clip instead of assuming
        // Spanish — the app is used in es/pt/en per the plan.
        modelConfig: { language: 'auto' },
      });
      setIsLoadingModel(false);

      step = 'TRANSCRIBE';
      setIsTranscribing(true);
      const text = await transcribe({ modelId, audioChunk: filePath });
      return text.trim();
    } catch (e: any) {
      console.error(`[voice] stop failed at step ${step}:`, e);
      setError(`[${step}] ` + (e?.message || e?.code || 'Error desconocido al transcribir'));
      return '';
    } finally {
      setIsLoadingModel(false);
      setIsTranscribing(false);
      await unloadCurrentModel().catch(() => {});
    }
  }, [stopRecording]);

  return { isRecording, isLoadingModel, isTranscribing, audioLevel, error, start, stop };
}
