export type Vec3 = { x: number; y: number; z: number };

export const MATERIAL_IDS = [
  'drywall',
  'brick',
  'concrete',
  'glass',
  'woodFloor',
  'carpet',
  'tile',
  'curtains',
  'plaster',
  'woodPanel',
  'acousticPanel',
  'rug',
] as const;
export type MaterialId = (typeof MATERIAL_IDS)[number];

/** wallX0/wallX1 are the planes x = 0 and x = length; wallZ0/wallZ1 are z = 0 and z = width. */
export const WALL_IDS = ['wallX0', 'wallX1', 'wallZ0', 'wallZ1'] as const;
export type WallId = (typeof WALL_IDS)[number];

export const SURFACE_IDS = ['floor', 'ceiling', ...WALL_IDS] as const;
export type SurfaceId = (typeof SURFACE_IDS)[number];

export type Furnishing = 'bare' | 'some' | 'full';
export type RugSize = 'S' | 'M' | 'L';

/** Rug centred at (x, z) on the floor, long side along x. */
export type RugFix = { kind: 'rug'; size: RugSize; x: number; z: number; on: boolean };
/** Panel centred at (u, v) in the wall's own coordinates. */
export type PanelFix = { kind: 'panel'; wall: WallId; u: number; v: number; on: boolean };
export type Fix = RugFix | PanelFix;

export type Dims = { length: number; width: number; height: number };

export type RoomState = {
  v: 1;
  name: string;
  dims: Dims;
  surfaces: Record<SurfaceId, MaterialId>;
  furnishing: Furnishing;
  speaker: Vec3;
  listener: Vec3 & { yaw: number | 'faceSpeaker' };
  fixes: Fix[];
  calibration: { factor: number; measuredRt60?: number };
};
