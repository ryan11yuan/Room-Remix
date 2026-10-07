import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { Vec3 } from '@/lib/room/types';
import { fitRoom, roomToWorldMatrix, roomYaw, toRoom, toWorld } from './roomFit';
import type { RoomFit } from './types';

// A 6 × 4 × 2.7 m room, turned 30°, at 2 m per world unit, floor at world y = −1.
const truth: RoomFit = { dims: { length: 6, width: 4, height: 2.7 }, scale: 2, yaw: Math.PI / 6, floorY: -1, minX: 0.3, minZ: -0.7 };

/** Points on the floor, ceiling and four walls of the room (room metres), every 5 cm, sent to world. */
function roomSurfaces(fit: RoomFit, withCeiling = true, wallTop = fit.dims.height): Float32Array {
  const { length: L, width: W, height: H } = fit.dims;
  const out: number[] = [];
  const add = (p: Vec3) => {
    const w = toWorld(fit, p);
    out.push(w.x, w.y, w.z);
  };
  for (let x = 0; x <= L; x += 0.05) {
    for (let z = 0; z <= W; z += 0.05) {
      add({ x, y: 0, z });
      if (withCeiling) add({ x, y: H, z });
    }
    for (let y = 0; y <= wallTop; y += 0.05) {
      add({ x, y, z: 0 });
      add({ x, y, z: W });
    }
  }
  for (let z = 0; z <= W; z += 0.05) {
    for (let y = 0; y <= wallTop; y += 0.05) {
      add({ x: 0, y, z });
      add({ x: L, y, z });
    }
  }
  return new Float32Array(out);
}
const cameras = (fit: RoomFit) => [{ x: 2, y: 1.5, z: 2 }, { x: 4, y: 1.5, z: 1 }].map((p) => toWorld(fit, p));

describe('fitRoom', () => {
  it('recovers size, scale and the walls of a turned, scaled room', () => {
    const fit = fitRoom(roomSurfaces(truth), cameras(truth));
    expect(fit.scale).toBeCloseTo(2, 2);
    expect(fit.dims.length).toBeCloseTo(6, 1);
    expect(fit.dims.width).toBeCloseTo(4, 1);
    expect(fit.dims.height).toBeCloseTo(2.7, 1);
    const corner = toRoom(fit, toWorld(truth, { x: 6, y: 0, z: 4 }));
    expect(corner.x).toBeCloseTo(6, 1);
    expect(corner.y).toBeCloseTo(0, 1);
    expect(corner.z).toBeCloseTo(4, 1);
  });

  it('uses 2.7 m when the video barely saw the ceiling', () => {
    const low: RoomFit = { ...truth, dims: { ...truth.dims, height: 1.2 } };
    const fit = fitRoom(roomSurfaces(low, false, 1.2), cameras(truth));
    expect(fit.dims.height).toBe(2.7);
  });
});

describe('room ↔ world', () => {
  it('round-trips, and the matrix agrees with toWorld', () => {
    const p = { x: 1.2, y: 0.7, z: 3.1 };
    const back = toRoom(truth, toWorld(truth, p));
    expect(back.x).toBeCloseTo(p.x, 9);
    expect(back.y).toBeCloseTo(p.y, 9);
    expect(back.z).toBeCloseTo(p.z, 9);
    const viaMatrix = new THREE.Vector3(p.x, p.y, p.z).applyMatrix4(roomToWorldMatrix(truth));
    const w = toWorld(truth, p);
    expect(viaMatrix.x).toBeCloseTo(w.x, 9);
    expect(viaMatrix.y).toBeCloseTo(w.y, 9);
    expect(viaMatrix.z).toBeCloseTo(w.z, 9);
  });

  it('roomYaw: facing along the room length is 0, along its width is π/2', () => {
    const along = (r: Vec3) => {
      const a = toWorld(truth, { x: 0, y: 0, z: 0 });
      const b = toWorld(truth, r);
      return { x: b.x - a.x, y: 0, z: b.z - a.z };
    };
    expect(roomYaw(truth, along({ x: 1, y: 0, z: 0 }))).toBeCloseTo(0, 9);
    expect(roomYaw(truth, along({ x: 0, y: 0, z: 1 }))).toBeCloseTo(Math.PI / 2, 9);
  });
});
