import type { MaterialId } from '@/lib/room/types';

/** Display tint per material: warm for soft, absorbent ones; grey and blue for hard, reflective ones. */
export const MATERIAL_COLORS: Record<MaterialId, number> = {
  drywall: 0xd6d3cd,
  brick: 0xb5523b,
  concrete: 0x8a8d91,
  glass: 0x7fb7d9,
  woodFloor: 0xa8743f,
  carpet: 0x7d5a8c,
  tile: 0xc9ccd1,
  curtains: 0x9c3d54,
  plaster: 0xe6dfd3,
  woodPanel: 0x8b5a2b,
  acousticPanel: 0x3f8f6b,
  rug: 0xc98a3d,
};

export const SPEAKER_COLOR = 0xf59e0b;
export const LISTENER_COLOR = 0x38bdf8;
export const RAY_COLOR = 0xfde68a;
