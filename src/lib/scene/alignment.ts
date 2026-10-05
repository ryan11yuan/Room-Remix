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

/**
 * A tap that can't be used, with a message for the user. `retry`, when set, is the state to carry on from
 * (the caller decides whether to use it; `alignTap` never changes the state it was given).
 */
export class AlignError extends Error {
  constructor(
    message: string,
    readonly retry?: AlignState,
  ) {
    super(message);
    this.name = 'AlignError';
  }
}

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

/**
 * Rotation that levels the floor through three tapped points. `inside` is a point off the floor plane on the room side
 * (e.g. the mean of the splat centres); the floor normal is turned toward it. Only its height above the floor matters, so
 * it may sit outside the walls.
 */
export function levelFromFloor(points: [Vec3, Vec3, Vec3], inside: Vec3): Alignment['level'] {
  const [a, b, c] = points.map(vec);
  const u = b.clone().sub(a);
  const v = c.clone().sub(a);
  const normal = new THREE.Vector3().crossVectors(u, v);
  // |u × v|² = |u|²|v|² sin²θ, so this refuses sin θ ≤ 0.01 (about 0.6°), which is unusable for levelling at any scale.
  if (normal.lengthSq() <= 1e-4 * u.lengthSq() * v.lengthSq()) {
    throw new AlignError('Those floor points are in a line. Tap three spots spread out across the floor.');
  }
  normal.normalize();
  if (normal.dot(vec(inside).sub(a)) < 0) normal.negate();
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
  | { step: 'corners'; level: Alignment['level']; floorPoint: Vec3; floorCentre: Vec3; corners: Vec3[] }
  | { step: 'nudge'; alignment: Alignment };

export const startAlign = (): AlignState => ({ step: 'floor', floor: [] });

/**
 * Take one tap on the scan; `inside` is a point inside the room (see `levelFromFloor`), used only to tell which way is up.
 * Which side of the right wall the room lies on is judged from the three floor taps, which are inside the room by construction.
 * Throws AlignError (the given state is not changed) when the tap can't be used.
 */
export function alignTap(state: AlignState, point: Vec3, inside: Vec3, dims: Dims): AlignState {
  switch (state.step) {
    case 'floor': {
      const floor = [...state.floor, point];
      if (floor.length < 3) return { step: 'floor', floor };
      const level = levelFromFloor([floor[0], floor[1], floor[2]], inside);
      const floorCentre = {
        x: (floor[0].x + floor[1].x + floor[2].x) / 3,
        y: (floor[0].y + floor[1].y + floor[2].y) / 3,
        z: (floor[0].z + floor[1].z + floor[2].z) / 3,
      };
      return { step: 'corners', level, floorPoint: floor[0], floorCentre, corners: [] };
    }
    case 'corners': {
      const corners = [...state.corners, point];
      if (corners.length < 2) return { ...state, corners };
      const alignment = alignFromCorners(state.level, state.floorPoint, corners[0], corners[1], dims);
      // The room lies on +z of its right wall. The floor taps are in the room, so if their centre landed on the other side,
      // the wall or the tap order was wrong. (The scan's own bounds can't decide this: windows and floaters push them outside.)
      if (toRoom(alignment, state.floorCentre).z <= 0) {
        throw new AlignError("The room came out on the wrong side. Tap the right wall's front corner first, then its back corner.", {
          ...state,
          corners: [],
        });
      }
      return { step: 'nudge', alignment };
    }
    case 'nudge':
      return state;
  }
}
