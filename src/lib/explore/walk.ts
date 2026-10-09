import type { Dims, RoomObject, Vec3 } from '@/lib/room/types';
import { footprintDistance, normalizeHeading, type Pose } from './geometry';
import { nameInfo, type NameId } from './names';

/** Walking by sound (spec 2026-10-08 §7.2–7.3). */
export const STEP_M = 0.5;
export const TURN = Math.PI / 6; // one clock hour
export const WALL_GAP_M = 0.3;
export const BODY_M = 0.25;
export const CONTACT_HEIGHT_M = 1;

export type Blocker = { label: NameId | 'wall'; at: Vec3 };
export type StepResult = { ok: true; pose: Pose } | { ok: false; blocker: Blocker };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function clampToRoom(dims: Dims, p: { x: number; z: number }): { x: number; z: number } {
  return { x: clamp(p.x, WALL_GAP_M, dims.length - WALL_GAP_M), z: clamp(p.z, WALL_GAP_M, dims.width - WALL_GAP_M) };
}

export function turn(pose: Pose, direction: 1 | -1): Pose {
  return { ...pose, heading: normalizeHeading(pose.heading + direction * TURN) };
}

const inside = (p: { x: number; z: number }, o: RoomObject, grow: number) =>
  p.x >= o.min.x - grow && p.x <= o.max.x + grow && p.z >= o.min.z - grow && p.z <= o.max.z + grow;

/**
 * One step forward (1) or back (−1). Blocked by a wall closer than 0.3 m, or by a blocking object's footprint grown by
 * 0.25 m for the body, unless you're already inside it. A blocker comes back with its nearest point to you, at 1 m.
 */
export function step(dims: Dims, objects: RoomObject[], pose: Pose, direction: 1 | -1): StepResult {
  const to = { x: pose.x + direction * STEP_M * Math.cos(pose.heading), z: pose.z + direction * STEP_M * Math.sin(pose.heading) };
  const wall = [
    { depth: WALL_GAP_M - to.x, at: { x: 0, z: pose.z } },
    { depth: to.x - (dims.length - WALL_GAP_M), at: { x: dims.length, z: pose.z } },
    { depth: WALL_GAP_M - to.z, at: { x: pose.x, z: 0 } },
    { depth: to.z - (dims.width - WALL_GAP_M), at: { x: pose.x, z: dims.width } },
  ]
    .filter((w) => w.depth > 0)
    .sort((a, b) => b.depth - a.depth)[0];
  if (wall) {
    const at = { x: clamp(wall.at.x, 0, dims.length), y: CONTACT_HEIGHT_M, z: clamp(wall.at.z, 0, dims.width) };
    return { ok: false, blocker: { label: 'wall', at } };
  }
  let hit: RoomObject | null = null;
  let nearest = Infinity;
  for (const o of objects) {
    if (!nameInfo(o.label).blocks || !inside(to, o, BODY_M) || inside(pose, o, BODY_M)) continue;
    const d = footprintDistance(pose, o);
    if (d < nearest) [hit, nearest] = [o, d];
  }
  if (hit) {
    const at = { x: clamp(pose.x, hit.min.x, hit.max.x), y: CONTACT_HEIGHT_M, z: clamp(pose.z, hit.min.z, hit.max.z) };
    return { ok: false, blocker: { label: hit.label, at } };
  }
  return { ok: true, pose: { ...pose, ...to } };
}
