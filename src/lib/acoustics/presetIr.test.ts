import { describe, expect, it } from 'vitest';
import { createRng, gaussian } from './dsp';
import { pinkGain } from './loudness';
import { PRESET_MAX_SECONDS, prepareIr } from './presetIr';
import type { StereoIr } from './simulate';

const RATE = 48000;

/** A decaying-noise "recording": `lead` seconds of silence, then a click and a reverb tail of `seconds`. */
function recording(seconds: number, lead = 0, scale = 1): StereoIr {
  const rng = createRng(3);
  const start = Math.round(lead * RATE);
  const length = start + Math.round(seconds * RATE);
  const make = () => {
    const channel = new Float32Array(length);
    channel[start] = scale;
    for (let i = start + 1; i < length; i++) channel[i] = scale * 0.2 * gaussian(rng) * Math.exp((-3 * (i - start)) / RATE);
    return channel;
  };
  return { left: make(), right: make(), sampleRate: RATE };
}
const firstLoud = (channel: Float32Array) => {
  let peak = 0;
  for (const v of channel) peak = Math.max(peak, Math.abs(v));
  return channel.findIndex((v) => Math.abs(v) >= peak * 0.5);
};

describe('prepareIr', () => {
  it('plays as loud as dry, whatever level the recording was made at', () => {
    for (const scale of [0.01, 1, 30]) {
      const ir = prepareIr(recording(2, 0, scale));
      const gain = (pinkGain(ir.left, RATE) + pinkGain(ir.right, RATE)) / 2;
      expect(gain).toBeCloseTo(1, 6);
    }
  });

  it('removes silence before the sound, keeping about a millisecond', () => {
    const ir = prepareIr(recording(1, 0.03)); // 30 ms of padding, as an MP3 has
    expect(firstLoud(ir.left)).toBeLessThanOrEqual(Math.round(0.002 * RATE));
    expect(ir.left.length).toBeLessThan(Math.round(1.01 * RATE));
  });

  it('caps a long recording and fades its end to silence', () => {
    const ir = prepareIr(recording(10));
    expect(ir.left.length).toBe(Math.round(PRESET_MAX_SECONDS * RATE));
    expect(Math.abs(ir.left[ir.left.length - 1])).toBeLessThan(1e-6);
    expect(Math.abs(ir.right[ir.right.length - 1])).toBeLessThan(1e-6);
  });

  it('leaves the end of a short recording alone', () => {
    const source = recording(1);
    const ir = prepareIr(source);
    expect(ir.left.length).toBe(source.left.length);
    // Ensure we compare against the same recording with a much longer maxSeconds to prove it wasn't faded.
    const irLonger = prepareIr(source, 100);
    expect(ir.left[ir.left.length - 1]).toBe(irLonger.left[irLonger.left.length - 1]);
    expect(Math.abs(ir.left[ir.left.length - 1])).toBeGreaterThan(1e-6); // not faded: a fade would end at exactly zero
    expect(Math.abs(ir.right[ir.right.length - 1])).toBeGreaterThan(1e-6); // not faded: a fade would end at exactly zero
  });

  it('does not change the recording it was given', () => {
    const source = recording(1, 0.01);
    const copy = Float32Array.from(source.left);
    prepareIr(source);
    expect(source.left).toEqual(copy);
  });

  it('refuses a silent recording', () => {
    const silent: StereoIr = { left: new Float32Array(1000), right: new Float32Array(1000), sampleRate: RATE };
    expect(() => prepareIr(silent)).toThrow('This recording is silent.');
  });
});
