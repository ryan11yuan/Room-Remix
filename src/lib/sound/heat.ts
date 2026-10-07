import type { SpotMap } from './types';

const ALPHA = 150; // of 255: the room still shows through

/** Red (worst on this map) → yellow → green (best), one RGBA pixel per cell, rows in z order. Cells off the map are clear. */
export function heatPixels(map: SpotMap): Uint8Array {
  const out = new Uint8Array(map.nx * map.nz * 4);
  const numbers = map.scores.filter((s): s is number => s !== null);
  const lo = Math.min(...numbers);
  const hi = Math.max(...numbers);
  map.scores.forEach((score, i) => {
    if (score === null) return;
    const t = hi > lo ? (score - lo) / (hi - lo) : 1;
    out[4 * i] = Math.round(255 * Math.min(1, 2 * (1 - t)));
    out[4 * i + 1] = Math.round(255 * Math.min(1, 2 * t));
    out[4 * i + 2] = 40;
    out[4 * i + 3] = ALPHA;
  });
  return out;
}
