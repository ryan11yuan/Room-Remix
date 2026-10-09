import type { RoomObject, Vec3 } from '@/lib/room/types';
import { isNameId, nameInfo, NAMES, type NameId } from './names';

/** The helper's checked list (spec 2026-10-08 §6, §10). No DOM or Node imports: the server and the viewer share it. */
export const MAX_CHECKED = 200;
export const CHECKED_FILE = 'checked-objects.json';

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function readVec(v: unknown): Vec3 | null {
  const p = v as Partial<Vec3> | null;
  return p && finite(p.x) && finite(p.y) && finite(p.z) ? { x: p.x, y: p.y, z: p.z } : null;
}

/** `{ objects: RoomObject[] }` as sent or saved, or null if anything in it is wrong (spec §10's 400 cases). */
export function readChecked(data: unknown): RoomObject[] | null {
  const objects = (data as { objects?: unknown } | null)?.objects;
  if (!Array.isArray(objects) || objects.length > MAX_CHECKED) return null;
  const out: RoomObject[] = [];
  for (const o of objects as { label?: unknown; min?: unknown; max?: unknown }[]) {
    if (!o || !isNameId(o.label)) return null;
    const min = readVec(o.min);
    const max = readVec(o.max);
    if (!min || !max || min.x > max.x || min.y > max.y || min.z > max.z) return null;
    out.push({ label: o.label, min, max });
  }
  return out;
}

const ORDER = new Map<string, number>(NAMES.map((n, i) => [n.id, i]));

/** The panel's order: by name, then along the room's length, then its width (spec §6). */
export function sortObjects(objects: RoomObject[]): RoomObject[] {
  return [...objects].sort(
    (a, b) =>
      ORDER.get(a.label)! - ORDER.get(b.label)! ||
      a.min.x + a.max.x - (b.min.x + b.max.x) ||
      a.min.z + a.max.z - (b.min.z + b.max.z),
  );
}

/** The box an added object of this name gets: its typical size, centred on a floor point, from its height off the floor. */
export function defaultBox(label: NameId, at: { x: number; z: number }): RoomObject {
  const { size: [w, d, h], bottom } = nameInfo(label);
  return { label, min: { x: at.x - w / 2, y: bottom, z: at.z - d / 2 }, max: { x: at.x + w / 2, y: bottom + h, z: at.z + d / 2 } };
}

export function addObject(objects: RoomObject[], label: NameId, at: { x: number; z: number }): { objects: RoomObject[]; index: number } {
  const added = defaultBox(label, at);
  const sorted = sortObjects([...objects, added]);
  return { objects: sorted, index: sorted.indexOf(added) };
}

const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;
const sameBox = (a: RoomObject, b: RoomObject) =>
  (['x', 'y', 'z'] as const).every((k) => near(a.min[k], b.min[k]) && near(a.max[k], b.max[k]));

/** Rename one object. A box still at its added size takes the new name's size; a found box keeps its own (spec §6). */
export function renameObject(objects: RoomObject[], index: number, label: NameId): { objects: RoomObject[]; index: number } {
  const old = objects[index];
  const centre = { x: (old.min.x + old.max.x) / 2, z: (old.min.z + old.max.z) / 2 };
  const renamed = sameBox(old, defaultBox(old.label, centre)) ? defaultBox(label, centre) : { ...old, label };
  const sorted = sortObjects(objects.map((o, i) => (i === index ? renamed : o)));
  return { objects: sorted, index: sorted.indexOf(renamed) };
}

export function removeObject(objects: RoomObject[], index: number): RoomObject[] {
  return objects.filter((_, i) => i !== index);
}
