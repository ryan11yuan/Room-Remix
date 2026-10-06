import type { Furnishing, SurfaceId } from './types';

/**
 * The names the app gives the six surfaces, as you stand facing the front wall: x runs from the front wall (x = 0)
 * toward the back wall, z from the right wall (z = 0) toward the left wall. The form, the top view and the setup
 * wizard all use these, so they never disagree.
 */
export const SURFACE_LABELS: Record<SurfaceId, string> = {
  floor: 'Floor',
  ceiling: 'Ceiling',
  wallX0: 'Front wall',
  wallX1: 'Back wall',
  wallZ0: 'Right wall',
  wallZ1: 'Left wall',
};

export const FURNISHING_LABELS: Record<Furnishing, string> = {
  bare: 'Bare (empty room)',
  some: 'Some (bed or sofa)',
  full: 'Full (bed, sofa, shelves, curtains)',
};
