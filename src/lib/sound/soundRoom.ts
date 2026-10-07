import { LIMITS } from '@/lib/room/constants';
import { validateRoom } from '@/lib/room/roomState';
import type { Dims, MaterialId, RoomObject, RoomState, SurfaceId, Vec3 } from '@/lib/room/types';

/** Fixed materials for a splat room (spec §2): the objects add the furniture. */
export const SOUND_SURFACES: Record<SurfaceId, MaterialId> = {
  floor: 'carpet', ceiling: 'plaster', wallX0: 'drywall', wallX1: 'drywall', wallZ0: 'drywall', wallZ1: 'drywall',
};
export const SPEAKER_HEIGHT = 1.0; // m: on a stand
export const SPEAKER_WALL_GAP = 0.5;
const LISTENER_GAP = LIMITS.wallClearance + 0.01;
const SEPARATION = LIMITS.minSeparation + 0.01;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function soundRoom(dims: Dims, objects: RoomObject[], speaker: Vec3, listener: Vec3 & { yaw: number }): RoomState {
  return {
    v: 1,
    name: 'Video room',
    dims,
    surfaces: SOUND_SURFACES,
    furnishing: 'bare',
    speaker,
    listener,
    fixes: [],
    calibration: { factor: 1 },
    objects,
  };
}

export function clampSpeaker(dims: Dims, p: { x: number; z: number }): Vec3 {
  return {
    x: clamp(p.x, SPEAKER_WALL_GAP, dims.length - SPEAKER_WALL_GAP),
    y: Math.min(SPEAKER_HEIGHT, dims.height - SPEAKER_WALL_GAP),
    z: clamp(p.z, SPEAKER_WALL_GAP, dims.width - SPEAKER_WALL_GAP),
  };
}

/** The camera as a listener: kept inside the room and out of the speaker's 0.5 m (spec §7). Null if no valid spot is near. */
export function placeListener(dims: Dims, speaker: Vec3, p: Vec3): Vec3 | null {
  const inside = (q: Vec3): Vec3 => ({
    x: clamp(q.x, LISTENER_GAP, dims.length - LISTENER_GAP),
    y: clamp(q.y, LISTENER_GAP, dims.height - LISTENER_GAP),
    z: clamp(q.z, LISTENER_GAP, dims.width - LISTENER_GAP),
  });
  let q = inside(p);
  const dy = q.y - speaker.y;
  if (Math.hypot(q.x - speaker.x, dy, q.z - speaker.z) < SEPARATION) {
    let ux = q.x - speaker.x;
    let uz = q.z - speaker.z;
    const len = Math.hypot(ux, uz);
    if (len < 1e-6) [ux, uz] = [1, 0];
    else [ux, uz] = [ux / len, uz / len];
    const h = Math.sqrt(Math.max(0, SEPARATION * SEPARATION - dy * dy)) + 1e-6;
    q = inside({ x: speaker.x + ux * h, y: q.y, z: speaker.z + uz * h });
  }
  return validateRoom(soundRoom(dims, [], speaker, { ...q, yaw: 0 })).length === 0 ? q : null;
}
