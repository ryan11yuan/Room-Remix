import type { Dims } from '@/lib/room/types';
import { AIR_M, type Bands } from './bands';

/** Mean absorption is clamped below 1 so ln(1 − ᾱ) stays finite in heavily treated or calibrated rooms. */
export const MAX_MEAN_ALPHA = 0.99;

export const roomVolume = (d: Dims) => d.length * d.width * d.height;

export const totalSurfaceArea = (d: Dims) => 2 * (d.length * d.width + d.length * d.height + d.width * d.height);

export function sabine(volume: number, absorption: Bands, air: Bands = AIR_M): Bands {
  return absorption.map((a, b) => (0.161 * volume) / (a + 4 * air[b] * volume));
}

export function eyring(volume: number, surfaceArea: number, absorption: Bands, air: Bands = AIR_M): Bands {
  return absorption.map((a, b) => {
    const meanAlpha = Math.min(a / surfaceArea, MAX_MEAN_ALPHA);
    return (0.161 * volume) / (-surfaceArea * Math.log(1 - meanAlpha) + 4 * air[b] * volume);
  });
}

export const midRt60 = (rt: Bands) => (rt[2] + rt[3]) / 2;
