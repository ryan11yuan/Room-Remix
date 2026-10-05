import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { Vec3 } from '@/lib/room/types';
import {
  AlignError,
  alignFromCorners,
  alignmentMatrix,
  alignTap,
  IDENTITY_ALIGNMENT,
  levelFromFloor,
  nudgeAlignment,
  startAlign,
  toRoom,
  type Alignment,
} from './alignment';

const dims = { length: 4, width: 3.5, height: 2.6 };

/** A scan: the room seen through an arbitrary rotation, scale and offset (the inverse of what we must recover). */
function makeScan(rotation: THREE.Quaternion, scale: number, offset: THREE.Vector3) {
  const roomToScan = new THREE.Matrix4().compose(offset, rotation, new THREE.Vector3(scale, scale, scale));
  return (p: Vec3): Vec3 => {
    const v = new THREE.Vector3(p.x, p.y, p.z).applyMatrix4(roomToScan);
    return { x: v.x, y: v.y, z: v.z };
  };
}

const expectNear = (a: Vec3, b: Vec3) => {
  expect(a.x).toBeCloseTo(b.x, 9);
  expect(a.y).toBeCloseTo(b.y, 9);
  expect(a.z).toBeCloseTo(b.z, 9);
};

function recover(scan: (p: Vec3) => Vec3): Alignment {
  let state = startAlign();
  const viewer = scan({ x: 2, y: 2.2, z: 1.75 }); // the camera stood in the room, above the floor
  for (const p of [{ x: 1, y: 0, z: 1 }, { x: 3, y: 0, z: 0.5 }, { x: 2, y: 0, z: 3 }]) state = alignTap(state, scan(p), viewer, dims);
  state = alignTap(state, scan({ x: 0, y: 0, z: 0 }), viewer, dims); // front-right corner
  state = alignTap(state, scan({ x: dims.length, y: 0, z: 0 }), viewer, dims); // back-right corner
  if (state.step !== 'nudge') throw new Error('expected to reach the nudge step');
  return state.alignment;
}

describe('alignment', () => {
  it('is the identity for IDENTITY_ALIGNMENT', () => {
    expect(alignmentMatrix(IDENTITY_ALIGNMENT).equals(new THREE.Matrix4())).toBe(true);
  });

  it('recovers the room from a rotated, scaled, shifted scan', () => {
    const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.4, 1.1, -0.3));
    const scan = makeScan(rotation, 0.37, new THREE.Vector3(2, -1, 5));
    const alignment = recover(scan);
    for (const p of [{ x: 0, y: 0, z: 0 }, { x: 4, y: 2.6, z: 3.5 }, { x: 1.2, y: 1.1, z: 2.9 }, { x: 0.6, y: 1, z: 1.4 }]) {
      expectNear(toRoom(alignment, scan(p)), p);
    }
  });

  it('recovers an upside-down (y-down) scan with the camera deciding which way is up', () => {
    const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
    const scan = makeScan(rotation, 2.5, new THREE.Vector3(-3, 4, 0.5));
    const alignment = recover(scan);
    expectNear(toRoom(alignment, scan({ x: 4, y: 2.6, z: 3.5 })), { x: 4, y: 2.6, z: 3.5 });
  });

  it('refuses three floor points in a line', () => {
    expect(() => levelFromFloor([{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }], { x: 0, y: 1, z: 0 })).toThrow(AlignError);
  });

  it('refuses two corners in the same spot', () => {
    expect(() => alignFromCorners([0, 0, 0, 1], { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 1 }, { x: 1, y: 0.5, z: 1 }, dims)).toThrow(AlignError);
  });

  it('leaves the state unchanged when a tap is refused', () => {
    let state = startAlign();
    const viewer = { x: 0, y: 1, z: 0 };
    state = alignTap(state, { x: 0, y: 0, z: 0 }, viewer, dims);
    state = alignTap(state, { x: 1, y: 0, z: 0 }, viewer, dims);
    expect(() => alignTap(state, { x: 2, y: 0, z: 0 }, viewer, dims)).toThrow(AlignError);
    expect(state).toEqual({ step: 'floor', floor: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }] });
  });
});

describe('nudgeAlignment', () => {
  const pivot = { x: 2, y: 0, z: 1.75 };
  const base: Alignment = { level: [0, 0, 0, 1], scale: 1, yaw: 0, offset: { x: 0, y: 0, z: 0 } };

  it('turns and scales about the pivot, which stays put', () => {
    const turned = nudgeAlignment(base, { yaw: 0.3, scale: 1.1 }, pivot);
    expectNear(toRoom(turned, pivot), pivot);
    expect(turned.yaw).toBeCloseTo(0.3, 12);
    expect(turned.scale).toBeCloseTo(1.1, 12);
  });

  it('moves along x and z', () => {
    expectNear(toRoom(nudgeAlignment(base, { x: 0.05, z: -0.05 }, pivot), { x: 1, y: 1, z: 1 }), { x: 1.05, y: 1, z: 0.95 });
  });
});
