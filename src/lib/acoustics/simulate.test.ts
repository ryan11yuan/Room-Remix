import { describe, expect, it } from 'vitest';
import { defaultRoom } from '@/lib/room/roomState';
import type { RoomState } from '@/lib/room/types';
import { MAX_IR_SECONDS, simulateBoth, simulateRoom, withoutFixes, type StereoIr } from './simulate';

const FS = 16000;

const energy = (ch: Float32Array, from: number, to: number) => {
  let e = 0;
  for (let i = from; i < Math.min(to, ch.length); i++) e += ch[i] * ch[i];
  return e;
};

/** First sample whose |L|+|R| reaches half the largest value in the window: the direct sound's onset. */
const onsetIndex = (ir: StereoIr, upTo: number) => {
  const level = (i: number) => Math.abs(ir.left[i]) + Math.abs(ir.right[i]);
  let max = 0;
  for (let i = 0; i < upTo; i++) max = Math.max(max, level(i));
  for (let i = 0; i < upTo; i++) if (level(i) >= 0.5 * max) return i;
  return -1;
};

const directSamples = (room: RoomState, fs: number) =>
  (Math.hypot(room.speaker.x - room.listener.x, room.speaker.y - room.listener.y, room.speaker.z - room.listener.z) /
    343) *
  fs;

const withLargeRug = (on = true): RoomState => ({
  ...defaultRoom(),
  fixes: [{ kind: 'rug', size: 'L', x: 2, z: 1.75, on }],
});

describe('simulateRoom', () => {
  it('returns a finite stereo IR at the requested sample rate', () => {
    const { ir } = simulateRoom(defaultRoom(), FS);
    expect(ir.sampleRate).toBe(FS);
    expect(ir.left.length).toBe(ir.right.length);
    expect(ir.left.length).toBeLessThanOrEqual(MAX_IR_SECONDS * FS);
    expect(ir.left.every(Number.isFinite) && ir.right.every(Number.isFinite)).toBe(true);
  });

  it('puts the direct sound at distance / c', () => {
    const room = defaultRoom();
    const { ir } = simulateRoom(room, FS);
    expect(Math.abs(onsetIndex(ir, 0.02 * FS) - directSamples(room, FS))).toBeLessThanOrEqual(1);
  });

  it('scales timing with the sample rate (44.1 kHz)', () => {
    const room = defaultRoom();
    const { ir } = simulateRoom(room, 44100);
    expect(Math.abs(onsetIndex(ir, 0.02 * 44100) - directSamples(room, 44100))).toBeLessThanOrEqual(1);
  });

  it('is louder in the right ear when the speaker is on the right', () => {
    const room: RoomState = {
      ...defaultRoom(),
      listener: { x: 2, y: 1.1, z: 1.2, yaw: 0 },
      speaker: { x: 2, y: 1.1, z: 2.4 },
    };
    const { ir } = simulateRoom(room, FS);
    const window = 0.01 * FS;
    expect(energy(ir.right, 0, window)).toBeGreaterThan(2 * energy(ir.left, 0, window));
  });

  it('rings longer in a bare room than a fully furnished one', () => {
    const bare = simulateRoom({ ...defaultRoom(), furnishing: 'bare' }, FS);
    const full = simulateRoom({ ...defaultRoom(), furnishing: 'full' }, FS);
    const from = 0.1 * FS;
    expect(bare.rt60.mid).toBeGreaterThan(full.rt60.mid);
    expect(energy(bare.ir.left, from, Infinity)).toBeGreaterThan(2 * energy(full.ir.left, from, Infinity));
  });

  it('shortens RT60 when the calibration factor doubles absorption', () => {
    const base = simulateRoom(defaultRoom(), FS).rt60.mid;
    const calibrated = simulateRoom({ ...defaultRoom(), calibration: { factor: 2 } }, FS).rt60.mid;
    expect(calibrated).toBeLessThan(0.55 * base);
  });

  it('lets calibration change the early reflections, not just the tail', () => {
    const early = (factor: number) => {
      const room: RoomState = { ...defaultRoom(), calibration: { factor } };
      const { ir } = simulateRoom(room, FS);
      const from = Math.ceil((directSamples(room, FS) / FS + 0.002) * FS);
      return energy(ir.left, from, 0.05 * FS) + energy(ir.right, from, 0.05 * FS);
    };
    expect(early(2)).toBeLessThan(0.8 * early(1));
  });

  it('lets furnishing change the early reflections, not just the tail', () => {
    const early = (furnishing: RoomState['furnishing']) => {
      const room: RoomState = { ...defaultRoom(), furnishing };
      const { ir } = simulateRoom(room, FS);
      const from = Math.ceil((directSamples(room, FS) / FS + 0.002) * FS);
      return energy(ir.left, from, 0.05 * FS) + energy(ir.right, from, 0.05 * FS);
    };
    expect(early('full')).toBeLessThan(early('bare'));
  });

  it('returns at most 200 ray paths, strongest first, starting with the direct path', () => {
    const { paths } = simulateRoom(defaultRoom(), FS);
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.length).toBeLessThanOrEqual(200);
    expect(paths[0].points).toHaveLength(2);
    for (let i = 1; i < paths.length; i++) expect(paths[i].energy).toBeLessThanOrEqual(paths[i - 1].energy);
  });

  it('caps huge reverberant rooms at 4 s with finite samples', () => {
    const room: RoomState = {
      ...defaultRoom(),
      dims: { length: 30, width: 30, height: 15 },
      surfaces: {
        floor: 'concrete',
        ceiling: 'concrete',
        wallX0: 'concrete',
        wallX1: 'concrete',
        wallZ0: 'concrete',
        wallZ1: 'concrete',
      },
      furnishing: 'bare',
      speaker: { x: 5, y: 1.5, z: 10 },
      listener: { x: 20, y: 1.2, z: 15, yaw: 'faceSpeaker' },
    };
    const { ir, rt60 } = simulateRoom(room, FS);
    expect(rt60.mid).toBeGreaterThan(3);
    expect(ir.left.length).toBe(MAX_IR_SECONDS * FS);
    expect(ir.left.every(Number.isFinite)).toBe(true);
  });

  it('stays finite in an over-absorbed room', () => {
    const room: RoomState = {
      ...defaultRoom(),
      surfaces: {
        floor: 'acousticPanel',
        ceiling: 'acousticPanel',
        wallX0: 'acousticPanel',
        wallX1: 'acousticPanel',
        wallZ0: 'acousticPanel',
        wallZ1: 'acousticPanel',
      },
      furnishing: 'full',
      calibration: { factor: 10 },
    };
    const { ir, rt60 } = simulateRoom(room, FS);
    expect(rt60.mid).toBeGreaterThan(0);
    expect(Number.isFinite(rt60.mid)).toBe(true);
    expect(ir.left.every(Number.isFinite)).toBe(true);
  });
});

describe('simulateBoth', () => {
  it('ignores fixes in "now" and applies switched-on fixes in "withFixes"', () => {
    const room = withLargeRug();
    const { now, withFixes } = simulateBoth(room, FS);
    expect(now.rt60.mid).toBeCloseTo(simulateRoom(withoutFixes(room), FS).rt60.mid, 12);
    expect(withFixes.rt60.mid).toBeLessThan(now.rt60.mid);
  });

  it('gives identical results when the fix is switched off', () => {
    const { now, withFixes } = simulateBoth(withLargeRug(false), FS);
    expect(withFixes.rt60.mid).toBeCloseTo(now.rt60.mid, 12);
  });
});

describe('simulateRoom capping', () => {
  it('fades out an impulse response that the length cap cut short', () => {
    // A bare tiled room rings for longer than the cap.
    const room = defaultRoom();
    const bare: RoomState = {
      ...room,
      dims: { length: 12, width: 9, height: 4 },
      furnishing: 'bare',
      surfaces: { floor: 'tile', ceiling: 'concrete', wallX0: 'concrete', wallX1: 'concrete', wallZ0: 'concrete', wallZ1: 'concrete' },
      speaker: { x: 2, y: 1.2, z: 3 },
      listener: { x: 8, y: 1.2, z: 5, yaw: 'faceSpeaker' },
    };
    const { ir } = simulateRoom(bare, 48000);
    expect(ir.left.length).toBe(Math.ceil(MAX_IR_SECONDS * 48000));
    expect(Math.abs(ir.left[ir.left.length - 1])).toBeLessThan(1e-6);
    expect(Math.abs(ir.right[ir.right.length - 1])).toBeLessThan(1e-6);

    // the fade covers the last 0.1 s, not just the last sample
    const fs = 48000;
    const fadeDuration = 0.1;
    const samplesBefore5ms = Math.round(0.005 * fs);
    const samplesBeforeFade = Math.round(fadeDuration * fs);
    const beforeFadeStart = ir.left.length - samplesBeforeFade - samplesBefore5ms;
    const beforeFadeEnd = ir.left.length - samplesBeforeFade;
    const fadeEnd = ir.left.length;
    const lastStart = ir.left.length - samplesBefore5ms;

    // RMS of 5 ms before the fade starts
    let beforeRms = 0;
    for (let i = beforeFadeStart; i < beforeFadeEnd; i++) beforeRms += ir.left[i] * ir.left[i];
    beforeRms = Math.sqrt(beforeRms / (beforeFadeEnd - beforeFadeStart));
    expect(beforeRms).toBeGreaterThan(0); // tail was still ringing

    // RMS of the last 5 ms (mostly faded)
    let lastRms = 0;
    for (let i = lastStart; i < fadeEnd; i++) lastRms += ir.left[i] * ir.left[i];
    lastRms = Math.sqrt(lastRms / (fadeEnd - lastStart));
    expect(lastRms).toBeLessThan(0.2 * beforeRms); // fade is substantial over the 0.1 s window

    // Same checks for right channel
    beforeRms = 0;
    for (let i = beforeFadeStart; i < beforeFadeEnd; i++) beforeRms += ir.right[i] * ir.right[i];
    beforeRms = Math.sqrt(beforeRms / (beforeFadeEnd - beforeFadeStart));
    expect(beforeRms).toBeGreaterThan(0);

    lastRms = 0;
    for (let i = lastStart; i < fadeEnd; i++) lastRms += ir.right[i] * ir.right[i];
    lastRms = Math.sqrt(lastRms / (fadeEnd - lastStart));
    expect(lastRms).toBeLessThan(0.2 * beforeRms);
  });
});
