import { describe, expect, it } from 'vitest';
import type { RoomObject, RoomState } from '@/lib/room/types';
import { absorptionArea, makeSurfaceLookup } from './absorption';
import { computeImageSources } from './imageSource';
import { blockingBoxes, OBJECT_INFO, objectAbsorption, OCCLUSION_DB, segmentHitsBox } from './objects';

const room: RoomState = {
  v: 1,
  name: 't',
  dims: { length: 6, width: 4, height: 2.7 },
  surfaces: { floor: 'carpet', ceiling: 'plaster', wallX0: 'drywall', wallX1: 'drywall', wallZ0: 'drywall', wallZ1: 'drywall' },
  furnishing: 'bare',
  speaker: { x: 1, y: 1, z: 2 },
  listener: { x: 5, y: 1.2, z: 2, yaw: 0 },
  fixes: [],
  calibration: { factor: 1 },
};
const chair: RoomObject = { label: 'chair', min: { x: 2, y: 0, z: 1 }, max: { x: 2.6, y: 1, z: 1.6 } };
const whiteboard: RoomObject = { label: 'whiteboard', min: { x: 3, y: 0, z: 1 }, max: { x: 3.1, y: 2, z: 3 } };

describe('objects', () => {
  it('soft things absorb, hard things reflect, tall hard things block', () => {
    expect(OBJECT_INFO.chair).toMatchObject({ absorbs: true, blocks: false });
    expect(OBJECT_INFO.whiteboard).toMatchObject({ absorbs: false, blocks: true });
    expect(blockingBoxes([chair, whiteboard])).toEqual([{ min: whiteboard.min, max: whiteboard.max }]);
    expect(blockingBoxes(undefined)).toEqual([]);
  });

  it('adds each object to the room absorption', () => {
    const without = absorptionArea(room);
    const withObjects = absorptionArea({ ...room, objects: [chair, whiteboard] });
    const added = [chair, whiteboard].map(objectAbsorption);
    withObjects.forEach((a, b) => expect(a).toBeCloseTo(without[b] + added[0][b] + added[1][b], 9));
    expect(added[0].every((a) => a > 0)).toBe(true);
  });

  it('a whiteboard is sized by its face: 2 m × 2 m reflects more area than a 1 m one', () => {
    const small = { ...whiteboard, max: { ...whiteboard.max, z: 2 } };
    expect(objectAbsorption(whiteboard)[3]).toBeGreaterThan(objectAbsorption(small)[3]);
  });

  it('segmentHitsBox', () => {
    const box = { min: { x: 1, y: 0, z: 1 }, max: { x: 2, y: 2, z: 2 } };
    expect(segmentHitsBox({ x: 0, y: 1, z: 1.5 }, { x: 3, y: 1, z: 1.5 }, box)).toBe(true);
    expect(segmentHitsBox({ x: 0, y: 3, z: 1.5 }, { x: 3, y: 3, z: 1.5 }, box)).toBe(false); // passes over it
    expect(segmentHitsBox({ x: 0, y: 1, z: 1.5 }, { x: 0.9, y: 1, z: 1.5 }, box)).toBe(false); // stops short
  });

  it('a blocker dims only the direct sound, more at high frequencies', () => {
    const input = { dims: room.dims, source: room.speaker, listener: room.listener, maxOrder: 1, lookup: makeSurfaceLookup(room) };
    const open = computeImageSources(input);
    const blocked = computeImageSources({ ...input, blockers: blockingBoxes([whiteboard]) });
    const direct = (list: typeof open) => list.find((a) => a.order === 0)!;
    direct(blocked).gains.forEach((g, b) => expect(g).toBeCloseTo(direct(open).gains[b] * 10 ** (-OCCLUSION_DB[b] / 20), 12));
    const ceiling = (list: typeof open) => list.find((a) => a.order === 1 && a.hitSurfaces[0] === 'ceiling')!;
    expect(ceiling(blocked).gains).toEqual(ceiling(open).gains);
  });
});
