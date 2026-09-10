import { describe, expect, it } from 'vitest';
import { bytesToPCM16, pcm16ToBytes, resamplePCM16, rmsLevel } from './resample';

describe('resamplePCM16', () => {
  it('is a no-op when rates match', () => {
    const input = new Int16Array([1, 2, 3]);
    expect(resamplePCM16(input, 16000, 16000)).toBe(input);
  });

  it('downsamples 44100 -> 16000 to roughly the expected length', () => {
    const input = new Int16Array(4410); // 0.1s at 44.1kHz
    const output = resamplePCM16(input, 44100, 16000);
    // 0.1s at 16kHz should be ~1600 samples
    expect(output.length).toBeGreaterThan(1550);
    expect(output.length).toBeLessThan(1650);
  });

  it('preserves a constant signal', () => {
    const input = new Int16Array(1000).fill(5000);
    const output = resamplePCM16(input, 44100, 16000);
    expect(Array.from(output).every((v) => v === 5000)).toBe(true);
  });

  it('interpolates between two points linearly', () => {
    // 2:1 downsample — output[i] should land between input[2i] and input[2i+1]
    const input = new Int16Array([0, 1000, 2000, 3000]);
    const output = resamplePCM16(input, 2, 1);
    expect(output.length).toBe(2);
    expect(output[0]).toBe(0);
  });
});

describe('bytesToPCM16 / pcm16ToBytes', () => {
  it('round-trips little-endian PCM16 samples', () => {
    const samples = new Int16Array([0, 1, -1, 32767, -32768]);
    const bytes = pcm16ToBytes(samples);
    const roundTripped = bytesToPCM16(bytes);
    expect(Array.from(roundTripped)).toEqual(Array.from(samples));
  });
});

describe('rmsLevel', () => {
  it('returns 0 for silence', () => {
    expect(rmsLevel(new Int16Array(100).fill(0))).toBe(0);
  });

  it('returns near 1 for a full-scale signal', () => {
    const samples = new Int16Array(100);
    for (let i = 0; i < samples.length; i++) samples[i] = i % 2 === 0 ? 32767 : -32768;
    expect(rmsLevel(samples)).toBeGreaterThan(0.95);
  });

  it('increases monotonically with amplitude', () => {
    const quiet = new Int16Array(100).fill(500);
    const loud = new Int16Array(100).fill(10000);
    expect(rmsLevel(loud)).toBeGreaterThan(rmsLevel(quiet));
  });

  it('handles an empty array', () => {
    expect(rmsLevel(new Int16Array(0))).toBe(0);
  });
});
