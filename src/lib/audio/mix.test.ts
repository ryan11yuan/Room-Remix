import { describe, expect, it } from 'vitest';
import { downmixToMono, modeGains, normalizeIr } from './mix';

describe('modeGains', () => {
  it('plays only the dry path when the room is off', () => {
    expect(modeGains({ room: false, fixes: true })).toEqual({ dry: 1, now: 0, withFixes: 0 });
  });
  it('plays the current room', () => {
    expect(modeGains({ room: true, fixes: false })).toEqual({ dry: 0, now: 1, withFixes: 0 });
  });
  it('plays the room with fixes', () => {
    expect(modeGains({ room: true, fixes: true })).toEqual({ dry: 0, now: 0, withFixes: 1 });
  });
});

describe('downmixToMono', () => {
  it('averages stereo', () => {
    expect(Array.from(downmixToMono([Float32Array.of(1, 0), Float32Array.of(0, 1)]))).toEqual([0.5, 0.5]);
  });
  it('averages six channels', () => {
    const channels = Array.from({ length: 6 }, (_, i) => Float32Array.of(i));
    expect(downmixToMono(channels)[0]).toBeCloseTo(2.5, 6);
  });
  it('passes mono through', () => {
    expect(Array.from(downmixToMono([Float32Array.of(0.25, -0.5)]))).toEqual([0.25, -0.5]);
  });
});

describe('normalizeIr', () => {
  it('scales to unit mean ear energy', () => {
    const ir = normalizeIr({ left: Float32Array.of(2, 0), right: Float32Array.of(0, 2), sampleRate: 48000 });
    const energy = (a: Float32Array) => a.reduce((s, v) => s + v * v, 0);
    expect((energy(ir.left) + energy(ir.right)) / 2).toBeCloseTo(1, 6);
    expect(ir.sampleRate).toBe(48000);
  });
  it('leaves a silent IR alone', () => {
    const ir = { left: new Float32Array(4), right: new Float32Array(4), sampleRate: 48000 };
    expect(normalizeIr(ir)).toBe(ir);
  });
});
