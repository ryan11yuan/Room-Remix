import { describe, expect, it } from 'vitest';
import { CLIP_SECONDS, DEMO_CLIPS, synthClip } from './demoClips';

const peakOf = (samples: Float32Array) => samples.reduce((peak, v) => Math.max(peak, Math.abs(v)), 0);
const energy = (samples: Float32Array, from: number, to: number) => {
  let sum = 0;
  for (let i = from; i < to; i++) sum += samples[i] * samples[i];
  return sum / (to - from);
};

describe('synthClip', () => {
  it('lists a drum loop and a guitar riff', () => {
    expect(DEMO_CLIPS.map((c) => c.id)).toEqual(['drums', 'guitar']);
  });

  for (const { id } of DEMO_CLIPS) {
    it(`makes ${id} the right length for the sample rate, at a safe level`, () => {
      for (const rate of [44100, 48000]) {
        const clip = synthClip(id, rate);
        expect(clip.length).toBe(Math.round(CLIP_SECONDS * rate));
        expect(peakOf(clip)).toBeCloseTo(0.8, 5);
        expect(clip.every(Number.isFinite)).toBe(true);
      }
    });

    it(`makes ${id} the same every time`, () => {
      expect(synthClip(id, 48000)).toEqual(synthClip(id, 48000));
    });

    it(`fills ${id} with sound from start to end`, () => {
      const clip = synthClip(id, 48000);
      const quarter = clip.length / 4;
      for (let q = 0; q < 4; q++) expect(energy(clip, Math.floor(q * quarter), Math.floor((q + 1) * quarter))).toBeGreaterThan(1e-4);
    });
  }

  it('makes two different clips', () => {
    expect(synthClip('drums', 48000)).not.toEqual(synthClip('guitar', 48000));
  });

  it('starts the drum loop on a hit, so a room has something to answer at once', () => {
    const clip = synthClip('drums', 48000);
    expect(energy(clip, 0, 2400)).toBeGreaterThan(energy(clip, 12000, 14400));
  });
});
