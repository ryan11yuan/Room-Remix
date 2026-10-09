import type { Dims, RoomObject } from '@/lib/room/types';
import { bearing, centre, clockHour, footprintDistance, type Pose } from './geometry';
import { nameInfo, NAMES } from './names';

/** Everything the narrator says (spec 2026-10-08 §7). */
export const HELP_LINE =
  "W and S walk. A and D turn. Space: what's around you. Tab: choose a place. Enter: go there. Escape: stop. H: these keys again.";
export const STOPPED_LINE = 'Stopped.';
export const NOTHING_AROUND_LINE = 'Nothing found around you.';
export const NOTHING_TO_GO_TO_LINE = 'Nothing to go to yet.';

/** Under 1 m "less than a metre"; under 3 m to the half metre; otherwise whole metres (spec §7.6). */
export function distanceWords(metres: number): string {
  if (metres < 1) return 'less than a metre';
  const rounded = metres < 3 ? Math.round(metres * 2) / 2 : Math.round(metres);
  return `about ${rounded} ${rounded === 1 ? 'metre' : 'metres'}`;
}

export function roomSizeWords(dims: Dims): string {
  return `about ${Math.max(1, Math.round(dims.length))} by ${Math.max(1, Math.round(dims.width))} metres`;
}

/** "a", "a and b", "a, b and c". */
export function listWords(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

export function countWords(objects: RoomObject[]): string {
  return listWords(
    NAMES.flatMap((n) => {
      const count = objects.filter((o) => o.label === n.id).length;
      return count === 0 ? [] : [`${count} ${count === 1 ? n.one : n.many}`];
    }),
  );
}

/** "6 o'clock, about 2 metres": the clock hour to its centre, the distance to its footprint. */
const whereWords = (o: RoomObject, pose: Pose) => `${clockHour(bearing(pose, centre(o)))} o'clock, ${distanceWords(footprintDistance(pose, o))}`;

export function introLine(dims: Dims, objects: RoomObject[], pose: Pose): string {
  const parts = [`A room ${roomSizeWords(dims)}, with ${countWords(objects) || 'nothing found yet'}.`, "You're at the starting point."];
  const door = objects
    .filter((o) => o.label === 'door')
    .sort((a, b) => footprintDistance(pose, a) - footprintDistance(pose, b))[0];
  if (door) parts.push(`The nearest door is at ${whereWords(door, pose)}.`);
  parts.push('Press H for help.');
  return parts.join(' ');
}

export const targetLine = (o: RoomObject, pose: Pose): string => `${nameInfo(o.label).title}, ${whereWords(o, pose)}.`;

export const arrivalLine = (o: RoomObject): string => `You're at the ${nameInfo(o.label).say}.`;
