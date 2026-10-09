import type { RoomObject, Vec3 } from '@/lib/room/types';

/**
 * Where the explorer stands and faces, in room metres (spec 2026-10-08 §7). `heading` is atan2(dz, dx) of the facing
 * direction; turning right increases it, because +z is to the right of +x seen from above.
 */
export type Pose = { x: number; z: number; heading: number };

export const TAU = 2 * Math.PI;

export const centre = (o: RoomObject): Vec3 => ({ x: (o.min.x + o.max.x) / 2, y: (o.min.y + o.max.y) / 2, z: (o.min.z + o.max.z) / 2 });

/** Floor distance from a point to an object's footprint; 0 inside it. */
export function footprintDistance(p: { x: number; z: number }, o: RoomObject): number {
  const dx = Math.max(o.min.x - p.x, 0, p.x - o.max.x);
  const dz = Math.max(o.min.z - p.z, 0, p.z - o.max.z);
  return Math.hypot(dx, dz);
}

/** The clockwise angle on the floor from the facing direction to a point, in [0, 2π). */
export function bearing(pose: Pose, p: { x: number; z: number }): number {
  const a = Math.atan2(p.z - pose.z, p.x - pose.x) - pose.heading;
  return ((a % TAU) + TAU) % TAU;
}

/** A bearing as a clock hour, 1–12, with straight ahead at 12 (spec §7.6). */
export function clockHour(b: number): number {
  const hour = Math.round(b / (Math.PI / 6)) % 12;
  return hour === 0 ? 12 : hour;
}

export const normalizeHeading = (h: number): number => Math.atan2(Math.sin(h), Math.cos(h));
