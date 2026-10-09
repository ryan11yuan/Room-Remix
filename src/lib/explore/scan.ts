import type { RoomObject, Vec3 } from '@/lib/room/types';
import { bearing, centre, footprintDistance, type Pose } from './geometry';
import { clipId, nameInfo, NAMES } from './names';

/** Same-name objects closer than this (centre to centre, on the floor) speak once, as a group (spec 2026-10-08 §7.4). */
export const GROUP_M = 1.5;

export type ScanItem = { clip: string; at: Vec3; caption: string };

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** What Space says: each group's clip from where it is, clockwise from straight ahead. */
export function scanItems(objects: RoomObject[], pose: Pose): ScanItem[] {
  const parent = objects.map((_, i) => i);
  const root = (i: number): number => (parent[i] === i ? i : (parent[i] = root(parent[i])));
  const centres = objects.map(centre);
  for (let i = 0; i < objects.length; i++) {
    for (let j = i + 1; j < objects.length; j++) {
      const near = Math.hypot(centres[i].x - centres[j].x, centres[i].z - centres[j].z) <= GROUP_M;
      if (near && objects[i].label === objects[j].label) parent[root(j)] = root(i);
    }
  }
  const groups = new Map<number, number[]>();
  objects.forEach((_, i) => groups.set(root(i), [...(groups.get(root(i)) ?? []), i]));
  return [...groups.values()]
    .map((members) => {
      const mean = (k: 'x' | 'y' | 'z') => members.reduce((sum, i) => sum + centres[i][k], 0) / members.length;
      const info = nameInfo(objects[members[0]].label);
      const words = members.length > 1 ? info.sayMany : info.say;
      return { clip: clipId(words), at: { x: mean('x'), y: mean('y'), z: mean('z') }, caption: capitalize(words) };
    })
    .sort((a, b) => bearing(pose, a.at) - bearing(pose, b.at));
}

const FIRST: readonly string[] = ['door', 'stairs'];
const ORDER = new Map<string, number>(NAMES.map((n, i) => [n.id, i]));

/** What Tab offers: the nearest object of each name, doors first, then stairs, then by distance (spec §7.5). */
export function targetOrder(objects: RoomObject[], pose: Pose): number[] {
  const nearest = new Map<string, { index: number; distance: number }>();
  objects.forEach((o, index) => {
    const distance = footprintDistance(pose, o);
    const seen = nearest.get(o.label);
    if (!seen || distance < seen.distance) nearest.set(o.label, { index, distance });
  });
  const rank = (label: string) => (FIRST.includes(label) ? FIRST.indexOf(label) : FIRST.length);
  return [...nearest.entries()]
    .sort(([la, a], [lb, b]) => rank(la) - rank(lb) || a.distance - b.distance || ORDER.get(la)! - ORDER.get(lb)!)
    .map(([, t]) => t.index);
}
