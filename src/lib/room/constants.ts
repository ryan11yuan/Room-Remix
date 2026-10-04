import type { RugSize } from './types';

export const LIMITS = {
  minLengthWidth: 1.5,
  maxLengthWidth: 30,
  minHeight: 2,
  maxHeight: 15,
  wallClearance: 0.3,
  minSeparation: 0.5,
  maxRugs: 1,
  maxPanels: 8,
} as const;

/** Rug footprint: x = extent along the room length, z = extent along the width. */
export const RUG_SIZES: Record<RugSize, { x: number; z: number }> = {
  S: { x: 1.8, z: 1.2 },
  M: { x: 2.3, z: 1.6 },
  L: { x: 3.0, z: 2.0 },
};

/** Panel size: u = width along the wall, v = height. */
export const PANEL_SIZE = { u: 0.6, v: 1.2 } as const;
