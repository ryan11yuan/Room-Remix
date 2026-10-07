import { describe, expect, it } from 'vitest';
import type { RoomObject } from '@/lib/room/types';
import { findBestSpots, scoreSpeakerAt } from './bestSpot';
import { soundRoom } from './soundRoom';

const dims = { length: 6, width: 4, height: 2.7 };
const room = (objects: RoomObject[] = []) => soundRoom(dims, objects, { x: 3, y: 1, z: 2 }, { x: 1, y: 1.2, z: 1, yaw: 0 });

describe('best speaker spot', () => {
  it('a corner scores below the middle of the room and the middle of a long wall', () => {
    const corner = scoreSpeakerAt(room(), { x: 0.5, y: 1, z: 0.5 })!;
    expect(corner).toBeLessThan(scoreSpeakerAt(room(), { x: 3, y: 1, z: 2 })!);
    expect(corner).toBeLessThan(scoreSpeakerAt(room(), { x: 3, y: 1, z: 0.5 })!);
  });

  it('a speaker behind a whiteboard scores lower than without it', () => {
    const whiteboard: RoomObject = { label: 'whiteboard', min: { x: 1.0, y: 0, z: 0.5 }, max: { x: 1.1, y: 2, z: 3.5 } };
    const spot = { x: 0.6, y: 1, z: 2 };
    expect(scoreSpeakerAt(room([whiteboard]), spot)!).toBeLessThan(scoreSpeakerAt(room(), spot)!);
  });

  it('maps the floor: cells on furniture are left out, the best is the top score, scores are 0–100', () => {
    const table: RoomObject = { label: 'table', min: { x: 2, y: 0, z: 1.5 }, max: { x: 4, y: 0.75, z: 2.5 } };
    const map = findBestSpots(room([table]));
    expect(map.nx * map.nz).toBe(map.scores.length);
    const at = (x: number, z: number) => map.scores[Math.round((z - map.z0) / map.step) * map.nx + Math.round((x - map.x0) / map.step)];
    expect(at(2.9, 2.1)).toBeNull(); // on the table
    const numbers = map.scores.filter((s): s is number => s !== null);
    expect(Math.max(...numbers)).toBe(map.best!.score);
    for (const s of numbers) expect(s).toBeGreaterThanOrEqual(0), expect(s).toBeLessThanOrEqual(100);
  });
});
