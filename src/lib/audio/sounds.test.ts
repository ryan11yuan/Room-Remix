import { describe, expect, it } from 'vitest';
import { chime, footstep, pulse, thud } from './sounds';

const SR = 16000;
const peak = (s: Float32Array) => s.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

describe('sounds', () => {
  for (const [name, make, seconds] of [
    ['footstep', footstep, 0.08],
    ['thud', thud, 0.25],
    ['pulse', pulse, 0.12],
    ['chime', chime, 0.6],
  ] as const) {
    it(`makes a ${name} that is audible and starts and ends in silence`, () => {
      const s = make(SR);
      expect(s.length).toBe(Math.round(seconds * SR));
      expect(s.every(Number.isFinite)).toBe(true);
      expect(peak(s)).toBeGreaterThan(0.1);
      expect(peak(s)).toBeLessThanOrEqual(1);
      expect(Math.abs(s[0])).toBeLessThan(1e-3);
      expect(Math.abs(s[s.length - 1])).toBeLessThan(1e-3);
    });
  }
});
