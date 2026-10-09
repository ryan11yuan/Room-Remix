import { NUM_BANDS, type Bands } from '@/lib/acoustics/bands';
import { fadeTail } from '@/lib/acoustics/dsp';
import { FURNISHING_SOME, MATERIAL_ALPHA } from '@/lib/acoustics/materials';
import { eyring, roomVolume, totalSurfaceArea } from '@/lib/acoustics/reverbTime';
import { addTail } from '@/lib/acoustics/tail';
import type { Dims } from '@/lib/room/types';

/** The light room echo behind every voice (spec 2026-10-08 §8.4): set by the room's size, not by where you stand. */
export const MAX_ECHO_S = 2;
const FADE_S = 0.1;

/** Eyring per octave band over the fitted box: drywall walls, a carpet floor, a plaster ceiling and some furniture. */
export function echoRt60(d: Dims): Bands {
  const floor = d.length * d.width;
  const walls = 2 * (d.length + d.width) * d.height;
  const absorption = Array.from(
    { length: NUM_BANDS },
    (_, b) => walls * MATERIAL_ALPHA.drywall[b] + floor * (MATERIAL_ALPHA.carpet[b] + MATERIAL_ALPHA.plaster[b] + FURNISHING_SOME[b]),
  );
  return eyring(roomVolume(d), totalSurfaceArea(d), absorption);
}

/** The echo's stereo impulse response: one and a half reverb times of tail, capped at 2 s with the cut faded. */
export function echoIr(d: Dims, sampleRate: number): { left: Float32Array; right: Float32Array } {
  const rt = echoRt60(d);
  const full = 1.5 * Math.max(...rt);
  const length = Math.ceil(Math.min(MAX_ECHO_S, full) * sampleRate);
  const left = new Float32Array(length);
  const right = new Float32Array(length);
  addTail(rt, roomVolume(d), 0, sampleRate, left, right);
  if (full > MAX_ECHO_S) {
    fadeTail(left, sampleRate, FADE_S);
    fadeTail(right, sampleRate, FADE_S);
  }
  return { left, right };
}
