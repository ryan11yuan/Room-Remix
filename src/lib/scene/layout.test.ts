import { describe, expect, it } from 'vitest';
import { toSurfaceCoords } from '@/lib/room/geometry';
import { defaultRoom } from '@/lib/room/roomState';
import { SURFACE_IDS } from '@/lib/room/types';
import { cameraPreset, fixQuad, surfacePoint, surfaceQuad } from './layout';

const dims = { length: 4, width: 3.5, height: 2.6 };

describe('surfaceQuad', () => {
  it('centres and sizes the floor and a wall', () => {
    expect(surfaceQuad(dims, 'floor')).toMatchObject({ center: { x: 2, y: 0, z: 1.75 }, width: 4, height: 3.5, normal: { x: 0, y: 1, z: 0 } });
    expect(surfaceQuad(dims, 'wallZ1')).toMatchObject({ center: { x: 2, y: 1.3, z: 3.5 }, width: 4, height: 2.6, normal: { x: 0, y: 0, z: -1 } });
  });

  it('points every normal into the room', () => {
    const middle = { x: 2, y: 1.3, z: 1.75 };
    for (const surface of SURFACE_IDS) {
      const { center, normal } = surfaceQuad(dims, surface);
      const toMiddle = (middle.x - center.x) * normal.x + (middle.y - center.y) * normal.y + (middle.z - center.z) * normal.z;
      expect(toMiddle).toBeGreaterThan(0);
    }
  });
});

describe('surfacePoint', () => {
  it('is the inverse of toSurfaceCoords on every surface', () => {
    for (const surface of SURFACE_IDS) {
      const p = surfacePoint(dims, surface, 1.25, 0.75);
      expect(toSurfaceCoords(surface, p)).toEqual({ u: 1.25, v: 0.75 });
    }
  });
});

describe('fixQuad', () => {
  it('lifts a rug just above the floor and a panel just off its wall', () => {
    const rug = fixQuad(dims, { kind: 'rug', size: 'M', x: 2, z: 1.75, on: true });
    expect(rug.center).toEqual({ x: 2, y: 0.01, z: 1.75 });
    expect([rug.width, rug.height]).toEqual([2.3, 1.6]);
    const panel = fixQuad(dims, { kind: 'panel', wall: 'wallZ1', u: 2, v: 1.2, on: true });
    expect(panel.center.x).toBe(2);
    expect(panel.center.y).toBe(1.2);
    expect(panel.center.z).toBeCloseTo(3.49, 9);
    expect([panel.width, panel.height]).toEqual([0.6, 1.2]);
  });
});

describe('cameraPreset', () => {
  const room = defaultRoom();

  it('looks down from above for the top view', () => {
    const { position, target } = cameraPreset(room, 'top');
    expect(position.y).toBeGreaterThan(room.dims.height);
    expect(target).toEqual({ x: 2, y: 0, z: 1.75 });
  });

  it('stands outside the back-left corner for the corner view', () => {
    const { position } = cameraPreset(room, 'corner');
    expect(position.x).toBeGreaterThan(room.dims.length);
    expect(position.z).toBeGreaterThan(room.dims.width);
  });

  it("puts the camera at the listener's head looking at the speaker", () => {
    expect(cameraPreset(room, 'listener')).toEqual({
      position: { x: 3, y: 1.1, z: 1.9 },
      target: { x: 0.6, y: 1.0, z: 1.4 },
    });
  });
});
