import { describe, expect, it } from 'vitest';
import { trimWav } from '../../../scripts/trimWav.mjs';

const RATE = 8000;
const CHANNELS = 2;

/** A 24-bit stereo WAV with a LIST chunk (odd size, so padded) before `data`. */
function make24(frames: number, sample: (frame: number, channel: number) => number): Uint8Array {
  const list = new Uint8Array([1, 2, 3]);
  const dataBytes = frames * CHANNELS * 3;
  const out = new Uint8Array(12 + 24 + (8 + list.length + 1) + 8 + dataBytes);
  const v = new DataView(out.buffer);
  const put = (at: number, text: string) => [...text].forEach((c, i) => (out[at + i] = c.charCodeAt(0)));
  put(0, 'RIFF');
  v.setUint32(4, out.length - 8, true);
  put(8, 'WAVEfmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, CHANNELS, true);
  v.setUint32(24, RATE, true);
  v.setUint32(28, RATE * CHANNELS * 3, true);
  v.setUint16(32, CHANNELS * 3, true);
  v.setUint16(34, 24, true);
  put(36, 'LIST');
  v.setUint32(40, list.length, true);
  out.set(list, 44);
  const dataAt = 44 + list.length + 1;
  put(dataAt, 'data');
  v.setUint32(dataAt + 4, dataBytes, true);
  for (let f = 0; f < frames; f++) {
    for (let c = 0; c < CHANNELS; c++) {
      const n = Math.round(sample(f, c) * 8388607);
      const at = dataAt + 8 + (f * CHANNELS + c) * 3;
      out[at] = n & 0xff;
      out[at + 1] = (n >> 8) & 0xff;
      out[at + 2] = (n >> 16) & 0xff;
    }
  }
  return out;
}

describe('trimWav', () => {
  const sample = (f: number, c: number) => 0.9 * Math.sin((f / 37) * (c + 1)) * (1 - f / 100000);
  const input = make24(RATE * 3, sample);
  const out = trimWav(input, 1.5);
  const v = new DataView(out.buffer, out.byteOffset, out.byteLength);

  it('writes 16-bit PCM with the same channels and rate', () => {
    expect(String.fromCharCode(...out.subarray(0, 4))).toBe('RIFF');
    expect(v.getUint16(20, true)).toBe(1);
    expect(v.getUint16(22, true)).toBe(CHANNELS);
    expect(v.getUint32(24, true)).toBe(RATE);
    expect(v.getUint16(34, true)).toBe(16);
  });

  it('keeps only the first seconds', () => {
    const frames = RATE * 1.5;
    expect(v.getUint32(40, true)).toBe(frames * CHANNELS * 2);
    expect(out.length).toBe(44 + frames * CHANNELS * 2);
    expect(v.getUint32(4, true)).toBe(out.length - 8);
  });

  it('keeps the samples to within 1/32767', () => {
    for (let f = 0; f < RATE * 1.5; f += 7) {
      for (let c = 0; c < CHANNELS; c++) {
        expect(Math.abs(v.getInt16(44 + (f * CHANNELS + c) * 2, true) / 32767 - sample(f, c))).toBeLessThanOrEqual(1 / 32767 + 1e-6);
      }
    }
  });

  it('keeps a file shorter than the limit whole', () => {
    expect(trimWav(input, 10).length).toBe(44 + RATE * 3 * CHANNELS * 2);
  });
});
