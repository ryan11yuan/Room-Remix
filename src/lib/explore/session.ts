import type { Dims, RoomObject, Vec3 } from '@/lib/room/types';
import { hasArrived } from './beacon';
import { centre, footprintDistance, type Pose } from './geometry';
import { clipId, nameInfo, WALL_CLIP } from './names';
import { scanItems, targetOrder, type ScanItem } from './scan';
import { clampToRoom, step, turn } from './walk';
import { arrivalLine, HELP_LINE, introLine, NOTHING_AROUND_LINE, NOTHING_TO_GO_TO_LINE, STOPPED_LINE, targetLine } from './words';

/** The explorer's ears: the phone's assumed height while filming (spec 2026-10-08 §7.1). */
export const EAR_HEIGHT_M = 1.5;

export type Action = 'forward' | 'back' | 'left' | 'right' | 'scan' | 'next' | 'previous' | 'go' | 'stop' | 'help';
export type Effect =
  | { kind: 'say'; text: string }
  | { kind: 'clip'; clip: string; at: Vec3 }
  | { kind: 'scan'; items: ScanItem[] }
  | { kind: 'footstep' }
  | { kind: 'thud'; at: Vec3 }
  | { kind: 'chime' };

/** The explorer's state. Pure data: `act` returns a new one and the sounds to play, so all of it is testable. */
export type Session = { dims: Dims; objects: RoomObject[]; pose: Pose; chosen: number | null; going: boolean };
export type Turn = { session: Session; effects: Effect[] };

const say = (session: Session, text: string): Turn => ({ session, effects: [{ kind: 'say', text }] });

export function startSession(dims: Dims, objects: RoomObject[], start: Pose): Turn {
  const pose = { ...clampToRoom(dims, start), heading: start.heading };
  return say({ dims, objects, pose, chosen: null, going: false }, introLine(dims, objects, pose));
}

/** The target's clip from where it is, then the narrator's line (spec §7.5). */
function announce(s: Session, index: number): Effect[] {
  const o = s.objects[index];
  return [
    { kind: 'clip', clip: clipId(nameInfo(o.label).say), at: centre(o) },
    { kind: 'say', text: targetLine(o, s.pose) },
  ];
}

/** While going, within a metre of the target: chime, say so, and stop. */
function arrive(s: Session, effects: Effect[]): Turn {
  if (!s.going || s.chosen === null) return { session: s, effects };
  const o = s.objects[s.chosen];
  if (!hasArrived(footprintDistance(s.pose, o))) return { session: s, effects };
  return { session: { ...s, going: false }, effects: [...effects, { kind: 'chime' }, { kind: 'say', text: arrivalLine(o) }] };
}

function choose(s: Session, direction: 1 | -1): Turn {
  const order = targetOrder(s.objects, s.pose);
  if (order.length === 0) return say(s, NOTHING_TO_GO_TO_LINE);
  const at = s.chosen === null ? -1 : order.indexOf(s.chosen);
  const i = at === -1 ? (direction === 1 ? 0 : order.length - 1) : (at + direction + order.length) % order.length;
  return { session: { ...s, chosen: order[i] }, effects: announce(s, order[i]) };
}

export function act(s: Session, action: Action): Turn {
  switch (action) {
    case 'forward':
    case 'back': {
      const r = step(s.dims, s.objects, s.pose, action === 'forward' ? 1 : -1);
      if (!r.ok) {
        const clip = r.blocker.label === 'wall' ? WALL_CLIP : clipId(nameInfo(r.blocker.label).say);
        return { session: s, effects: [{ kind: 'thud', at: r.blocker.at }, { kind: 'clip', clip, at: r.blocker.at }] };
      }
      return arrive({ ...s, pose: r.pose }, [{ kind: 'footstep' }]);
    }
    case 'left':
    case 'right':
      return { session: { ...s, pose: turn(s.pose, action === 'right' ? 1 : -1) }, effects: [] };
    case 'scan': {
      const items = scanItems(s.objects, s.pose);
      return items.length > 0 ? { session: s, effects: [{ kind: 'scan', items }] } : say(s, NOTHING_AROUND_LINE);
    }
    case 'next':
    case 'previous':
      return choose(s, action === 'next' ? 1 : -1);
    case 'go': {
      const order = targetOrder(s.objects, s.pose);
      const chosen = s.chosen ?? (order.length > 0 ? order[0] : null);
      if (chosen === null) return say(s, NOTHING_TO_GO_TO_LINE);
      return arrive({ ...s, chosen, going: true }, s.chosen === null ? announce(s, chosen) : []);
    }
    case 'stop':
      return s.going ? say({ ...s, going: false }, STOPPED_LINE) : { session: s, effects: [] };
    case 'help':
      return say(s, HELP_LINE);
  }
}

/** Where the pulse plays from, and how far away it is; null unless going somewhere. */
export function pulseTarget(s: Session): { at: Vec3; distance: number } | null {
  if (!s.going || s.chosen === null) return null;
  const o = s.objects[s.chosen];
  return { at: centre(o), distance: footprintDistance(s.pose, o) };
}

export const earPosition = (s: Session): Vec3 => ({ x: s.pose.x, y: EAR_HEIGHT_M, z: s.pose.z });
