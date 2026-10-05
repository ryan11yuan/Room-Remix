import { describe, expect, it } from 'vitest';
import { defaultRoom } from '@/lib/room/roomState';
import type { RoomState } from '@/lib/room/types';
import { computeRayPaths, MAX_RAYS } from './rays';

const withRug = (on = true): RoomState => ({ ...defaultRoom(), fixes: [{ kind: 'rug', size: 'L', x: 2, z: 1.75, on }] });

describe('computeRayPaths', () => {
  it('returns every image up to order 4, strongest first, direct path first', () => {
    const paths = computeRayPaths(defaultRoom());
    expect(paths).toHaveLength(129); // (2N+1)(2N²+2N+3)/3 for N = 4, under the 150 cap
    expect(paths.length).toBeLessThanOrEqual(MAX_RAYS);
    expect(paths[0].points).toHaveLength(2);
    expect(paths[0].vertexEnergy).toEqual([1, 1]);
    expect(paths[0].hitFix).toEqual([]);
    for (let i = 1; i < paths.length; i++) expect(paths[i].energy).toBeLessThanOrEqual(paths[i - 1].energy);
  });

  it('keeps per-point arrays aligned and never lets energy rise along a path', () => {
    for (const p of computeRayPaths(withRug())) {
      expect(p.vertexEnergy).toHaveLength(p.points.length);
      expect(p.hitFix).toHaveLength(p.points.length - 2);
      for (let i = 1; i < p.vertexEnergy.length; i++) expect(p.vertexEnergy[i]).toBeLessThanOrEqual(p.vertexEnergy[i - 1]);
    }
  });

  it('dims a path at the bounce where it lands on the rug', () => {
    // In the default room the floor bounce lands at about (1.74, 0, 1.64), inside a large centred rug.
    const floorBounce = (room: RoomState) =>
      computeRayPaths(room, 1).find((p) => p.points.length === 3 && p.points[1].y === 0)!;
    const onRug = floorBounce(withRug(true));
    const offRug = floorBounce(withRug(false));
    expect(onRug.hitFix).toEqual([true]);
    expect(offRug.hitFix).toEqual([false]);
    expect(onRug.vertexEnergy[1]).toBeLessThan(offRug.vertexEnergy[1]);
  });

  it('respects the order limit', () => {
    for (const p of computeRayPaths(defaultRoom(), 2)) expect(p.points.length).toBeLessThanOrEqual(4);
  });

  it('returns no paths for an invalid room instead of throwing', () => {
    const room = defaultRoom();
    expect(computeRayPaths({ ...room, listener: { ...room.listener, ...room.speaker } })).toEqual([]);
  });
});
