import { LIMITS, PANEL_SIZE, RUG_SIZES } from './constants';
import { GEOMETRY_EPS, fixRect, rectsOverlap, surfaceSize, toSurfaceCoords } from './geometry';
import type { Dims, PanelFix, RoomState, RugFix, Vec3, WallId } from './types';

/** What a pointer drag in the 3D view can move. */
export type DragTarget = { kind: 'speaker' } | { kind: 'listener' } | { kind: 'rug'; index: number };

const clamp = (value: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, value));

/** Keep a speaker or listener position the wall clearance away from every surface. */
export function clampPosition(dims: Dims, p: Vec3): Vec3 {
  const c = LIMITS.wallClearance;
  return { x: clamp(p.x, c, dims.length - c), y: clamp(p.y, c, dims.height - c), z: clamp(p.z, c, dims.width - c) };
}

/** Move a rug's centre so the whole rug stays on the floor. */
export function clampRug(dims: Dims, rug: RugFix): RugFix {
  const size = RUG_SIZES[rug.size];
  return {
    ...rug,
    x: clamp(rug.x, size.x / 2, dims.length - size.x / 2),
    z: clamp(rug.z, size.z / 2, dims.width - size.z / 2),
  };
}

/** A panel centred where a wall was tapped, nudged so it fits on the wall. */
export function panelAt(dims: Dims, wall: WallId, point: Vec3): PanelFix {
  const size = surfaceSize(dims, wall);
  const { u, v } = toSurfaceCoords(wall, point);
  return {
    kind: 'panel',
    wall,
    u: clamp(u, PANEL_SIZE.u / 2, size.u - PANEL_SIZE.u / 2),
    v: clamp(v, PANEL_SIZE.v / 2, size.v - PANEL_SIZE.v / 2),
    on: true,
  };
}

/** Whether a panel would overlap a panel already on the same wall. */
export function panelOverlaps(room: RoomState, panel: PanelFix): boolean {
  return room.fixes.some(
    (f) => f.kind === 'panel' && f.wall === panel.wall && rectsOverlap(fixRect(f), fixRect(panel)),
  );
}

const PANEL_WALL_ORDER: WallId[] = ['wallZ1', 'wallZ0', 'wallX1', 'wallX0'];

/** The first free spot for a new panel: 1.2 m high, 0.1 m apart along each wall in turn; null when all are full. */
export function findFreePanelSpot(room: RoomState): PanelFix | null {
  for (const wall of PANEL_WALL_ORDER) {
    const length = surfaceSize(room.dims, wall).u;
    for (let k = 0; ; k++) {
      const u = (5 + 7 * k) / 10; // 0.5, 1.2, 1.9 … in tenths so 2.6 isn't 2.5999…
      if (u + PANEL_SIZE.u / 2 > length + GEOMETRY_EPS) break;
      const panel: PanelFix = { kind: 'panel', wall, u, v: 1.2, on: true };
      if (!panelOverlaps(room, panel)) return panel;
    }
  }
  return null;
}

/** Move a dragged item to a floor-plan point: x and z follow the pointer, height and yaw stay, and it stays in the room. */
export function applyDrag(room: RoomState, target: DragTarget, point: Vec3): RoomState {
  const { length, width, height } = room.dims;
  if (![length, width, height].every((d) => Number.isFinite(d) && d > 0)) return room; // a size is mid-edit
  switch (target.kind) {
    case 'speaker':
      return { ...room, speaker: clampPosition(room.dims, { ...room.speaker, x: point.x, z: point.z }) };
    case 'listener':
      return {
        ...room,
        listener: { ...clampPosition(room.dims, { ...room.listener, x: point.x, z: point.z }), yaw: room.listener.yaw },
      };
    case 'rug':
      return {
        ...room,
        fixes: room.fixes.map((f, i) =>
          i === target.index && f.kind === 'rug' ? clampRug(room.dims, { ...f, x: point.x, z: point.z }) : f,
        ),
      };
  }
}
