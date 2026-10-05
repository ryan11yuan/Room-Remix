import { describe, expect, it } from 'vitest';
import { fixFits } from './geometry';
import { applyDrag, clampPosition, clampRug, findFreePanelSpot, panelAt, panelOverlaps } from './placement';
import { defaultRoom, validateRoom } from './roomState';
import type { PanelFix, RoomState } from './types';

const panel = (u: number, wall: PanelFix['wall'] = 'wallZ1'): PanelFix => ({ kind: 'panel', wall, u, v: 1.2, on: true });

describe('clampPosition', () => {
  it('keeps a point 0.3 m from every surface', () => {
    const p = clampPosition({ length: 4, width: 3.5, height: 2.6 }, { x: -1, y: 9, z: 99 });
    expect(p.x).toBeCloseTo(0.3, 9);
    expect(p.y).toBeCloseTo(2.3, 9); // 2.6 − 0.3 is 2.3000000000000003 in floating point
    expect(p.z).toBeCloseTo(3.2, 9);
  });

  it('produces positions that validate even where 1.9 − 0.3 is 1.5999999999999999', () => {
    const room: RoomState = { ...defaultRoom(), dims: { length: 1.9, width: 3.5, height: 2.6 }, listener: { x: 0.5, y: 1.1, z: 2.9, yaw: 'faceSpeaker' } };
    const speaker = clampPosition(room.dims, { x: 99, y: 1, z: 0.3 });
    expect(validateRoom({ ...room, speaker })).toEqual([]);
  });
});

describe('clampRug', () => {
  it('keeps the whole rug on the floor', () => {
    const rug = clampRug({ length: 4, width: 3.5, height: 2.6 }, { kind: 'rug', size: 'M', x: -5, z: 99, on: true });
    expect(rug.x).toBeCloseTo(1.15, 9);
    expect(rug.z).toBeCloseTo(2.7, 9);
    expect(fixFits({ length: 4, width: 3.5, height: 2.6 }, rug)).toBe(true);
  });
});

describe('panelAt', () => {
  it('centres the panel on the tap and nudges it to fit near a corner', () => {
    const dims = { length: 4, width: 3.5, height: 2.6 };
    const p = panelAt(dims, 'wallZ1', { x: 3.95, y: 2.55, z: 3.5 });
    expect(p.u).toBeCloseTo(3.7, 9);
    expect(p.v).toBeCloseTo(2.0, 9);
    expect(fixFits(dims, p)).toBe(true);
    expect(panelAt(dims, 'wallX0', { x: 0, y: 1.4, z: 2 })).toMatchObject({ wall: 'wallX0', u: 2, v: 1.4 });
  });
});

describe('panelOverlaps', () => {
  it('detects overlap on the same wall only, and allows touching edges', () => {
    const room: RoomState = { ...defaultRoom(), fixes: [panel(1.0)] };
    expect(panelOverlaps(room, panel(1.3))).toBe(true);
    expect(panelOverlaps(room, panel(1.6))).toBe(false); // edges touch at u = 1.3
    expect(panelOverlaps(room, panel(1.0, 'wallZ0'))).toBe(false);
  });
});

describe('findFreePanelSpot', () => {
  it('fills each wall left to right, reusing gaps', () => {
    const room = defaultRoom();
    expect(findFreePanelSpot(room)).toEqual(panel(0.5));
    expect(findFreePanelSpot({ ...room, fixes: [panel(0.5)] })).toEqual(panel(1.2));
    expect(findFreePanelSpot({ ...room, fixes: [panel(1.2)] })).toEqual(panel(0.5));
  });

  it('returns null when no wall has room left', () => {
    let room: RoomState = { ...defaultRoom(), dims: { length: 1.5, width: 1.5, height: 2.6 }, speaker: { x: 0.4, y: 1, z: 0.4 }, listener: { x: 1.1, y: 1.1, z: 1.1, yaw: 'faceSpeaker' } };
    for (let i = 0; i < 8; i++) {
      const spot = findFreePanelSpot(room);
      expect(spot).not.toBeNull();
      room = { ...room, fixes: [...room.fixes, spot!] };
    }
    expect(validateRoom(room)).toEqual([]);
    expect(findFreePanelSpot(room)).toBeNull();
  });
});

describe('applyDrag', () => {
  it('moves the speaker on the floor plan, keeping its height, clamped to the room', () => {
    const room = defaultRoom();
    const next = applyDrag(room, { kind: 'speaker' }, { x: -3, y: 0, z: 2 });
    expect(next.speaker).toEqual({ x: 0.3, y: room.speaker.y, z: 2 });
  });

  it('moves the listener and keeps its yaw', () => {
    const room = defaultRoom();
    const next = applyDrag(room, { kind: 'listener' }, { x: 2, y: 0, z: 1 });
    expect(next.listener).toEqual({ x: 2, y: room.listener.y, z: 1, yaw: 'faceSpeaker' });
  });

  it('moves the rug, keeping it on the floor', () => {
    const room: RoomState = { ...defaultRoom(), fixes: [panel(0.5), { kind: 'rug', size: 'M', x: 2, z: 1.75, on: true }] };
    const next = applyDrag(room, { kind: 'rug', index: 1 }, { x: 10, y: 0, z: 0 });
    expect(next.fixes[0]).toBe(room.fixes[0]);
    expect(next.fixes[1]).toMatchObject({ kind: 'rug', x: 4 - 1.15, z: 0.8 });
  });
});
