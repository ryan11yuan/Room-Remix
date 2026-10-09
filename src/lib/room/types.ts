import type { NameId } from '@/lib/explore/names';

export type Vec3 = { x: number; y: number; z: number };

export type Dims = { length: number; width: number; height: number };

/** What the object finder names (spec 2026-10-08 §4). */
export type ObjectLabel = NameId;
/** A found or added object's box in room metres. */
export type RoomObject = { label: ObjectLabel; min: Vec3; max: Vec3 };
