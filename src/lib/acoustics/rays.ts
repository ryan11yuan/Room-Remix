import { validateRoom } from '@/lib/room/roomState';
import type { RoomState, Vec3 } from '@/lib/room/types';
import { makeSurfaceLookup } from './absorption';
import type { Bands } from './bands';
import { diffuseBounceFactor, diffuseGains } from './diffuse';
import { computeImageSources, type Arrival } from './imageSource';
import { blockingBoxes } from './objects';

export const RAY_ORDER = 4;
export const MAX_RAYS = 150;

export type RayPath = {
  points: Vec3[]; // speaker, bounces in travel order, listener
  energy: number; // mean squared band gain (distance, walls, diffuse loss): ranks and brightens paths
  vertexEnergy: number[]; // share of energy left at each point: 1 at the speaker, lower after each bounce
  hitFix: boolean[]; // per bounce: landed on a rug or panel
};

export function toRayPath(a: Arrival, bounce: Bands): RayPath {
  const gains = diffuseGains(a, bounce);
  const diffuse = bounce.reduce((sum, k) => sum + k * k, 0) / bounce.length;
  const vertexEnergy = [1];
  for (const absorption of a.hitAbsorption) {
    const previous = vertexEnergy[vertexEnergy.length - 1];
    vertexEnergy.push(Math.min(previous, previous * (1 - absorption) * diffuse));
  }
  vertexEnergy.push(vertexEnergy[vertexEnergy.length - 1]); // the last leg carries it to the listener
  return {
    points: a.points,
    energy: gains.reduce((sum, g) => sum + g * g, 0) / gains.length,
    vertexEnergy,
    hitFix: a.hitFix,
  };
}

/** Low-order paths for drawing, cheap enough to recompute on every drag frame. Empty for invalid rooms. */
export function computeRayPaths(room: RoomState, maxOrder = RAY_ORDER, maxPaths = MAX_RAYS): RayPath[] {
  if (validateRoom(room).length > 0) return [];
  const bounce = diffuseBounceFactor(room);
  return computeImageSources({
    dims: room.dims,
    source: room.speaker,
    listener: room.listener,
    maxOrder,
    lookup: makeSurfaceLookup(room),
    blockers: blockingBoxes(room.objects),
  })
    .map((a) => toRayPath(a, bounce))
    .sort((p, q) => q.energy - p.energy)
    .slice(0, maxPaths);
}
