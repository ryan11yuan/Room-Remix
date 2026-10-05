import { describe, expect, it } from 'vitest';
import type { SimOutput } from '@/lib/acoustics/client';
import { resultMatchesRate } from './useSimulation';

const at = (sampleRate: number) => ({ now: { ir: { sampleRate } }, withFixes: { ir: { sampleRate } } }) as unknown as SimOutput;

describe('resultMatchesRate', () => {
  it('only accepts results simulated at the audio context rate', () => {
    expect(resultMatchesRate(at(48000), 48000)).toBe(true);
    expect(resultMatchesRate(at(48000), 44100)).toBe(false);
    expect(resultMatchesRate(at(48000), null)).toBe(false);
    expect(resultMatchesRate(null, 48000)).toBe(false);
  });
});
