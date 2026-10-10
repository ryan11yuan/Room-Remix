import { describe, expect, it } from 'vitest';
import type { Dims, RoomObject } from '@/lib/room/types';
import { clampToRoom, step, turn, TURN } from './walk';

const room: Dims = { length: 5, width: 4, height: 2.7 };
const box = (label: RoomObject['label'], x0: number, z0: number, x1: number, z1: number): RoomObject => ({
  label, min: { x: x0, y: 0, z: z0 }, max: { x: x1, y: 1, z: z1 },
});
const table = box('table', 3, 1.5, 4, 2.5);

describe('turn', () => {
  it('turns one clock hour right or left, wrapping round', () => {
    expect(turn({ x: 1, z: 1, heading: 0 }, 1).heading).toBeCloseTo(TURN, 10);
    expect(turn({ x: 1, z: 1, heading: 0 }, -1).heading).toBeCloseTo(-TURN, 10);
    expect(turn({ x: 1, z: 1, heading: Math.PI }, 1).heading).toBeCloseTo(-Math.PI + TURN, 10);
  });
});

describe('step', () => {
  it('moves half a metre forward or back along the heading', () => {
    expect(step(room, [], { x: 2, z: 2, heading: 0 }, 1)).toEqual({ ok: true, pose: { x: 2.5, z: 2, heading: 0 } });
    const back = step(room, [], { x: 2, z: 2, heading: Math.PI / 2 }, -1);
    expect(back.ok && back.pose.z).toBeCloseTo(1.5, 10);
  });

  it('stops 0.3 m short of a wall and reports the wall point nearest you', () => {
    expect(step(room, [], { x: 4.5, z: 2, heading: 0 }, 1)).toEqual({ ok: false, blocker: { label: 'wall', at: { x: 5, y: 1, z: 2 } } });
    expect(step(room, [], { x: 2, z: 0.6, heading: -Math.PI / 2 }, 1)).toEqual({ ok: false, blocker: { label: 'wall', at: { x: 2, y: 1, z: 0 } } });
  });

  it('says door, not wall, when the wall you bump is within half a metre of a door', () => {
    const door = box('door', 4.95, 2.5, 5.05, 3.4);
    expect(step(room, [door], { x: 4.5, z: 2.8, heading: 0 }, 1)).toEqual({ ok: false, blocker: { label: 'door', at: { x: 5, y: 1, z: 2.8 } } });
    expect(step(room, [door], { x: 4.5, z: 2, heading: 0 }, 1)).toEqual({ ok: false, blocker: { label: 'door', at: { x: 5, y: 1, z: 2 } } });
    expect(step(room, [door], { x: 4.5, z: 1.9, heading: 0 }, 1)).toEqual({ ok: false, blocker: { label: 'wall', at: { x: 5, y: 1, z: 1.9 } } });
    expect(step(room, [door], { x: 0.5, z: 2.8, heading: Math.PI }, 1)).toEqual({ ok: false, blocker: { label: 'wall', at: { x: 0, y: 1, z: 2.8 } } });
  });

  it('bumps into furniture grown by 0.1 m and reports its name and nearest point', () => {
    expect(step(room, [table], { x: 2.5, z: 2, heading: 0 }, 1)).toEqual({ ok: false, blocker: { label: 'table', at: { x: 3, y: 1, z: 2 } } });
    expect(step(room, [table], { x: 2.3, z: 2, heading: 0 }, 1).ok).toBe(true); // ends at 2.8, outside 2.9
  });

  it('walks through doors, windows, TVs and whiteboards', () => {
    expect(step(room, [box('door', 2.4, 1.5, 2.6, 2.5)], { x: 2, z: 2, heading: 0 }, 1).ok).toBe(true);
  });

  it('never traps you inside a box you are already in', () => {
    expect(step(room, [table], { x: 2.95, z: 2, heading: 0 }, 1).ok).toBe(true);
    expect(step(room, [table], { x: 2.95, z: 2, heading: Math.PI }, 1).ok).toBe(true);
  });
});

describe('clampToRoom', () => {
  it('keeps a point 0.3 m inside the walls', () => {
    expect(clampToRoom(room, { x: -1, z: 9 })).toEqual({ x: 0.3, z: 3.7 });
    expect(clampToRoom(room, { x: 2, z: 2 })).toEqual({ x: 2, z: 2 });
  });
});
