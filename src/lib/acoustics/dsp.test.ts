import { describe, expect, it } from 'vitest';
import { bandMasks, bandNoise, createRng, fadeTail, fft, gaussian, nextPow2 } from './dsp';

describe('nextPow2', () => {
  it('rounds up to a power of two', () => {
    expect(nextPow2(1000)).toBe(1024);
    expect(nextPow2(1024)).toBe(1024);
  });
});

describe('fft', () => {
  it('transforms an impulse into a flat spectrum', () => {
    const re = new Float64Array(8);
    const im = new Float64Array(8);
    re[0] = 1;
    fft(re, im);
    for (let k = 0; k < 8; k++) {
      expect(re[k]).toBeCloseTo(1, 12);
      expect(im[k]).toBeCloseTo(0, 12);
    }
  });

  it('round-trips through the inverse', () => {
    const rng = createRng(3);
    const original = Float64Array.from({ length: 64 }, () => rng() - 0.5);
    const re = Float64Array.from(original);
    const im = new Float64Array(64);
    fft(re, im);
    fft(re, im, true);
    original.forEach((v, i) => expect(re[i]).toBeCloseTo(v, 10));
  });
});

describe('bandMasks', () => {
  const masks = bandMasks(1024, 16000); // bin spacing 15.625 Hz

  it('sums to exactly one at every bin and is never negative', () => {
    for (let k = 0; k <= 512; k++) {
      const sum = masks.reduce((s, m) => s + m[k], 0);
      expect(sum).toBeCloseTo(1, 12);
      masks.forEach((m) => expect(m[k]).toBeGreaterThanOrEqual(0));
    }
  });

  it('puts 1 kHz fully in the 1 kHz band and 4 kHz in the top band', () => {
    expect(masks[3][64]).toBeCloseTo(1, 12); // 1000 Hz
    expect(masks[5][256]).toBeCloseTo(1, 12); // 4000 Hz
    expect(masks[3][256]).toBeCloseTo(0, 12);
  });
});

describe('bandNoise', () => {
  it('splits seeded white noise into bands that sum back to it', () => {
    const rng = createRng(7);
    const white = Array.from({ length: 1000 }, () => gaussian(rng));
    const bands = bandNoise(1000, 16000, 7);
    expect(bands).toHaveLength(6);
    for (let i = 0; i < 1000; i++) {
      expect(bands.reduce((s, b) => s + b[i], 0)).toBeCloseTo(white[i], 4);
    }
  });

  it('is deterministic for a seed and differs between seeds', () => {
    const a = createRng(11);
    const b = createRng(11);
    expect(Array.from({ length: 5 }, () => a())).toEqual(Array.from({ length: 5 }, () => b()));
    expect(bandNoise(500, 16000, 11)[2]).not.toEqual(bandNoise(500, 16000, 12)[2]);
  });
});

describe('fadeTail', () => {
  it('fades the last stretch to zero and leaves the rest alone', () => {
    const signal = new Float32Array(1000).fill(1);
    fadeTail(signal, 1000, 0.1); // the last 100 samples
    expect(signal[899]).toBe(1);
    expect(signal[950]).toBeGreaterThan(0.3);
    expect(signal[950]).toBeLessThan(0.7);
    expect(signal[999]).toBeCloseTo(0, 6);
    for (let i = 901; i < 1000; i++) expect(signal[i]).toBeLessThanOrEqual(signal[i - 1]);
  });

  it('fades the whole of a signal shorter than the fade', () => {
    const signal = new Float32Array(10).fill(1);
    fadeTail(signal, 1000, 0.1);
    expect(signal[9]).toBeCloseTo(0, 6);
    expect(signal[0]).toBeLessThan(1);
  });
});
