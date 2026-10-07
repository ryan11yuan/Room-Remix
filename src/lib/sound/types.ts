import type { Dims } from '@/lib/room/types';

/** world (upright splat units) → room metres: rotate by yaw about Y, shift, scale. Plain data (goes to workers). */
export type RoomFit = { dims: Dims; scale: number; yaw: number; floorY: number; minX: number; minZ: number };
/** Speaker-spot scores on a floor grid; row-major, z rows of x cells. null = not a candidate. */
export type SpotMap = { x0: number; z0: number; step: number; nx: number; nz: number; scores: (number | null)[]; best: { x: number; z: number; score: number } | null };
