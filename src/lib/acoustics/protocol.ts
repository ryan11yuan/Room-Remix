import { validateRoom } from '@/lib/room/roomState';
import type { RoomState } from '@/lib/room/types';
import { normalizeLoudness } from './loudness';
import { simulateBoth, type AcousticsResult } from './simulate';

export type SimRequest = { id: number; room: RoomState; sampleRate: number };
export type SimResponse =
  | { id: number; ok: true; now: AcousticsResult; withFixes: AcousticsResult }
  | { id: number; ok: false; error: string };

export function handleRequest({ id, room, sampleRate }: SimRequest): SimResponse {
  const errors = validateRoom(room);
  if (errors.length > 0) return { id, ok: false, error: errors.map((e) => e.message).join(' ') };
  try {
    const { now, withFixes } = simulateBoth(room, sampleRate);
    // IRs leave the worker loudness-matched, so the main thread never runs these large FFTs.
    return {
      id,
      ok: true,
      now: { ...now, ir: normalizeLoudness(now.ir) },
      withFixes: { ...withFixes, ir: normalizeLoudness(withFixes.ir) },
    };
  } catch (e) {
    return { id, ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function transferables(res: SimResponse): ArrayBuffer[] {
  if (!res.ok) return [];
  return [res.now.ir.left, res.now.ir.right, res.withFixes.ir.left, res.withFixes.ir.right].map(
    (a) => a.buffer as ArrayBuffer,
  );
}
