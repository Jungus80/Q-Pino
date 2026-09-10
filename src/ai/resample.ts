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
