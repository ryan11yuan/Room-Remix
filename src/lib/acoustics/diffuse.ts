import type { RoomState } from '@/lib/room/types';
import { absorptionArea } from './absorption';
import { mapBands, type Bands } from './bands';
import type { Arrival } from './imageSource';
import { MAX_MEAN_ALPHA, totalSurfaceArea } from './reverbTime';

/**
 * Furnishing and calibration are diffuse absorption the walls in the image model don't carry.
 * This per-bounce factor makes image-source decay match the Eyring tail's mean absorption.
 */
export function diffuseBounceFactor(room: RoomState): Bands {
  const area = totalSurfaceArea(room.dims);
  const total = absorptionArea(room);
  const surfaceOnly = absorptionArea({ ...room, furnishing: 'bare', calibration: { factor: 1 } });
  return mapBands((b) => {
    const meanTotal = Math.min(total[b] / area, MAX_MEAN_ALPHA);
    const meanSurface = Math.min(surfaceOnly[b] / area, MAX_MEAN_ALPHA);
    return Math.sqrt((1 - meanTotal) / (1 - meanSurface));
  });
}

/** An arrival's band gains with the diffuse factor applied per bounce; a path never reflects more than 100 %. */
export function diffuseGains(a: Arrival, bounce: Bands): Bands {
  return a.gains.map((g, b) => g * Math.min(bounce[b] ** a.order, 1 / a.reflection[b]));
}
