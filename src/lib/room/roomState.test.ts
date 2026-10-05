import { describe, expect, it } from 'vitest';
import { clippedArea, fixFits, fixRect, surfaceSize, toSurfaceCoords } from './geometry';
import { defaultRoom, validateRoom } from './roomState';
import type { Fix, RoomState } from './types';

const fields = (room: RoomState) => validateRoom(room).map((e) => e.field);
const rug = (x: number, z: number, size: 'S' | 'M' | 'L' = 'M'): Fix => ({ kind: 'rug', size, x, z, on: true });
const panel = (u: number, v: number): Fix => ({ kind: 'panel', wall: 'wallZ1', u, v, on: true });

describe('geometry', () => {
  const dims = { length: 4, width: 3.5, height: 2.6 };

  it('sizes each surface in its own u/v coordinates', () => {
    expect(surfaceSize(dims, 'floor')).toEqual({ u: 4, v: 3.5 });
    expect(surfaceSize(dims, 'wallX0')).toEqual({ u: 3.5, v: 2.6 });
    expect(surfaceSize(dims, 'wallZ1')).toEqual({ u: 4, v: 2.6 });
  });

  it('maps 3-D points to surface coordinates', () => {
    const p = { x: 1, y: 2, z: 3 };
    expect(toSurfaceCoords('ceiling', p)).toEqual({ u: 1, v: 3 });
    expect(toSurfaceCoords('wallX1', p)).toEqual({ u: 3, v: 2 });
    expect(toSurfaceCoords('wallZ0', p)).toEqual({ u: 1, v: 2 });
  });

  it('builds fix rectangles centred on the fix', () => {
    const expectRect = (actual: ReturnType<typeof fixRect>, expected: ReturnType<typeof fixRect>) => {
      for (const k of ['u0', 'u1', 'v0', 'v1'] as const) expect(actual[k]).toBeCloseTo(expected[k], 9);
    };
    expectRect(fixRect(rug(2, 1.75)), { u0: 0.85, u1: 3.15, v0: 0.95, v1: 2.55 });
    expectRect(fixRect(panel(2, 1.2)), { u0: 1.7, u1: 2.3, v0: 0.6, v1: 1.8 });
  });

  it('clips areas to the surface', () => {
    expect(clippedArea({ u0: -1, u1: 1, v0: 0, v1: 1 }, { u: 4, v: 4 })).toBeCloseTo(1, 9);
  });

  it('checks whether a fix fits on its surface', () => {
    expect(fixFits(dims, rug(2, 1.75))).toBe(true);
    expect(fixFits({ length: 2.5, width: 2.5, height: 2.6 }, rug(1.25, 1.25, 'L'))).toBe(false);
    expect(fixFits(dims, panel(2, 2.3))).toBe(false);
  });
});

describe('validateRoom', () => {
  it('accepts the default room', () => {
    expect(validateRoom(defaultRoom())).toEqual([]);
  });

  it('rejects dimensions out of range or not numbers', () => {
    const room = defaultRoom();
    expect(fields({ ...room, dims: { ...room.dims, length: 1.4 } })).toEqual(['dims.length']);
    expect(fields({ ...room, dims: { ...room.dims, width: 31 } })).toEqual(['dims.width']);
    expect(fields({ ...room, dims: { ...room.dims, height: 1.9 } })).toEqual(['dims.height']);
    expect(fields({ ...room, dims: { ...room.dims, length: Number.NaN } })).toEqual(['dims.length']);
  });

  it('requires 0.3 m clearance from walls, floor and ceiling', () => {
    const room = defaultRoom();
    expect(fields({ ...room, speaker: { ...room.speaker, x: 0.2 } })).toContain('speaker');
    expect(fields({ ...room, listener: { ...room.listener, y: 2.4 } })).toContain('listener');
  });

  it('requires 0.5 m between speaker and listener', () => {
    const room = defaultRoom();
    const near: RoomState = { ...room, listener: { ...room.speaker, x: room.speaker.x + 0.4, yaw: 'faceSpeaker' } };
    expect(fields(near)).toEqual(['listener']);
  });

  it('allows at most one rug and eight panels', () => {
    const room = defaultRoom();
    expect(fields({ ...room, fixes: [rug(2, 1.75), rug(2, 1.75)] })).toEqual(['fixes']);
    expect(fields({ ...room, fixes: Array.from({ length: 9 }, () => panel(2, 1.2)) })).toContain('fixes');
  });

  it('rejects fixes that do not fit', () => {
    const room = defaultRoom();
    expect(fields({ ...room, fixes: [rug(0.5, 1.75)] })).toEqual(['fixes.0']);
  });

  it('rejects panels that overlap on the same wall', () => {
    const room = defaultRoom();
    expect(fields({ ...room, fixes: [panel(2, 1.2), panel(2.3, 1.2)] })).toEqual(['fixes.1']);
    expect(fields({ ...room, fixes: [panel(1, 1.2), panel(1.6, 1.2)] })).toEqual([]); // touching edges are fine
  });

  it('accepts panels that exactly touch, whatever the float rounding', () => {
    const room = defaultRoom();
    expect(fields({ ...room, fixes: [panel(0.4, 1.2), panel(1.0, 1.2)] })).toEqual([]);
    expect(fields({ ...room, fixes: [panel(2, 0.68), panel(2, 1.88)] })).toEqual([]);
  });
});
