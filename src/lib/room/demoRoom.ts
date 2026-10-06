import type { RoomState } from './types';

/**
 * The demo room on the landing page. PLACEHOLDER size and materials: a typical carpeted bedroom, until the author's
 * measured bedroom (and its scan) replaces it.
 */
export const DEMO_ROOM: RoomState = {
  v: 1,
  name: 'Demo bedroom',
  dims: { length: 3.6, width: 3, height: 2.4 },
  surfaces: { floor: 'carpet', ceiling: 'plaster', wallX0: 'drywall', wallX1: 'drywall', wallZ0: 'drywall', wallZ1: 'curtains' },
  furnishing: 'full',
  speaker: { x: 0.5, y: 0.9, z: 1 },
  listener: { x: 2.6, y: 1.1, z: 1.7, yaw: 'faceSpeaker' },
  fixes: [],
  calibration: { factor: 1 },
};
