import { LIMITS } from './constants';
import { GEOMETRY_EPS, fixFits, fixRect, rectsOverlap } from './geometry';
import type { RoomState, Vec3 } from './types';

export type RoomError = { field: string; message: string };

export function defaultRoom(): RoomState {
  return {
    v: 1,
    name: 'My room',
    dims: { length: 4, width: 3.5, height: 2.6 },
    surfaces: {
      floor: 'woodFloor',
      ceiling: 'drywall',
      wallX0: 'drywall',
      wallX1: 'drywall',
      wallZ0: 'drywall',
      wallZ1: 'glass',
    },
    furnishing: 'some',
    speaker: { x: 0.6, y: 1.0, z: 1.4 },
    listener: { x: 3.0, y: 1.1, z: 1.9, yaw: 'faceSpeaker' },
    fixes: [],
    calibration: { factor: 1 },
  };
}

// positions clamped exactly to a bound (e.g. 1.9 − 0.3) must not fail on float noise
const between = (value: number, lo: number, hi: number) =>
  Number.isFinite(value) && value >= lo - GEOMETRY_EPS && value <= hi + GEOMETRY_EPS;

const distance = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

export function validateRoom(room: RoomState): RoomError[] {
  const errors: RoomError[] = [];
  const { length, width, height } = room.dims;
  const { minLengthWidth: lo, maxLengthWidth: hi, minHeight, maxHeight, wallClearance: c } = LIMITS;

  if (!between(length, lo, hi)) errors.push({ field: 'dims.length', message: `Length must be between ${lo} and ${hi} m.` });
  if (!between(width, lo, hi)) errors.push({ field: 'dims.width', message: `Width must be between ${lo} and ${hi} m.` });
  if (!between(height, minHeight, maxHeight)) {
    errors.push({ field: 'dims.height', message: `Height must be between ${minHeight} and ${maxHeight} m.` });
  }
  if (errors.length > 0) return errors;

  for (const key of ['speaker', 'listener'] as const) {
    const p = room[key];
    const inside = between(p.x, c, length - c) && between(p.y, c, height - c) && between(p.z, c, width - c);
    if (!inside) errors.push({ field: key, message: `The ${key} must be at least ${c} m from the walls, floor and ceiling.` });
  }
  if (errors.length === 0 && distance(room.speaker, room.listener) < LIMITS.minSeparation) {
    errors.push({ field: 'listener', message: `The listener must be at least ${LIMITS.minSeparation} m from the speaker.` });
  }

  const rugs = room.fixes.filter((f) => f.kind === 'rug').length;
  const panels = room.fixes.length - rugs;
  if (rugs > LIMITS.maxRugs) errors.push({ field: 'fixes', message: 'Only one rug is supported.' });
  if (panels > LIMITS.maxPanels) errors.push({ field: 'fixes', message: `At most ${LIMITS.maxPanels} panels are supported.` });

  room.fixes.forEach((fix, i) => {
    if (!fixFits(room.dims, fix)) {
      errors.push({
        field: `fixes.${i}`,
        message: fix.kind === 'rug' ? 'The rug must fit inside the floor.' : 'The panel must fit on its wall.',
      });
    }
  });

  room.fixes.forEach((fix, i) => {
    if (fix.kind !== 'panel') return;
    const clash = room.fixes
      .slice(0, i)
      .some((other) => other.kind === 'panel' && other.wall === fix.wall && rectsOverlap(fixRect(other), fixRect(fix)));
    if (clash) errors.push({ field: `fixes.${i}`, message: "Panels can't overlap." });
  });

  return errors;
}
