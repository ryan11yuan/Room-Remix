import { describe, expect, it } from 'vitest';
import { AIR_M } from './bands';
import { eyring, midRt60, roomVolume, sabine, totalSurfaceArea } from './reverbTime';

const noAir = [0, 0, 0, 0, 0, 0];
const flat = (v: number) => [v, v, v, v, v, v];

describe('reverb time', () => {
  it('computes volume and surface area', () => {
    const dims = { length: 4, width: 3.5, height: 2.6 };
    expect(roomVolume(dims)).toBeCloseTo(36.4, 9);
    expect(totalSurfaceArea(dims)).toBeCloseTo(67, 9);
  });

  it('matches the Sabine formula', () => {
    expect(sabine(100, flat(10), noAir)[0]).toBeCloseTo(1.61, 9);
  });

  it('matches the Eyring formula', () => {
    // 0.161 × 100 / (−130 × ln 0.9) = 1.175451
    expect(eyring(100, 130, flat(13), noAir)[0]).toBeCloseTo(1.17545, 4);
  });

  it('gives shorter times with Eyring than Sabine', () => {
    expect(eyring(100, 130, flat(30), noAir)[0]).toBeLessThan(sabine(100, flat(30), noAir)[0]);
  });

  it('shortens high bands with air absorption', () => {
    expect(eyring(1000, 600, flat(60), AIR_M)[5]).toBeLessThan(eyring(1000, 600, flat(60), noAir)[5]);
  });

  it('stays finite and positive when absorption exceeds the surface area', () => {
    const rt = eyring(100, 130, flat(500));
    for (const t of rt) {
      expect(Number.isFinite(t)).toBe(true);
      expect(t).toBeGreaterThan(0);
    }
  });

  it('averages the 500 Hz and 1 kHz bands for the mid value', () => {
    expect(midRt60([1, 1, 0.4, 0.6, 1, 1])).toBeCloseTo(0.5, 9);
  });
});
