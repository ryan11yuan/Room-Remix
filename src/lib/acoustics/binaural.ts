import type { RoomState, Vec3 } from '@/lib/room/types';
import { mapBands, SPEED_OF_SOUND, type Bands } from './bands';

export const HEAD_RADIUS = 0.0875;
/** Far-ear level drop (dB) per band for sound arriving fully from the side. */
export const ILD_MAX_DB: Bands = [0.5, 1, 3, 6, 10, 15];

export function listenerYaw(listener: RoomState['listener'], speaker: Vec3): number {
  if (listener.yaw !== 'faceSpeaker') return listener.yaw;
  return Math.atan2(speaker.z - listener.z, speaker.x - listener.x);
}

export type EarResponse = { delayLeft: number; delayRight: number; gainLeft: Bands; gainRight: Bands };

/** Spherical-head cues for a sound arriving from `direction` (unit vector from the listener). */
export function earResponse(direction: Vec3, yaw: number): EarResponse {
  const sinLateral = Math.max(-1, Math.min(1, -Math.sin(yaw) * direction.x + Math.cos(yaw) * direction.z));
  const lateral = Math.asin(sinLateral);
  const itd = (HEAD_RADIUS / SPEED_OF_SOUND) * (lateral + sinLateral); // > 0: right ear hears it first
  const near = mapBands(() => 1);
  const far = mapBands((b) => 10 ** ((-ILD_MAX_DB[b] * Math.abs(sinLateral)) / 20));
  const fromRight = sinLateral > 0;
  return {
    delayLeft: Math.max(itd, 0),
    delayRight: Math.max(-itd, 0),
    gainLeft: fromRight ? far : near,
    gainRight: fromRight ? near : far,
  };
}
