import { describe, expect, it } from 'vitest';
import type { RoomObject } from '@/lib/room/types';
import type { Pose } from './geometry';
import { scanItems, targetOrder } from './scan';

/** A 0.4 m box centred on (x, z). */
const at = (label: RoomObject['label'], x: number, z: number): RoomObject => ({
  label, min: { x: x - 0.2, y: 0, z: z - 0.2 }, max: { x: x + 0.2, y: 1, z: z + 0.2 },
});
const pose: Pose = { x: 2, z: 2, heading: 0 }; // facing +x; +z is to the right

describe('scanItems', () => {
  it('goes clockwise from straight ahead, grouping same-name objects within 1.5 m', () => {
    const items = scanItems([at('door', 2, 0.3), at('chair', 3, 2.1), at('table', 2, 3.5), at('chair', 3.5, 2.5)], pose);
    expect(items.map((i) => [i.clip, i.caption])).toEqual([['chairs', 'Chairs'], ['table', 'Table'], ['door', 'Door']]);
    expect(items[0].at.x).toBeCloseTo(3.25, 10); // the group speaks from the mean of its centres
    expect(items[0].at.z).toBeCloseTo(2.3, 10);
  });

  it('chains a group through its neighbours, and never groups different names', () => {
    const items = scanItems([at('chair', 3, 2), at('chair', 4.2, 2), at('chair', 5.4, 2), at('sofa', 3, 2.5)], pose);
    expect(items.map((i) => i.clip).sort()).toEqual(['chairs', 'sofa']);
  });

  it('says the singular for one object and puts something just left of ahead last', () => {
    const items = scanItems([at('plant', 5, 1.999), at('tv', 2, 4)], pose);
    expect(items.map((i) => i.clip)).toEqual(['tv', 'plant']);
    expect(items[0].caption).toBe('TV');
  });
});

describe('targetOrder', () => {
  it('offers the nearest of each name: door first, stairs second, then by distance', () => {
    const objects = [at('chair', 2.5, 2), at('chair', 4, 2), at('stairs', 4.5, 3.5), at('table', 3, 3), at('door', 0.3, 0.3)];
    expect(targetOrder(objects, pose)).toEqual([4, 2, 0, 3]);
  });

  it('is empty when nothing was found', () => {
    expect(targetOrder([], pose)).toEqual([]);
  });
});
