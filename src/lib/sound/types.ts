import type { Dims } from '@/lib/room/types';

/** world (upright splat units) → room metres: rotate by yaw about Y, shift, scale. Plain data. */
export type RoomFit = { dims: Dims; scale: number; yaw: number; floorY: number; minX: number; minZ: number };
