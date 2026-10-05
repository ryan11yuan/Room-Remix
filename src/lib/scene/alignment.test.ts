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
  type AlignState,
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

const roomCentre = { x: dims.length / 2, y: 1.3, z: dims.width / 2 };
const floorTaps = [{ x: 1, y: 0, z: 1 }, { x: 3, y: 0, z: 0.5 }, { x: 2, y: 0, z: 3 }];

/** Tap the three floor spots, leaving the state at the corners step. */
function tapFloor(scan: (p: Vec3) => Vec3, taps = floorTaps) {
  const inside = scan(roomCentre); // a point inside the room, wherever the scan put it
  let state = startAlign();
  for (const p of taps) state = alignTap(state, scan(p), inside, dims);
  return { state, inside };
}

function recover(scan: (p: Vec3) => Vec3, taps = floorTaps): Alignment {
  const floor = tapFloor(scan, taps);
  const inside = floor.inside;
  let state = floor.state;
  state = alignTap(state, scan({ x: 0, y: 0, z: 0 }), inside, dims); // front-right corner
  state = alignTap(state, scan({ x: dims.length, y: 0, z: 0 }), inside, dims); // back-right corner
  if (state.step !== 'nudge') throw new Error('expected to reach the nudge step');
  return state.alignment;
}

const tilted = () => makeScan(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.4, 1.1, -0.3)), 0.37, new THREE.Vector3(2, -1, 5));
const yDown = () => makeScan(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI), 2.5, new THREE.Vector3(-3, 4, 0.5));

describe('alignment', () => {
  it('is the identity for IDENTITY_ALIGNMENT', () => {
    expect(alignmentMatrix(IDENTITY_ALIGNMENT).equals(new THREE.Matrix4())).toBe(true);
  });

  it('recovers the room from a rotated, scaled, shifted scan', () => {
    const scan = tilted();
    const alignment = recover(scan);
    for (const p of [{ x: 0, y: 0, z: 0 }, { x: 4, y: 2.6, z: 3.5 }, { x: 1.2, y: 1.1, z: 2.9 }, { x: 0.6, y: 1, z: 1.4 }]) {
      expectNear(toRoom(alignment, scan(p)), p);
    }
  });

  it('recovers an upside-down (y-down) scan with a point inside the room deciding which way is up', () => {
    const scan = yDown();
    const alignment = recover(scan);
    expectNear(toRoom(alignment, scan({ x: 4, y: 2.6, z: 3.5 })), { x: 4, y: 2.6, z: 3.5 });
  });

  it.each([
    ['tilted', tilted],
    ['y-down', yDown],
  ])('gives the same alignment when the floor is tapped in reverse order (%s scan)', (_name, make) => {
    const scan = make();
    const forward = recover(scan);
    const reversed = recover(scan, [...floorTaps].reverse());
    for (const p of [{ x: 4, y: 2.6, z: 3.5 }, { x: 0, y: 0, z: 0 }, { x: 1.2, y: 1.1, z: 2.9 }]) {
      expectNear(toRoom(reversed, scan(p)), p);
      expectNear(toRoom(reversed, scan(p)), toRoom(forward, scan(p)));
    }
  });

  it('refuses three floor points in a line', () => {
    expect(() => levelFromFloor([{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }], { x: 0, y: 1, z: 0 })).toThrow(AlignError);
  });

  describe.each([1e-4, 1e4])('floor check at scan scale %s', (size) => {
    const scan = makeScan(new THREE.Quaternion(), size, new THREE.Vector3());
    const inside = scan(roomCentre);
    const triple = (a: Vec3, b: Vec3, c: Vec3): [Vec3, Vec3, Vec3] => [scan(a), scan(b), scan(c)];

    it('accepts a right-angle floor triangle with 2 m legs', () => {
      const level = levelFromFloor(triple({ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, { x: 0, y: 0, z: 2 }), inside);
      expect(level[3]).toBeCloseTo(1, 9); // already level: the identity rotation
    });

    it('refuses three collinear floor points', () => {
      expect(() => levelFromFloor(triple({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }), inside)).toThrow(AlignError);
    });
  });

  it('refuses two corners in the same spot', () => {
    expect(() => alignFromCorners([0, 0, 0, 1], { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 1 }, { x: 1, y: 0.5, z: 1 }, dims)).toThrow(AlignError);
  });

  it('leaves the state unchanged when a tap is refused', () => {
    let state = startAlign();
    const inside = { x: 0, y: 1, z: 0 };
    state = alignTap(state, { x: 0, y: 0, z: 0 }, inside, dims);
    state = alignTap(state, { x: 1, y: 0, z: 0 }, inside, dims);
    expect(() => alignTap(state, { x: 2, y: 0, z: 0 }, inside, dims)).toThrow(AlignError);
    expect(state).toEqual({ step: 'floor', floor: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }] });
  });

  it('catches the right wall tapped back corner first, and offers a fresh corners step to retry from', () => {
    const scan = tilted();
    const { state: afterFloor, inside } = tapFloor(scan);
    expect(afterFloor.step).toBe('corners');
    const afterBack = alignTap(afterFloor, scan({ x: dims.length, y: 0, z: 0 }), inside, dims);
    let caught: unknown;
    try {
      alignTap(afterBack, scan({ x: 0, y: 0, z: 0 }), inside, dims);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(AlignError);
    expect((caught as AlignError).message).toMatch(/wrong side/);
    expect((caught as AlignError).retry).toEqual({ ...afterFloor, corners: [] });
    expect(afterBack).toEqual({ ...afterFloor, corners: [scan({ x: dims.length, y: 0, z: 0 })] }); // the refused tap left the state alone
  });

  describe('which side of the wall the room is on', () => {
    const floorCentre = { x: 2, y: 0, z: (0.5 + 1 + 3) / 3 }; // the centroid of floorTaps, in room coordinates
    // Splats seen through a window, or floaters, reach 20 m past the right wall (z < 0), so their mean sits outside the room.
    const meanOutside = { x: 2, y: 1.3, z: -3 };

    it.each([
      ['tilted', tilted],
      ['y-down', yDown],
    ])('records the centroid of the three floor taps in the corners state (%s scan)', (_name, make) => {
      const scan = make();
      const { state } = tapFloor(scan);
      if (state.step !== 'corners') throw new Error('expected the corners step');
      expectNear(state.floorCentre, scan(floorCentre));
    });

    it.each([
      ['tilted', tilted],
      ['y-down', yDown],
    ])('accepts perfect taps when the inside point lies outside the room (%s scan)', (_name, make) => {
      const scan = make();
      const inside = scan(meanOutside);
      let state = startAlign();
      for (const p of floorTaps) state = alignTap(state, scan(p), inside, dims);
      state = alignTap(state, scan({ x: 0, y: 0, z: 0 }), inside, dims);
      state = alignTap(state, scan({ x: dims.length, y: 0, z: 0 }), inside, dims);
      expect(state.step).toBe('nudge');
      if (state.step !== 'nudge') return;
      for (const p of [{ x: 0, y: 0, z: 0 }, { x: 4, y: 2.6, z: 3.5 }, { x: 1.2, y: 1.1, z: 2.9 }]) {
        expectNear(toRoom(state.alignment, scan(p)), p);
      }
    });

    it('judges the side from the floor taps, whatever the inside point says', () => {
      const scan = tilted();
      const front = scan({ x: 0, y: 0, z: 0 });
      const back = scan({ x: dims.length, y: 0, z: 0 });
      const { state } = tapFloor(scan);
      if (state.step !== 'corners') throw new Error('expected the corners step');
      const finish = (from: AlignState, inside: Vec3) => alignTap(alignTap(from, front, inside, dims), back, inside, dims);
      // The same corner taps, the same inside point: only the floor centre differs, and so does the verdict.
      expect(finish(state, scan(meanOutside)).step).toBe('nudge');
      expect(() => finish({ ...state, floorCentre: scan({ x: 2, y: 0, z: -1 }) }, scan(meanOutside))).toThrow(/wrong side/);
      // And the inside point is not consulted for the side: moving it across the wall changes nothing.
      expect(finish(state, scan(roomCentre)).step).toBe('nudge');
      expect(() => finish({ ...state, floorCentre: scan({ x: 2, y: 0, z: -1 }) }, scan(roomCentre))).toThrow(/wrong side/);
    });

    it.each([
      ['tilted', tilted],
      ['y-down', yDown],
    ])('still catches the left wall tapped as the right wall (%s scan), even with the inside point outside the room', (_name, make) => {
      const scan = make();
      const inside = scan(meanOutside);
      let state = startAlign();
      for (const p of floorTaps) state = alignTap(state, scan(p), inside, dims);
      state = alignTap(state, scan({ x: 0, y: 0, z: dims.width }), inside, dims); // front-left corner
      expect(() => alignTap(state, scan({ x: dims.length, y: 0, z: dims.width }), inside, dims)).toThrow(/wrong side/);
    });

    it('still catches the back corner tapped first, even with the inside point outside the room', () => {
      const scan = tilted();
      const inside = scan(meanOutside);
      let state = startAlign();
      for (const p of floorTaps) state = alignTap(state, scan(p), inside, dims);
      state = alignTap(state, scan({ x: dims.length, y: 0, z: 0 }), inside, dims);
      expect(() => alignTap(state, scan({ x: 0, y: 0, z: 0 }), inside, dims)).toThrow(/wrong side/);
    });

    it('keeps the floor centre in the state it offers to retry from, with the same message', () => {
      const scan = tilted();
      const { state, inside } = tapFloor(scan);
      if (state.step !== 'corners') throw new Error('expected the corners step');
      const afterBack = alignTap(state, scan({ x: dims.length, y: 0, z: 0 }), inside, dims);
      let caught: unknown;
      try {
        alignTap(afterBack, scan({ x: 0, y: 0, z: 0 }), inside, dims);
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(AlignError);
      expect((caught as AlignError).message).toBe("The room came out on the wrong side. Tap the right wall's front corner first, then its back corner.");
      const retry = (caught as AlignError).retry;
      expect(retry).toEqual({ ...state, corners: [] });
      if (retry?.step !== 'corners') throw new Error('expected a corners retry');
      expect(retry.floorCentre).toEqual(state.floorCentre);
      // And the retry carries on to a good alignment from there.
      const again = alignTap(alignTap(retry, scan({ x: 0, y: 0, z: 0 }), inside, dims), scan({ x: dims.length, y: 0, z: 0 }), inside, dims);
      expect(again.step).toBe('nudge');
    });
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

  it('keeps the pivot put and turns about it when the base alignment is not trivial', () => {
    const scan = tilted();
    const recovered = recover(scan);
    const nudged = nudgeAlignment(recovered, { yaw: 0.3, scale: 1.1 }, pivot);
    expectNear(toRoom(nudged, scan(pivot)), pivot);
    // One metre along +x from the pivot: positive yaw turns +x toward -z (three.js makeRotationY), and the scale stretches it.
    expectNear(toRoom(nudged, scan({ x: pivot.x + 1, y: 0, z: pivot.z })), {
      x: pivot.x + 1.1 * Math.cos(0.3),
      y: 0,
      z: pivot.z - 1.1 * Math.sin(0.3),
    });
  });
});
