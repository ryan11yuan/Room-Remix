import type { ObjectLabel, RoomObject, Vec3 } from '@/lib/room/types';
import type { Bands } from './bands';
import { MATERIALS } from './materials';

export type Box = { min: Vec3; max: Vec3 };

/** Absorption per object (m², 125 Hz – 4 kHz): typical published values for furniture, or a face area × a material. */
const PER_OBJECT: Partial<Record<ObjectLabel, Bands>> = {
  chair: [0.15, 0.25, 0.3, 0.35, 0.35, 0.35],
  sofa: [0.6, 0.9, 1.2, 1.4, 1.4, 1.4],
  bed: [0.8, 1.2, 1.6, 1.8, 1.8, 1.8],
  plant: [0.05, 0.1, 0.15, 0.2, 0.25, 0.25],
};
const HARD_BOARD: Bands = [0.1, 0.07, 0.05, 0.04, 0.04, 0.04]; // painted steel / melamine: a whiteboard
const BOOKS: Bands = [0.3, 0.4, 0.4, 0.4, 0.45, 0.45];
/** Upright things count their front face; flat things their top. */
const FACE_ALPHA: Partial<Record<ObjectLabel, { alpha: Bands; face: 'front' | 'top' }>> = {
  table: { alpha: MATERIALS.woodPanel.alpha, face: 'top' },
  rug: { alpha: MATERIALS.rug.alpha, face: 'top' },
  whiteboard: { alpha: HARD_BOARD, face: 'front' },
  television: { alpha: MATERIALS.glass.alpha, face: 'front' },
  window: { alpha: MATERIALS.glass.alpha, face: 'front' },
  curtains: { alpha: MATERIALS.curtains.alpha, face: 'front' },
  bookshelf: { alpha: BOOKS, face: 'front' },
  cabinet: { alpha: MATERIALS.woodPanel.alpha, face: 'front' },
};

export const OBJECT_INFO: Record<ObjectLabel, { name: string; absorbs: boolean; blocks: boolean }> = {
  chair: { name: 'Chair', absorbs: true, blocks: false },
  sofa: { name: 'Sofa', absorbs: true, blocks: false },
  bed: { name: 'Bed', absorbs: true, blocks: false },
  curtains: { name: 'Curtains', absorbs: true, blocks: false },
  rug: { name: 'Rug', absorbs: true, blocks: false },
  bookshelf: { name: 'Bookshelf', absorbs: true, blocks: true },
  plant: { name: 'Plant', absorbs: true, blocks: false },
  table: { name: 'Table', absorbs: false, blocks: false },
  whiteboard: { name: 'Whiteboard', absorbs: false, blocks: true },
  television: { name: 'TV', absorbs: false, blocks: true },
  window: { name: 'Window', absorbs: false, blocks: false },
  cabinet: { name: 'Cabinet', absorbs: false, blocks: true },
};

/** How much a blocker between speaker and listener cuts the direct sound (dB): low notes bend round, high ones don't. */
export const OCCLUSION_DB: Bands = [2, 4, 7, 10, 13, 16];
export const OCCLUSION_GAIN: Bands = OCCLUSION_DB.map((db) => 10 ** (-db / 20));

export function objectAbsorption(object: RoomObject): Bands {
  const fixed = PER_OBJECT[object.label];
  if (fixed) return [...fixed];
  const { alpha, face } = FACE_ALPHA[object.label]!;
  const x = object.max.x - object.min.x;
  const y = object.max.y - object.min.y;
  const z = object.max.z - object.min.z;
  const area = face === 'top' ? x * z : Math.max(x, z) * y;
  return alpha.map((a) => a * area);
}

export function blockingBoxes(objects: RoomObject[] | undefined): Box[] {
  return (objects ?? []).filter((o) => OBJECT_INFO[o.label].blocks).map(({ min, max }) => ({ min, max }));
}

/** Whether the segment a→b passes through the box (slab method). */
export function segmentHitsBox(a: Vec3, b: Vec3, box: Box): boolean {
  let t0 = 0;
  let t1 = 1;
  for (const k of ['x', 'y', 'z'] as const) {
    const d = b[k] - a[k];
    if (Math.abs(d) < 1e-12) {
      if (a[k] < box.min[k] || a[k] > box.max[k]) return false;
      continue;
    }
    let ta = (box.min[k] - a[k]) / d;
    let tb = (box.max[k] - a[k]) / d;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  return true;
}
