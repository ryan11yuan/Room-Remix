import { describe, expect, it } from 'vitest';
import type { Dims, RoomObject } from '@/lib/room/types';
import type { Pose } from './geometry';
import { arrivalLine, countWords, distanceWords, introLine, listWords, roomSizeWords, targetLine } from './words';

const room: Dims = { length: 4.6, width: 3.3, height: 2.4 };
const box = (label: RoomObject['label'], x0: number, z0: number, x1: number, z1: number): RoomObject => ({
  label, min: { x: x0, y: 0, z: z0 }, max: { x: x1, y: 1, z: z1 },
});
const pose: Pose = { x: 2, z: 2, heading: 0 };
const door = box('door', 0, 1.55, 0.1, 2.45); // on the wall behind you

describe('words', () => {
  it('rounds distances: under a metre, half metres under 3 m, whole metres above', () => {
    expect(distanceWords(0.99)).toBe('less than a metre');
    expect(distanceWords(1)).toBe('about 1 metre');
    expect(distanceWords(1.3)).toBe('about 1.5 metres');
    expect(distanceWords(2.99)).toBe('about 3 metres');
    expect(distanceWords(3)).toBe('about 3 metres');
    expect(distanceWords(4.4)).toBe('about 4 metres');
  });

  it('says the room size in whole metres and joins lists naturally', () => {
    expect(roomSizeWords(room)).toBe('about 5 by 3 metres');
    expect(listWords([])).toBe('');
    expect(listWords(['a'])).toBe('a');
    expect(listWords(['a', 'b'])).toBe('a and b');
    expect(listWords(['a', 'b', 'c'])).toBe('a, b and c');
  });

  it("counts objects in the spec's name order", () => {
    const objects = [box('tv', 0, 0, 1, 1), box('chair', 0, 0, 1, 1), box('door', 0, 0, 1, 1), box('chair', 2, 2, 3, 3), box('stairs', 0, 0, 1, 1)];
    expect(countWords(objects)).toBe('1 door, 1 staircase, 2 chairs and 1 TV');
  });

  it('introduces the room, and where the nearest door is when there is one', () => {
    expect(introLine(room, [door], pose)).toBe(
      "A room about 5 by 3 metres, with 1 door. You're at the starting point. The nearest door is at 6 o'clock, about 2 metres. Press H for help.",
    );
    expect(introLine(room, [], pose)).toBe("A room about 5 by 3 metres, with nothing found yet. You're at the starting point. Press H for help.");
  });

  it('names a target with its clock hour and distance, and says when you arrive', () => {
    expect(targetLine(box('table', 1.5, 3.3, 2.5, 4), pose)).toBe("Table, 3 o'clock, about 1.5 metres.");
    expect(arrivalLine(box('tv', 0, 0, 1, 1))).toBe("You're at the TV.");
    expect(arrivalLine(door)).toBe("You're at the door.");
  });
});
