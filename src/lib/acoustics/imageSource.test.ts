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
    // image x = 2·4 + 1 = 9: source → wall at x = 0 → wall at x = length → listener
    const arrival = computeImageSources({ dims, source, listener, maxOrder: 2, lookup: plain }).find(
      (a) => a.order === 2 && a.image.x === 9,
    )!;
    expect(arrival.hitSurfaces).toEqual(['wallX0', 'wallX1']);
    expect(arrival.points[1].x).toBe(0);
    expect(arrival.points[2].x).toBe(4);
  });

  it('builds every path as a polyline of the arrival distance ending in the arrival direction', () => {
    const src = { x: 0.7, y: 1.3, z: 2.1 };
    const lis = { x: 3.2, y: 0.9, z: 0.6 };
    const arrivals = computeImageSources({ dims, source: src, listener: lis, maxOrder: 4, lookup: plain });
    for (const a of arrivals) {
      expect(a.points).toHaveLength(a.order + 2);
      expect(a.hitSurfaces).toHaveLength(a.order);
      let length = 0;
      for (let i = 1; i < a.points.length; i++) {
        const p = a.points[i - 1];
        const q = a.points[i];
        length += Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z);
      }
      expect(length).toBeCloseTo(a.distance, 9);
      const last = a.points[a.points.length - 2];
      const d = Math.hypot(last.x - lis.x, last.y - lis.y, last.z - lis.z);
      expect(a.direction.x).toBeCloseTo((last.x - lis.x) / d, 9);
      expect(a.direction.y).toBeCloseTo((last.y - lis.y) / d, 9);
      expect(a.direction.z).toBeCloseTo((last.z - lis.z) / d, 9);
    }
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
