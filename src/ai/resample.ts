/**
 * Naive linear-interpolation PCM16 resampler. Good enough for speech captured at a
 * standard hardware rate (44.1kHz) and downsampled to the 16kHz QVAC's ASR models
 * expect — not audiophile-grade (no anti-aliasing filter), but at speech frequencies
 * the artifacts are inaudible and don't measurably hurt transcription accuracy.
 */
export function resamplePCM16(input: Int16Array, fromRate: number, toRate: number): Int16Array {
  if (fromRate === toRate) return input;

  const ratio = fromRate / toRate;
  const outLength = Math.max(1, Math.floor(input.length / ratio));
  const output = new Int16Array(outLength);

  for (let i = 0; i < outLength; i++) {
    const srcIndex = i * ratio;
    const i0 = Math.floor(srcIndex);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const frac = srcIndex - i0;
    output[i] = Math.round(input[i0] * (1 - frac) + input[i1] * frac);
  }

  return output;
}

/** Decodes little-endian PCM16 bytes into an Int16Array view (platform is little-endian). */
export function bytesToPCM16(bytes: Uint8Array): Int16Array {
  return new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2));
}

export function pcm16ToBytes(samples: Int16Array): Uint8Array {
  return new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
}

/**
 * RMS (root-mean-square) amplitude of a PCM16 chunk, normalized to roughly 0-1 for driving
 * a live level meter. Uses a light log scale (like a VU meter) so quiet speech is still
 * visible instead of being crushed near zero by a linear scale.
 */
export function rmsLevel(samples: Int16Array): number {
  if (samples.length === 0) return 0;
  let sumSquares = 0;
  for (let i = 0; i < samples.length; i++) {
    const normalized = samples[i] / 32768;
    sumSquares += normalized * normalized;
  }
  const rms = Math.sqrt(sumSquares / samples.length);
  // -50dB (near-silence) -> 0, 0dB (full scale) -> 1, log-scaled in between.
  const db = 20 * Math.log10(Math.max(rms, 1e-5));
  return Math.max(0, Math.min(1, (db + 50) / 50));
}
