export type Vec3 = { x: number; y: number; z: number };

export type Dims = { length: number; width: number; height: number };

/** What the object detector can name (spec 2026-10-07 sound §3). Plan 9 Task 3 replaces it with the navigation names. */
export const OBJECT_LABELS = [
  'chair', 'sofa', 'table', 'whiteboard', 'television', 'window', 'curtains', 'rug', 'bookshelf', 'bed', 'cabinet', 'plant',
] as const;
export type ObjectLabel = (typeof OBJECT_LABELS)[number];
/** A detected object's box in room metres. */
export type RoomObject = { label: ObjectLabel; min: Vec3; max: Vec3 };
