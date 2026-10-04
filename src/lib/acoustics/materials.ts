import type { Furnishing, MaterialId } from '@/lib/room/types';
import type { Bands } from './bands';

/** Random-incidence absorption coefficients, 125 Hz – 4 kHz, from standard published tables. */
export const MATERIALS: Record<MaterialId, { label: string; alpha: Bands }> = {
  drywall: { label: 'Drywall', alpha: [0.29, 0.1, 0.05, 0.04, 0.07, 0.09] },
  brick: { label: 'Brick', alpha: [0.03, 0.03, 0.03, 0.04, 0.05, 0.07] },
  concrete: { label: 'Concrete (painted)', alpha: [0.01, 0.01, 0.01, 0.02, 0.02, 0.02] },
  glass: { label: 'Glass / window', alpha: [0.35, 0.25, 0.18, 0.12, 0.07, 0.04] },
  woodFloor: { label: 'Wood floor', alpha: [0.15, 0.11, 0.1, 0.07, 0.06, 0.07] },
  carpet: { label: 'Carpet (wall to wall)', alpha: [0.08, 0.24, 0.57, 0.69, 0.71, 0.73] },
  tile: { label: 'Tile / linoleum', alpha: [0.02, 0.03, 0.03, 0.03, 0.03, 0.02] },
  curtains: { label: 'Heavy curtains', alpha: [0.07, 0.31, 0.49, 0.75, 0.7, 0.6] },
  plaster: { label: 'Plaster', alpha: [0.14, 0.1, 0.06, 0.05, 0.04, 0.03] },
  woodPanel: { label: 'Wood panelling', alpha: [0.28, 0.22, 0.17, 0.09, 0.1, 0.11] },
  acousticPanel: { label: 'Acoustic panels', alpha: [0.18, 0.7, 0.95, 0.95, 0.95, 0.95] },
  rug: { label: 'Area rug', alpha: [0.02, 0.06, 0.14, 0.37, 0.6, 0.65] },
};

/** Extra absorption (m² per m² of floor) for furniture the box model cannot see. */
export const FURNISHING_ALPHA_PER_FLOOR_M2: Record<Furnishing, Bands> = {
  bare: [0, 0, 0, 0, 0, 0],
  some: [0.1, 0.18, 0.25, 0.3, 0.3, 0.3],
  full: [0.2, 0.35, 0.5, 0.55, 0.55, 0.55],
};
