import type { Bands } from './bands';

export type MaterialId = 'drywall' | 'carpet' | 'plaster';

/** Random-incidence absorption coefficients, 125 Hz – 4 kHz, from standard published tables (spec 2026-10-08 §8.4). */
export const MATERIAL_ALPHA: Record<MaterialId, Bands> = {
  drywall: [0.29, 0.1, 0.05, 0.04, 0.07, 0.09],
  carpet: [0.08, 0.24, 0.57, 0.69, 0.71, 0.73],
  plaster: [0.14, 0.1, 0.06, 0.05, 0.04, 0.03],
};

/** Extra absorption (m² per m² of floor) for furniture a box can't see: the old "some furnishing" level. */
export const FURNISHING_SOME: Bands = [0.1, 0.18, 0.25, 0.3, 0.3, 0.3];
