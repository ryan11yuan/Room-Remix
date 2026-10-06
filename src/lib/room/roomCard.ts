import { predictRt60, withoutFixes } from '@/lib/acoustics/simulate';
import { rateRt60 } from './rating';
import { validateRoom } from './roomState';
import type { RoomState } from './types';

export const TARGET_NOTE = 'Living rooms and bedrooms sound best at 0.3–0.5 s.';

/** The room card's lines, ready to show. `withFixes` and `measured` are null when there is nothing to say. */
export type RoomCard = {
  now: string;
  withFixes: string | null;
  /** "A bit echoey", or "A bit echoey → Balanced" when the fixes change it. */
  rating: string;
  target: string;
  measured: string | null;
  /** The control bar's one line. */
  summary: string;
};

const seconds = (s: number) => `${s.toFixed(2)} s`;

/**
 * Describe a room's sound from its reverb times (RT60, mid bands): now, and with fixes when any fix is on (`rtFixed`,
 * else null). `measured` is the clap measurement, when there is one.
 */
export function describeRoom(rtNow: number, rtFixed: number | null, measured?: number): RoomCard {
  const before = rateRt60(rtNow);
  const after = rtFixed === null ? before : rateRt60(rtFixed);
  const rating = after === before ? before : `${before} → ${after}`;
  return {
    now: `Reverb time now: ${seconds(rtNow)}`,
    withFixes: rtFixed === null ? null : `With fixes: ${seconds(rtFixed)}`,
    rating,
    target: TARGET_NOTE,
    measured: measured !== undefined && Number.isFinite(measured) ? `Measured: ${seconds(measured)}` : null,
    summary: rtFixed === null ? `${seconds(rtNow)} · ${rating}` : `${rtNow.toFixed(2)} → ${seconds(rtFixed)} · ${rating}`,
  };
}

/** The card for a room, or null while the room has errors (there is nothing to predict). Only fixes switched on count. */
export function roomCardFor(room: RoomState): RoomCard | null {
  if (validateRoom(room).length > 0) return null;
  const hasFixes = room.fixes.some((fix) => fix.on);
  return describeRoom(
    predictRt60(withoutFixes(room)).mid,
    hasFixes ? predictRt60(room).mid : null,
    room.calibration.measuredRt60,
  );
}
