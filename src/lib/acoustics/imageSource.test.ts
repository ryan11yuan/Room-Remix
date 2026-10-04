import { describe, expect, it } from 'vitest';
import type { SurfaceId, Vec3 } from '@/lib/room/types';
import { computeImageSources, pathEnergy } from './imageSource';

const dims = { length: 4, width: 3, height: 2.5 };
const source = { x: 1, y: 1, z: 1 };
const listener = { x: 3, y: 1, z: 1 };
const flat = (v: number) => [v, v, v, v, v, v];
const plain = () => ({ alpha: flat(0.2), fix: false });
const noAir = flat(0);

describe('computeImageSources', () => {
  it('returns the expected number of images for an order', () => {
    // integer points with |x| + |y| + |z| ≤ 3: (2N+1)(2N²+2N+3)/3 = 63
    expect(computeImageSources({ dims, source, listener, maxOrder: 3, lookup: plain })).toHaveLength(63);
  });

  it('includes the direct path', () => {
    const direct = computeImageSources({ dims, source, listener, maxOrder: 1, lookup: plain, air: noAir }).find(
      (a) => a.order === 0,
    )!;
    expect(direct.distance).toBeCloseTo(2, 9);
    expect(direct.delay).toBeCloseTo(2 / 343, 12);
    expect(direct.gains[0]).toBeCloseTo(0.5, 9);
    expect(direct.points).toEqual([source, listener]);
    expect(direct.direction).toEqual({ x: -1, y: 0, z: 0 });
  });

  it('finds the floor bounce point and applies the reflection coefficient', () => {
    const floor = computeImageSources({ dims, source, listener, maxOrder: 1, lookup: plain, air: noAir }).find(
      (a) => a.hitSurfaces.join() === 'floor',
    )!;
    expect(floor.image).toEqual({ x: 1, y: -1, z: 1 });
    expect(floor.points[1].x).toBeCloseTo(2, 9);
    expect(floor.points[1].y).toBe(0);
    expect(floor.points[1].z).toBeCloseTo(1, 9);
    expect(floor.reflection[0]).toBeCloseTo(Math.sqrt(0.8), 12);
    expect(floor.distance).toBeCloseTo(Math.hypot(2, 2), 9);
  });

  it('orders bounce points from the source to the listener', () => {
    const arrival = computeImageSources({ dims, source, listener, maxOrder: 2, lookup: plain }).find(
      (a) => a.hitSurfaces.join() === 'wallX0,wallX1',
    )!;
    // source → wall at x = 0 → wall at x = length → listener
    expect(arrival.points[1].x).toBe(0);
    expect(arrival.points[2].x).toBe(4);
  });

  it('flags paths that bounce off a fix and uses its absorption', () => {
    const lookup = (surface: SurfaceId, p: Vec3) =>
      surface === 'floor' && p.x > 1.5 && p.x < 2.5 ? { alpha: flat(0.6), fix: true } : plain();
    const arrivals = computeImageSources({ dims, source, listener, maxOrder: 1, lookup });
    const floor = arrivals.find((a) => a.hitSurfaces.join() === 'floor')!;
    const ceiling = arrivals.find((a) => a.hitSurfaces.join() === 'ceiling')!;
    expect(floor.hitFixes).toBe(true);
    expect(floor.reflection[0]).toBeCloseTo(Math.sqrt(0.4), 12);
    expect(ceiling.hitFixes).toBe(false);
  });

  it('measures path energy as the mean squared band gain', () => {
    const direct = computeImageSources({ dims, source, listener, maxOrder: 0, lookup: plain, air: noAir })[0];
    expect(pathEnergy(direct)).toBeCloseTo(0.25, 9);
  });
});
