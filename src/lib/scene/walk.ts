import { listenerYaw } from '@/lib/acoustics/binaural';
import { LIMITS } from '@/lib/room/constants';
import { GEOMETRY_EPS } from '@/lib/room/geometry';
import { clampPosition } from '@/lib/room/placement';
import type { Dims, RoomState, Vec3 } from '@/lib/room/types';

/** A spot on the floor plan. The listener's height stays whatever it is. */
export type FloorPoint = { x: number; z: number };

export const WALK_SPEED = 1.4; // m/s, a normal walking pace
export const MAX_DT = 0.1; // s: a long frame (or a tab coming back into view) mustn't teleport the listener
export const CAMERA_BACK = 1; // m behind the head
export const CAMERA_UP = 0.3; // m above it
export const CAMERA_SIDE = 0.3; // m to the listener's right: over the shoulder, so the head doesn't hide the speaker
export const CAMERA_MARGIN = 0.1; // the camera stays this far inside the room, so it never shows the back of a scan
export const WALK_ZOOM = { min: 0.6, max: 3 } as const; // how close and far the camera can orbit the head

const KEEP_OUT = LIMITS.minSeparation + 0.01; // a centimetre more than the rule, so float noise can't break it
const ON_RING = 1e-9; // a point computed onto the keep-out ring may land a hair inside it
const RING_SAMPLES = 72; // every 5°
const ARC_CHECK = 0.02; // rad (1 cm of ring): how finely a way round the speaker is checked for walls
const TAU = 2 * Math.PI;

/** Held keys (KeyboardEvent.code) and the way each one walks: forward/back along the camera's view, or sideways. */
const KEY_AXES = new Map<string, { forward: number; right: number }>([
  ['KeyW', { forward: 1, right: 0 }],
  ['ArrowUp', { forward: 1, right: 0 }],
  ['KeyS', { forward: -1, right: 0 }],
  ['ArrowDown', { forward: -1, right: 0 }],
  ['KeyD', { forward: 0, right: 1 }],
  ['ArrowRight', { forward: 0, right: 1 }],
  ['KeyA', { forward: 0, right: -1 }],
  ['ArrowLeft', { forward: 0, right: -1 }],
]);
export const WALK_KEYS: ReadonlySet<string> = new Set(KEY_AXES.keys());

/** A frame's time, capped at MAX_DT; anything that isn't a finite positive number stands still. */
const frameTime = (dt: number): number => (Number.isFinite(dt) ? Math.min(Math.max(dt, 0), MAX_DT) : 0);

/** How far, across the floor, the listener's head must stay from the speaker so the two are at least 0.5 m apart in 3D. */
function keepOutRadius(room: RoomState): number {
  const dy = room.listener.y - room.speaker.y;
  return Math.sqrt(Math.max(0, KEEP_OUT * KEEP_OUT - dy * dy));
}

/** The point moved inside the walls (the listener's wall clearance). */
function inWalls(room: RoomState, p: FloorPoint): FloorPoint {
  const c = clampPosition(room.dims, { x: p.x, y: room.listener.y, z: p.z });
  return { x: c.x, z: c.z };
}

/** Whether the listener may stand here: inside the walls and outside the speaker's keep-out ring. */
function allowed(room: RoomState, p: FloorPoint, radius: number): boolean {
  const w = inWalls(room, p);
  return Math.abs(w.x - p.x) <= GEOMETRY_EPS && Math.abs(w.z - p.z) <= GEOMETRY_EPS && Math.hypot(p.x - room.speaker.x, p.z - room.speaker.z) >= radius - ON_RING; // validateRoom's tolerance: a point computed onto a wall line may land a hair past it
}

/** The unit floor vector from the speaker toward `p` (+x if `p` is right above or below the speaker). */
function awayFromSpeaker(room: RoomState, p: FloorPoint): FloorPoint {
  const dx = p.x - room.speaker.x;
  const dz = p.z - room.speaker.z;
  const d = Math.hypot(dx, dz);
  return d > 0 ? { x: dx / d, z: dz / d } : { x: 1, z: 0 };
}

/** The point on the keep-out ring in the direction of `p` from the speaker. */
function ringPoint(room: RoomState, p: FloorPoint, radius: number): FloorPoint {
  const n = awayFromSpeaker(room, p);
  return { x: room.speaker.x + n.x * radius, z: room.speaker.z + n.z * radius };
}

/** The point on the keep-out ring at `angle` round the speaker (0 is +x, π/2 is +z). */
function onRing(room: RoomState, angle: number, radius: number): FloorPoint {
  return { x: room.speaker.x + Math.cos(angle) * radius, z: room.speaker.z + Math.sin(angle) * radius };
}

/** Where a tap on the floor sends the listener: inside the walls and clear of the speaker. Null when nowhere near it is free. */
export function walkTarget(room: RoomState, point: FloorPoint): FloorPoint | null {
  const radius = keepOutRadius(room);
  const p = inWalls(room, point);
  if (allowed(room, p, radius)) return p;
  // Too close to the speaker: straight out onto the keep-out ring, or else the nearest free spot on it.
  const pushed = inWalls(room, ringPoint(room, p, radius));
  if (allowed(room, pushed, radius)) return pushed;
  let best: FloorPoint | null = null;
  let bestDistance = Infinity;
  for (let i = 0; i < RING_SAMPLES; i++) {
    const angle = (TAU * i) / RING_SAMPLES;
    const q = onRing(room, angle, radius);
    const distance = Math.hypot(q.x - p.x, q.z - p.z);
    if (distance < bestDistance && allowed(room, q, radius)) {
      best = q;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * One step of a walk toward `goal`: at most WALK_SPEED × dt (dt capped at MAX_DT). The speaker is walked around, never
 * through; `done` means the listener arrived, or the speaker and the walls block the way and it stopped where it could.
 */
export function walkStep(room: RoomState, goal: FloorPoint, dt: number): FloorPoint & { done: boolean } {
  const radius = keepOutRadius(room);
  const p = { x: room.listener.x, z: room.listener.z };
  if (!allowed(room, p, radius)) {
    // Starting somewhere not allowed (the room shrank, or the speaker was dragged close): first move to the nearest free spot.
    const free = walkTarget(room, p);
    return free ? { ...free, done: false } : { ...p, done: true };
  }
  const step = WALK_SPEED * frameTime(dt);
  if (step === 0) return { ...p, done: false };
  const togo = Math.hypot(goal.x - p.x, goal.z - p.z);
  if (togo <= step) return allowed(room, goal, radius) ? { ...goal, done: true } : { ...p, done: true };
  const dir = { x: (goal.x - p.x) / togo, z: (goal.z - p.z) / togo };
  const straight = { x: p.x + dir.x * step, z: p.z + dir.z * step };
  if (allowed(room, straight, radius)) return { ...straight, done: false };

  // The speaker is in the way. Off the keep-out ring: walk straight on up to it.
  const s = room.speaker;
  const m = { x: p.x - s.x, z: p.z - s.z };
  if (Math.hypot(m.x, m.z) > radius + 1e-6) {
    const along = m.x * dir.x + m.z * dir.z;
    const t = Math.max(0, -along - Math.sqrt(Math.max(0, along * along - (m.x * m.x + m.z * m.z - radius * radius))));
    return { x: p.x + dir.x * t, z: p.z + dir.z * t, done: false };
  }
  // On the ring: walk round it, the shorter way that no wall blocks, until the goal comes into sight.
  const from = Math.atan2(m.z, m.x);
  const plus = arcRound(room, from, goal, radius, 1);
  const minus = arcRound(room, from, goal, radius, -1);
  if (plus === null && minus === null) return { ...p, done: true }; // the speaker and the walls block the way: stop here
  const sign = minus === null || (plus !== null && plus <= minus) ? 1 : -1;
  const next = onRing(room, from + (sign * step) / radius, radius);
  return allowed(room, next, radius) ? { ...next, done: false } : { ...p, done: true };
}

/**
 * How far round the keep-out ring (radians), starting at angle `from` and going `sign` (+1: increasing angle), the
 * listener walks before the goal comes into sight. Null when a wall cuts across the ring on the way.
 */
function arcRound(room: RoomState, from: number, goal: FloorPoint, radius: number, sign: 1 | -1): number | null {
  const s = room.speaker;
  const toward = Math.atan2(goal.z - s.z, goal.x - s.x);
  const seen = Math.acos(Math.min(1, radius / Math.hypot(goal.x - s.x, goal.z - s.z))); // half the ring the goal can see
  const edge = toward - sign * seen; // the end of that visible stretch this way round reaches first
  const arc = (((sign * (edge - from)) % TAU) + TAU) % TAU;
  for (let a = 0; a < arc; a += ARC_CHECK) {
    if (!allowed(room, onRing(room, from + sign * a, radius), radius)) return null;
  }
  return allowed(room, onRing(room, from + sign * arc, radius), radius) ? arc : null;
}

/** Which way the held keys walk, as a unit floor vector: forward is where the camera looks (`forward`, any length). */
export function keyDirection(keys: ReadonlySet<string>, forward: FloorPoint): FloorPoint | null {
  let ahead = 0;
  let right = 0;
  for (const key of keys) {
    const axes = KEY_AXES.get(key);
    if (axes) {
      ahead += axes.forward;
      right += axes.right;
    }
  }
  ahead = Math.sign(ahead); right = Math.sign(right); // W and the up arrow together count once
  const length = Math.hypot(forward.x, forward.z);
  if (length < 1e-9) return null;
  const f = { x: forward.x / length, z: forward.z / length };
  // three.js axes with y up: the right of a floor direction (x, z) is (−z, x).
  const x = ahead * f.x - right * f.z;
  const z = ahead * f.z + right * f.x;
  const size = Math.hypot(x, z);
  return size < 1e-9 ? null : { x: x / size, z: z / size };
}

/**
 * One frame of walk mode. Held keys win over a tapped goal and cancel it. Returns where the listener moves to (null: they
 * stay put) and the goal still to walk to (null once arrived or blocked).
 */
export function advanceWalk(
  room: RoomState,
  goal: FloorPoint | null,
  direction: FloorPoint | null,
  dt: number,
): { to: FloorPoint | null; goal: FloorPoint | null } {
  // Keys aim one step ahead, so walking into a wall at an angle slides along it only as fast as the keys point along it.
  const reach = WALK_SPEED * frameTime(dt);
  const target = direction
    ? walkTarget(room, { x: room.listener.x + direction.x * reach, z: room.listener.z + direction.z * reach })
    : goal && walkTarget(room, goal); // the speaker or the walls may have moved onto the goal since it was tapped
  if (!target) return { to: null, goal: null };
  const step = walkStep(room, target, dt);
  const moved = step.x !== room.listener.x || step.z !== room.listener.z;
  return { to: moved ? { x: step.x, z: step.z } : null, goal: direction || step.done ? null : goal };
}

/** The point moved CAMERA_MARGIN inside every wall, the floor and the ceiling. */
export function clampInside(dims: Dims, p: Vec3): Vec3 {
  const clamp = (v: number, size: number) => Math.min(Math.max(v, CAMERA_MARGIN), size - CAMERA_MARGIN);
  return { x: clamp(p.x, dims.length), y: clamp(p.y, dims.height), z: clamp(p.z, dims.width) };
}

/**
 * The camera moved toward the head until it is CAMERA_MARGIN inside every wall, the floor and the ceiling. A head that is
 * itself outside the room (the room shrank past the listener) is first moved inside, so the result is always inside.
 */
export function pullInside(dims: Dims, head: Vec3, camera: Vec3): Vec3 {
  const lo = CAMERA_MARGIN;
  const hi = { x: dims.length - lo, y: dims.height - lo, z: dims.width - lo };
  const from = clampInside(dims, head);
  let t = 1;
  for (const axis of ['x', 'y', 'z'] as const) {
    const d = camera[axis] - from[axis];
    if (d > 0 && camera[axis] > hi[axis]) t = Math.min(t, (hi[axis] - from[axis]) / d);
    if (d < 0 && camera[axis] < lo) t = Math.min(t, (lo - from[axis]) / d);
  }
  t = Math.max(0, t);
  return { x: from.x + (camera.x - from.x) * t, y: from.y + (camera.y - from.y) * t, z: from.z + (camera.z - from.z) * t };
}

/**
 * Walk mode's first view: looking at the listener's head from over their right shoulder, CAMERA_BACK behind, CAMERA_UP
 * above and CAMERA_SIDE to the right of it, so the speaker shows beside the head and the floor ahead is in view.
 */
export function walkView(room: RoomState): { position: Vec3; target: Vec3 } {
  const yaw = listenerYaw(room.listener, room.speaker);
  const target = clampInside(room.dims, { x: room.listener.x, y: room.listener.y, z: room.listener.z });
  const facing = { x: Math.cos(yaw), z: Math.sin(yaw) };
  const right = { x: -facing.z, z: facing.x }; // the same rule as keyDirection
  const behind = {
    x: target.x - facing.x * CAMERA_BACK + right.x * CAMERA_SIDE,
    y: target.y + CAMERA_UP,
    z: target.z - facing.z * CAMERA_BACK + right.z * CAMERA_SIDE,
  };
  return { position: pullInside(room.dims, target, behind), target };
}
