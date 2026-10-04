import { clippedArea, fixRect, fixSurface, rectContains, surfaceSize, toSurfaceCoords } from '@/lib/room/geometry';
import { SURFACE_IDS, type Fix, type RoomState, type SurfaceId, type Vec3 } from '@/lib/room/types';
import { NUM_BANDS, type Bands } from './bands';
import { FURNISHING_ALPHA_PER_FLOOR_M2, MATERIALS } from './materials';

export type SurfaceLookup = (surface: SurfaceId, point: Vec3) => { alpha: Bands; fix: boolean };

const activeFixes = (room: RoomState) => room.fixes.filter((f) => f.on);
const fixAlpha = (fix: Fix) => MATERIALS[fix.kind === 'rug' ? 'rug' : 'acousticPanel'].alpha;

/** Material absorption at a point on a surface, taking switched-on fixes into account. */
export function makeSurfaceLookup(room: RoomState): SurfaceLookup {
  const fixes = activeFixes(room).map((fix) => ({ surface: fixSurface(fix), rect: fixRect(fix), alpha: fixAlpha(fix) }));
  return (surface, point) => {
    const { u, v } = toSurfaceCoords(surface, point);
    for (const f of fixes) {
      if (f.surface === surface && rectContains(f.rect, u, v)) return { alpha: f.alpha, fix: true };
    }
    return { alpha: MATERIALS[room.surfaces[surface]].alpha, fix: false };
  };
}

/** Total absorption area Σ S·α per band (m²), including fixes, furnishing and calibration. */
export function absorptionArea(room: RoomState): Bands {
  const total = new Array<number>(NUM_BANDS).fill(0);

  for (const surface of SURFACE_IDS) {
    const size = surfaceSize(room.dims, surface);
    const alpha = MATERIALS[room.surfaces[surface]].alpha;
    for (let b = 0; b < NUM_BANDS; b++) total[b] += size.u * size.v * alpha[b];
  }

  for (const fix of activeFixes(room)) {
    const surface = fixSurface(fix);
    const area = clippedArea(fixRect(fix), surfaceSize(room.dims, surface));
    const base = MATERIALS[room.surfaces[surface]].alpha;
    const alpha = fixAlpha(fix);
    for (let b = 0; b < NUM_BANDS; b++) total[b] += area * (alpha[b] - base[b]);
  }

  const floorArea = room.dims.length * room.dims.width;
  const furnishing = FURNISHING_ALPHA_PER_FLOOR_M2[room.furnishing];
  for (let b = 0; b < NUM_BANDS; b++) total[b] += floorArea * furnishing[b];

  return total.map((a) => a * room.calibration.factor);
}
