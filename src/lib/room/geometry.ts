import { PANEL_SIZE, RUG_SIZES } from './constants';
import type { Dims, Fix, SurfaceId, Vec3 } from './types';

export const GEOMETRY_EPS = 1e-9; // positions computed by adding or subtracting sizes must not fail on float noise

export type Rect = { u0: number; u1: number; v0: number; v1: number };

export function surfaceSize(dims: Dims, surface: SurfaceId): { u: number; v: number } {
  switch (surface) {
    case 'floor':
    case 'ceiling':
      return { u: dims.length, v: dims.width };
    case 'wallX0':
    case 'wallX1':
      return { u: dims.width, v: dims.height };
    case 'wallZ0':
    case 'wallZ1':
      return { u: dims.length, v: dims.height };
  }
}

export function toSurfaceCoords(surface: SurfaceId, p: Vec3): { u: number; v: number } {
  switch (surface) {
    case 'floor':
    case 'ceiling':
      return { u: p.x, v: p.z };
    case 'wallX0':
    case 'wallX1':
      return { u: p.z, v: p.y };
    case 'wallZ0':
    case 'wallZ1':
      return { u: p.x, v: p.y };
  }
}

export function fixSurface(fix: Fix): SurfaceId {
  return fix.kind === 'rug' ? 'floor' : fix.wall;
}

export function fixRect(fix: Fix): Rect {
  if (fix.kind === 'rug') {
    const s = RUG_SIZES[fix.size];
    return { u0: fix.x - s.x / 2, u1: fix.x + s.x / 2, v0: fix.z - s.z / 2, v1: fix.z + s.z / 2 };
  }
  return {
    u0: fix.u - PANEL_SIZE.u / 2,
    u1: fix.u + PANEL_SIZE.u / 2,
    v0: fix.v - PANEL_SIZE.v / 2,
    v1: fix.v + PANEL_SIZE.v / 2,
  };
}

export function rectContains(r: Rect, u: number, v: number): boolean {
  return u >= r.u0 && u <= r.u1 && v >= r.v0 && v <= r.v1;
}

/** Area of the rectangle that lies on a surface of the given size. */
export function clippedArea(r: Rect, size: { u: number; v: number }): number {
  const du = Math.min(r.u1, size.u) - Math.max(r.u0, 0);
  const dv = Math.min(r.v1, size.v) - Math.max(r.v0, 0);
  return du > 0 && dv > 0 ? du * dv : 0;
}

/** True when two rectangles share some area (touching edges don't count). */
export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.u0 < b.u1 - GEOMETRY_EPS && b.u0 < a.u1 - GEOMETRY_EPS && a.v0 < b.v1 - GEOMETRY_EPS && b.v0 < a.v1 - GEOMETRY_EPS;
}

export function fixFits(dims: Dims, fix: Fix): boolean {
  const size = surfaceSize(dims, fixSurface(fix));
  const r = fixRect(fix);
  return r.u0 >= -GEOMETRY_EPS && r.v0 >= -GEOMETRY_EPS && r.u1 <= size.u + GEOMETRY_EPS && r.v1 <= size.v + GEOMETRY_EPS;
}
