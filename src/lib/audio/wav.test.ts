import { describe, expect, it } from 'vitest';
import { decodeWav, encodeWav, trimSilence } from './wav';

/** A 16-bit PCM WAV with `channels` interleaved channels, built by hand. */
function wav(channels: number, sampleRate: number, frames: number[][]): Uint8Array {
  const data = frames.length * channels * 2;
  const v = new DataView(new ArrayBuffer(44 + data));
  const text = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  text(0, 'RIFF'); v.setUint32(4, 36 + data, true); text(8, 'WAVE'); text(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, channels, true); v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * channels * 2, true); v.setUint16(32, channels * 2, true); v.setUint16(34, 16, true);
  text(36, 'data'); v.setUint32(40, data, true);
  frames.flat().forEach((s, i) => v.setInt16(44 + 2 * i, s, true));
  return new Uint8Array(v.buffer);
}

describe('wav', () => {
  it('round-trips mono 16-bit samples', () => {
    const samples = Float32Array.from([0, 0.5, -0.5, 1, -1]);
    const back = decodeWav(encodeWav(samples, 16000));
    expect(back.sampleRate).toBe(16000);
    back.samples.forEach((s, i) => expect(s).toBeCloseTo(samples[i], 3));
  });

  it('mixes stereo down to mono', () => {
    const { samples, sampleRate } = decodeWav(wav(2, 22050, [[16384, 0], [-16384, -16384]]));
    expect(sampleRate).toBe(22050);
    expect(samples[0]).toBeCloseTo(0.25, 3);
    expect(samples[1]).toBeCloseTo(-0.5, 3);
  });

  it('refuses something that is not a WAV', () => {
    expect(() => decodeWav(new Uint8Array(64))).toThrow('Not a WAV file');
  });

  it('trims silence at both ends, keeping a little padding', () => {
    const s = new Float32Array(1000);
    s[400] = 0.5;
    s[500] = -0.3;
    const trimmed = trimSilence(s, 1000, -45, 0.01); // 10 samples of padding
    expect(trimmed.length).toBe(500 - 400 + 1 + 20);
    expect(trimmed[10]).toBe(0.5);
    expect(trimSilence(new Float32Array(100), 1000)).toHaveLength(0);
  });
});
