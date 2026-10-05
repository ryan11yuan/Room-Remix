import { describe, expect, it } from 'vitest';
import { defaultRoom } from '@/lib/room/roomState';
import { createRng, fft, gaussian, nextPow2 } from './dsp';
import { normalizeLoudness, pinkGain } from './loudness';
import { simulateRoom, type StereoIr } from './simulate';

/** Seeded noise with an exact 1/f power spectrum between 50 Hz and min(16 kHz, Nyquist). */
function pinkNoise(length: number, sampleRate: number, seed: number): Float64Array {
  const n = nextPow2(length);
  const rng = createRng(seed);
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = gaussian(rng);
  fft(re, im);
  const top = Math.min(16000, sampleRate / 2);
  for (let k = 0; k < n; k++) {
    const f = (Math.min(k, n - k) * sampleRate) / n;
    const g = f >= 50 && f <= top ? 1 / Math.sqrt(f) : 0;
    re[k] *= g;
    im[k] *= g;
  }
  fft(re, im, true);
  return re.subarray(0, length);
}

/** Linear convolution via FFT. */
function convolve(signal: Float64Array, kernel: Float32Array): Float64Array {
  const n = nextPow2(signal.length + kernel.length);
  const aRe = new Float64Array(n);
  const aIm = new Float64Array(n);
  const bRe = new Float64Array(n);
  const bIm = new Float64Array(n);
  aRe.set(signal);
  bRe.set(kernel);
  fft(aRe, aIm);
  fft(bRe, bIm);
  for (let k = 0; k < n; k++) {
    const re = aRe[k] * bRe[k] - aIm[k] * bIm[k];
    aIm[k] = aRe[k] * bIm[k] + aIm[k] * bRe[k];
    aRe[k] = re;
  }
  fft(aRe, aIm, true);
  return aRe;
}

const power = (x: ArrayLike<number>, from: number, to: number) => {
  let s = 0;
  for (let i = from; i < to; i++) s += x[i] * x[i];
  return s / (to - from);
};

/** Level of pink noise played through the IR (both ears) relative to dry, in dB. */
function wetVsDry(ir: StereoIr): number {
  const length = 1 << 16;
  const noise = pinkNoise(length, ir.sampleRate, 5);
  const from = ir.left.length; // skip the reverb's build-up
  const wet = (power(convolve(noise, ir.left), from, length) + power(convolve(noise, ir.right), from, length)) / 2;
  return 10 * Math.log10(wet / power(noise, from, length));
}

describe('pinkGain', () => {
  it('is 1 for a unit impulse', () => {
    expect(pinkGain(Float32Array.of(1), 48000)).toBeCloseTo(1, 9);
  });

  it('scales with the square of the amplitude', () => {
    expect(pinkGain(Float32Array.of(2), 48000)).toBeCloseTo(4, 9);
  });
});

describe('normalizeLoudness', () => {
  it('leaves a silent IR alone', () => {
    const ir = { left: new Float32Array(8), right: new Float32Array(8), sampleRate: 48000 };
    expect(normalizeLoudness(ir)).toBe(ir);
  });

  it('keeps the sample rate and the level difference between the ears', () => {
    const ir = normalizeLoudness({ left: Float32Array.of(2), right: Float32Array.of(1), sampleRate: 44100 });
    expect(ir.sampleRate).toBe(44100);
    expect(ir.left[0] / ir.right[0]).toBeCloseTo(2, 9);
  });

  it('plays pink noise at the dry level through a bass-heavy IR', () => {
    const kernel = Float32Array.from({ length: 2048 }, (_, i) => 0.05 * 0.95 ** i);
    const ir = { left: kernel, right: kernel, sampleRate: 32000 };
    expect(Math.abs(wetVsDry(normalizeLoudness(ir)))).toBeLessThan(1);

    // The old flat-energy scaling is several dB off for the same IR.
    let energy = 0;
    for (const v of kernel) energy += v * v;
    const flat = kernel.map((v) => v / Math.sqrt(energy));
    expect(Math.abs(wetVsDry({ left: flat, right: flat, sampleRate: 32000 }))).toBeGreaterThan(3);
  });

  it('plays pink noise at the dry level through a simulated room', () => {
    const ir = simulateRoom(defaultRoom(), 16000).ir;
    expect(Math.abs(wetVsDry(normalizeLoudness(ir)))).toBeLessThan(1);
  });
});
