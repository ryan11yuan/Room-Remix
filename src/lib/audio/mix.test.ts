import { describe, expect, it } from 'vitest';
import { downmixToMono, modeGains, silentIr } from './mix';

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

describe('silentIr', () => {
  it('is one silent sample per ear at the given rate', () => {
    const ir = silentIr(44100);
    expect(ir.sampleRate).toBe(44100);
    expect(Array.from(ir.left)).toEqual([0]);
    expect(Array.from(ir.right)).toEqual([0]);
    expect(ir.left).not.toBe(ir.right); // two buffers: the engine copies each ear into its own channel
  });
});
