import { describe, expect, it } from 'vitest';
import type { RoomObject } from '@/lib/room/types';
import { addObject, defaultBox, MAX_CHECKED, readChecked, removeObject, renameObject, sortObjects } from './checked';

const box = (label: RoomObject['label'], x0: number, z0: number, x1: number, z1: number): RoomObject => ({
  label, min: { x: x0, y: 0, z: z0 }, max: { x: x1, y: 1, z: z1 },
});

describe('readChecked', () => {
  it('accepts a valid list and keeps only label, min and max', () => {
    const data = { objects: [{ ...box('door', 0, 1, 0.1, 2), extra: 1 }] };
    expect(readChecked(data)).toEqual([box('door', 0, 1, 0.1, 2)]);
    expect(readChecked({ objects: [] })).toEqual([]);
  });

  it('refuses anything wrong', () => {
    expect(readChecked(null)).toBeNull();
    expect(readChecked({})).toBeNull();
    expect(readChecked({ objects: 'x' })).toBeNull();
    expect(readChecked({ objects: [{ ...box('door', 0, 1, 0.1, 2), label: 'lamp' }] })).toBeNull();
    expect(readChecked({ objects: [{ ...box('door', 0, 1, 0.1, 2), min: { x: '0', y: 0, z: 1 } }] })).toBeNull();
    expect(readChecked({ objects: [{ ...box('door', 0, 1, 0.1, 2), max: { x: Infinity, y: 2, z: 2 } }] })).toBeNull();
    expect(readChecked({ objects: [box('door', 1, 1, 0.5, 2)] })).toBeNull(); // min.x > max.x
    expect(readChecked({ objects: Array.from({ length: MAX_CHECKED + 1 }, () => box('chair', 0, 0, 1, 1)) })).toBeNull();
  });
});

describe('sortObjects', () => {
  it("orders by the spec's name order, then along the length, then the width", () => {
    const sorted = sortObjects([box('chair', 3, 0, 4, 1), box('door', 0, 0, 1, 1), box('chair', 1, 2, 2, 3), box('chair', 1, 0, 2, 1)]);
    expect(sorted).toEqual([box('door', 0, 0, 1, 1), box('chair', 1, 0, 2, 1), box('chair', 1, 2, 2, 3), box('chair', 3, 0, 4, 1)]);
  });
});

describe('adding, renaming and removing', () => {
  const ROOM = { length: 5, width: 4, height: 2.5 };

  it('adds a door-sized box on the floor point and says where it landed in the list', () => {
    expect(defaultBox('door', { x: 2, z: 3 })).toEqual({ label: 'door', min: { x: 1.55, y: 0, z: 2.95 }, max: { x: 2.45, y: 2, z: 3.05 } });
    const { objects, index } = addObject([box('chair', 0, 0, 1, 1)], 'door', { x: 2, z: 3 }, ROOM);
    expect(index).toBe(0); // doors list first
    expect(objects[1].label).toBe('chair');
  });

  it('resizes a just-added box when renamed, but keeps a found box as it is', () => {
    const added = addObject([], 'door', { x: 2, z: 3 }, ROOM).objects;
    const renamed = renameObject(added, 0, 'table').objects[0];
    expect(renamed).toEqual(defaultBox('table', { x: 2, z: 3 }));
    const found = renameObject([box('whiteboard', 0, 1, 0.1, 2)], 0, 'tv');
    expect(found.objects).toEqual([box('tv', 0, 1, 0.1, 2)]);
    expect(found.index).toBe(0);
  });

  it('clamps an added centre into the room, leaving a click inside as it is', () => {
    const centre = (o: RoomObject) => ({ x: (o.min.x + o.max.x) / 2, z: (o.min.z + o.max.z) / 2 });
    expect(centre(addObject([], 'door', { x: 2, z: -1.1 }, ROOM).objects[0])).toEqual({ x: 2, z: 0 });
    expect(centre(addObject([], 'door', { x: 9, z: 7 }, ROOM).objects[0])).toEqual({ x: 5, z: 4 });
    expect(centre(addObject([], 'door', { x: -3, z: 1 }, ROOM).objects[0])).toEqual({ x: 0, z: 1 });
    expect(addObject([], 'door', { x: 2, z: 3 }, ROOM).objects[0]).toEqual(defaultBox('door', { x: 2, z: 3 }));
  });

  it('removes one object', () => {
    expect(removeObject([box('door', 0, 0, 1, 1), box('chair', 1, 0, 2, 1)], 0)).toEqual([box('chair', 1, 0, 2, 1)]);
  });
});
