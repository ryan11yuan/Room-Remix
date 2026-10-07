import { normalizeLoudness } from '@/lib/acoustics/loudness';
import { simulateRoom, type StereoIr } from '@/lib/acoustics/simulate';
import { validateRoom } from '@/lib/room/roomState';
import type { RoomState } from '@/lib/room/types';
import { findBestSpots } from './bestSpot';
import type { SpotMap } from './types';

export type SoundRequest = { id: number; kind: 'ir'; room: RoomState; sampleRate: number } | { id: number; kind: 'spots'; room: RoomState };
export type SoundResponse =
  | { id: number; ok: true; kind: 'ir'; ir: StereoIr; rt60: number }
  | { id: number; ok: true; kind: 'spots'; map: SpotMap }
  | { id: number; ok: false; error: string };

export function handleSound(req: SoundRequest): SoundResponse {
  try {
    if (req.kind === 'spots') return { id: req.id, ok: true, kind: 'spots', map: findBestSpots(req.room) };
    const errors = validateRoom(req.room);
    if (errors.length > 0) return { id: req.id, ok: false, error: errors.map((e) => e.message).join(' ') };
    const result = simulateRoom(req.room, req.sampleRate);
    return { id: req.id, ok: true, kind: 'ir', ir: normalizeLoudness(result.ir), rt60: result.rt60.mid };
  } catch (e) {
    return { id: req.id, ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function soundTransferables(res: SoundResponse): ArrayBuffer[] {
  return res.ok && res.kind === 'ir' ? [res.ir.left.buffer as ArrayBuffer, res.ir.right.buffer as ArrayBuffer] : [];
}
