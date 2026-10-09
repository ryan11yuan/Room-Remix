import { describe, expect, it } from 'vitest';
import { midRt60 } from '@/lib/acoustics/reverbTime';
import { echoIr, echoRt60, MAX_ECHO_S } from './echo';

const SR = 8000;
const room = { length: 5, width: 4, height: 2.7 };
const rms = (s: Float32Array, from: number, to: number) => {
  let sum = 0;
  for (let i = from; i < to; i++) sum += s[i] * s[i];
  return Math.sqrt(sum / (to - from));
};

describe('echo', () => {
  it('predicts the reverb time of a drywall room with a carpet floor and a plaster ceiling', () => {
    expect(midRt60(echoRt60(room))).toBeCloseTo(0.354, 2);
  });

  it('makes a stereo response one and a half reverb times long that fades away', () => {
    const ir = echoIr(room, SR);
    expect(ir.left.length).toBe(Math.ceil(1.5 * Math.max(...echoRt60(room)) * SR));
    expect(ir.right.length).toBe(ir.left.length);
    expect(ir.left.some((v, i) => v !== ir.right[i])).toBe(true);
    const tenth = Math.floor(ir.left.length / 10);
    expect(rms(ir.left, ir.left.length - tenth, ir.left.length)).toBeLessThan(rms(ir.left, 0, tenth) / 100);
  });

  it('caps a big room at 2 s and fades the cut to silence', () => {
    const ir = echoIr({ length: 25, width: 20, height: 10 }, SR);
    expect(ir.left.length).toBe(MAX_ECHO_S * SR);
    expect(Math.abs(ir.left[ir.left.length - 1])).toBeLessThan(1e-9);
  });
});
