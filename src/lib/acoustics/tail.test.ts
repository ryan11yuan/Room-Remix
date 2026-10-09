import { describe, expect, it } from 'vitest';
import { addTail } from './tail';

const SR = 8000;
const RT = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
const rms = (s: Float32Array, from: number, to: number) => {
  let sum = 0;
  for (let i = from; i < to; i++) sum += s[i] * s[i];
  return Math.sqrt(sum / (to - from));
};

describe('addTail', () => {
  it('is silent before the transition and decays about 60 dB over the reverb time', () => {
    const left = new Float32Array(SR);
    const right = new Float32Array(SR);
    addTail(RT, 50, 0.05, SR, left, right);
    expect(left.subarray(0, 0.05 * SR).every((v) => v === 0)).toBe(true);
    const early = rms(left, 0.05 * SR, 0.1 * SR);
    const late = rms(left, 0.55 * SR, 0.6 * SR); // 0.5 s (one reverb time) later
    const db = 20 * Math.log10(late / early);
    expect(db).toBeGreaterThan(-66);
    expect(db).toBeLessThan(-54);
  });

  it('gives left and right different noise', () => {
    const left = new Float32Array(SR / 4);
    const right = new Float32Array(SR / 4);
    addTail(RT, 50, 0, SR, left, right);
    expect(left.some((v, i) => v !== right[i])).toBe(true);
  });

  it('is twice as loud in a room a quarter the volume', () => {
    const small = [new Float32Array(SR / 4), new Float32Array(SR / 4)] as const;
    const big = [new Float32Array(SR / 4), new Float32Array(SR / 4)] as const;
    addTail(RT, 25, 0, SR, ...small);
    addTail(RT, 100, 0, SR, ...big);
    expect(rms(small[0], 0, SR / 4) / rms(big[0], 0, SR / 4)).toBeCloseTo(2, 5);
  });
});
