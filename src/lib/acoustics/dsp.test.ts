import { describe, expect, it } from 'vitest';
import { applyBandMasks, bandMasks, bandNoise, createRng, fadeTail, fft, gaussian, highPass, nextPow2 } from './dsp';

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

describe('applyBandMasks', () => {
  it('passes an impulse through unchanged when every band has the same gain', () => {
    const bands = Array.from({ length: 6 }, () => {
      const s = new Float64Array(256);
      s[10] = 1;
      return s;
    });
    const out = applyBandMasks(bands, bandMasks(256, 16000));
    out.forEach((v, i) => expect(v).toBeCloseTo(i === 10 ? 1 : 0, 9));
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

describe('highPass', () => {
  const rms = (x: Float64Array, from: number) => {
    let s = 0;
    for (let i = from; i < x.length; i++) s += x[i] * x[i];
    return Math.sqrt(s / (x.length - from));
  };
  const sine = (hz: number, length: number, sampleRate: number) =>
    Float64Array.from({ length }, (_, i) => Math.sin((2 * Math.PI * hz * i) / sampleRate));

  it('removes a constant (DC) input', () => {
    const signal = new Float64Array(48000).fill(1);
    highPass(signal, 48000, 40);
    expect(Math.abs(signal[signal.length - 1])).toBeLessThan(1e-3);
  });

  it('passes 1 kHz at unit gain', () => {
    const signal = sine(1000, 48000, 48000);
    highPass(signal, 48000, 40);
    const peak = Math.max(...signal.subarray(24000).map(Math.abs));
    expect(peak).toBeGreaterThan(0.99);
    expect(peak).toBeLessThan(1.01);
  });

  it('is 3 dB down at the cutoff', () => {
    const input = sine(40, 96000, 48000); // 2 s
    const signal = Float64Array.from(input);
    highPass(signal, 48000, 40);
    expect(Math.abs(rms(signal, 48000) / rms(input, 48000) / Math.SQRT1_2 - 1)).toBeLessThan(0.02);
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
