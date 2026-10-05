import { PANEL_SIZE, RUG_SIZES } from '@/lib/room/constants';
import { fixSurface, surfaceSize } from '@/lib/room/geometry';
import type { Dims, Fix, RoomState, SurfaceId, Vec3 } from '@/lib/room/types';

/** A rectangle in the room: its centre, inward normal, in-plane axes (u, v as in toSurfaceCoords) and size. */
export type Quad = { center: Vec3; normal: Vec3; uAxis: Vec3; vAxis: Vec3; width: number; height: number };

const vec = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

const AXES: Record<SurfaceId, { normal: Vec3; uAxis: Vec3; vAxis: Vec3 }> = {
  floor: { normal: vec(0, 1, 0), uAxis: vec(1, 0, 0), vAxis: vec(0, 0, 1) },
  ceiling: { normal: vec(0, -1, 0), uAxis: vec(1, 0, 0), vAxis: vec(0, 0, 1) },
  wallX0: { normal: vec(1, 0, 0), uAxis: vec(0, 0, 1), vAxis: vec(0, 1, 0) },
  wallX1: { normal: vec(-1, 0, 0), uAxis: vec(0, 0, 1), vAxis: vec(0, 1, 0) },
  wallZ0: { normal: vec(0, 0, 1), uAxis: vec(1, 0, 0), vAxis: vec(0, 1, 0) },
  wallZ1: { normal: vec(0, 0, -1), uAxis: vec(1, 0, 0), vAxis: vec(0, 1, 0) },
};

const LIFT = 0.01; // draw fixes just in front of their surface so they don't flicker against it

/** The room point at surface coordinates (u, v): the inverse of toSurfaceCoords. */
export function surfacePoint(dims: Dims, surface: SurfaceId, u: number, v: number): Vec3 {
  switch (surface) {
    case 'floor':
      return vec(u, 0, v);
    case 'ceiling':
      return vec(u, dims.height, v);
    case 'wallX0':
      return vec(0, v, u);
    case 'wallX1':
      return vec(dims.length, v, u);
    case 'wallZ0':
      return vec(u, v, 0);
    case 'wallZ1':
      return vec(u, v, dims.width);
  }
}

export function surfaceQuad(dims: Dims, surface: SurfaceId): Quad {
  const size = surfaceSize(dims, surface);
  return { ...AXES[surface], center: surfacePoint(dims, surface, size.u / 2, size.v / 2), width: size.u, height: size.v };
}

export function fixQuad(dims: Dims, fix: Fix): Quad {
  const surface = fixSurface(fix);
  const axes = AXES[surface];
  const [u, v, width, height] =
    fix.kind === 'rug'
      ? [fix.x, fix.z, RUG_SIZES[fix.size].x, RUG_SIZES[fix.size].z]
      : [fix.u, fix.v, PANEL_SIZE.u, PANEL_SIZE.v];
  const p = surfacePoint(dims, surface, u, v);
  const n = axes.normal;
  return { ...axes, center: vec(p.x + n.x * LIFT, p.y + n.y * LIFT, p.z + n.z * LIFT), width, height };
}

export type CameraPreset = 'top' | 'corner' | 'listener';

export function cameraPreset(room: RoomState, preset: CameraPreset): { position: Vec3; target: Vec3 } {
  const { length: L, width: W, height: H } = room.dims;
  switch (preset) {
    case 'top': // the tiny z offset keeps "looking straight down" well-defined for the orbit controls
      return { position: vec(L / 2, H + 1.3 * Math.max(L, W), W / 2 + 0.01), target: vec(L / 2, 0, W / 2) };
    case 'corner':
      return { position: vec(1.45 * L, 1.7 * H, 1.45 * W), target: vec(L / 2, H / 3, W / 2) };
    case 'listener':
      return {
        position: vec(room.listener.x, room.listener.y, room.listener.z),
        target: vec(room.speaker.x, room.speaker.y, room.speaker.z),
      };
  }
}
