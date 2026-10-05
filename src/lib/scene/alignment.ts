import * as THREE from 'three';
import type { Dims, Vec3 } from '@/lib/room/types';

/** How a scan sits in the room: level its floor, scale it to metres, turn it, then move it. */
export type Alignment = {
  level: [number, number, number, number]; // quaternion (x, y, z, w) turning the scan's floor normal to +y
  scale: number;
  yaw: number; // radians about +y, three.js makeRotationY convention
  offset: Vec3; // metres, applied last
};

export const IDENTITY_ALIGNMENT: Alignment = { level: [0, 0, 0, 1], scale: 1, yaw: 0, offset: { x: 0, y: 0, z: 0 } };

/** A tap that can't be used, with a message for the user. */
export class AlignError extends Error {}

const UP = new THREE.Vector3(0, 1, 0);
const vec = (p: Vec3) => new THREE.Vector3(p.x, p.y, p.z);
const plain = (v: THREE.Vector3): Vec3 => ({ x: v.x, y: v.y, z: v.z });

/** Scan → room transform: offset · Ry(yaw) · scale · level. */
export function alignmentMatrix(a: Alignment): THREE.Matrix4 {
  const level = new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion(...a.level));
  const scale = new THREE.Matrix4().makeScale(a.scale, a.scale, a.scale);
  const yaw = new THREE.Matrix4().makeRotationY(a.yaw);
  const move = new THREE.Matrix4().makeTranslation(a.offset.x, a.offset.y, a.offset.z);
  return move.multiply(yaw).multiply(scale).multiply(level);
}

export function toRoom(a: Alignment, p: Vec3): Vec3 {
  return plain(vec(p).applyMatrix4(alignmentMatrix(a)));
}

/** Rotation that levels the floor through three tapped points; "up" is the side the camera (viewer) was on. */
export function levelFromFloor(points: [Vec3, Vec3, Vec3], viewer: Vec3): Alignment['level'] {
  const [a, b, c] = points.map(vec);
  const normal = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a));
  if (normal.lengthSq() < 1e-12 * Math.max(1, b.distanceToSquared(a) * c.distanceToSquared(a))) {
    throw new AlignError('Those floor points are in a line. Tap three spots spread out across the floor.');
  }
  normal.normalize();
  if (normal.dot(vec(viewer).sub(a)) < 0) normal.negate();
  const q = new THREE.Quaternion().setFromUnitVectors(normal, UP);
  return [q.x, q.y, q.z, q.w];
}

/**
 * Finish an alignment from the two ends of the right wall, tapped on the floor:
 * `front` is the front-right corner (room 0, 0, 0) and `back` the back-right corner (room length, 0, 0).
 */
export function alignFromCorners(level: Alignment['level'], floorPoint: Vec3, front: Vec3, back: Vec3, dims: Dims): Alignment {
  const q = new THREE.Quaternion(...level);
  const f = vec(front).applyQuaternion(q);
  const b = vec(back).applyQuaternion(q);
  const dx = b.x - f.x;
  const dz = b.z - f.z;
  const span = Math.hypot(dx, dz);
  if (span < 1e-9) throw new AlignError('Those corners are in the same spot. Tap both ends of the right wall.');
  const scale = dims.length / span;
  const yaw = Math.atan2(dz, dx);
  const turned = f.clone().multiplyScalar(scale).applyAxisAngle(UP, yaw);
  const floorY = vec(floorPoint).applyQuaternion(q).y * scale;
  return { level, scale, yaw, offset: { x: -turned.x, y: -floorY, z: -turned.z } };
}

/** Fine-tune: turn and scale about `pivot` (it stays put), then move along x/z. */
export function nudgeAlignment(
  a: Alignment,
  change: { yaw?: number; scale?: number; x?: number; z?: number },
  pivot: Vec3,
): Alignment {
  const k = change.scale ?? 1;
  const dyaw = change.yaw ?? 0;
  const c = vec(pivot);
  const offset = vec(a.offset).sub(c).applyAxisAngle(UP, dyaw).multiplyScalar(k).add(c);
  offset.x += change.x ?? 0;
  offset.z += change.z ?? 0;
  return { level: a.level, scale: a.scale * k, yaw: a.yaw + dyaw, offset: plain(offset) };
}

export type AlignState =
  | { step: 'floor'; floor: Vec3[] }
  | { step: 'corners'; level: Alignment['level']; floorPoint: Vec3; corners: Vec3[] }
  | { step: 'nudge'; alignment: Alignment };

export const startAlign = (): AlignState => ({ step: 'floor', floor: [] });

/** Take one tap on the scan. Throws AlignError (state unchanged) when the tap can't be used. */
export function alignTap(state: AlignState, point: Vec3, viewer: Vec3, dims: Dims): AlignState {
  switch (state.step) {
    case 'floor': {
      const floor = [...state.floor, point];
      if (floor.length < 3) return { step: 'floor', floor };
      const level = levelFromFloor([floor[0], floor[1], floor[2]], viewer);
      return { step: 'corners', level, floorPoint: floor[0], corners: [] };
    }
    case 'corners': {
      const corners = [...state.corners, point];
      if (corners.length < 2) return { ...state, corners };
      return { step: 'nudge', alignment: alignFromCorners(state.level, state.floorPoint, corners[0], corners[1], dims) };
    }
    case 'nudge':
      return state;
  }
}
