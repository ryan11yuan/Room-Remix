import * as THREE from 'three';
import { LIMITS } from '@/lib/room/constants';
import type { Vec3 } from '@/lib/room/types';
import type { RoomFit } from './types';

export const EYE_HEIGHT = 1.5; // m: the phone's height while filming (spec 2026-10-07 sound §2)
export const DEFAULT_CEILING = 2.7;
export const MIN_CEILING = 2.2;
const FLOOR_Q = 0.02;
const CEILING_Q = 0.98;
const WALL_Q = 0.03;
const SEARCH_POINTS = 20_000; // the yaw search runs on a sample; the final walls use every point

/** The q-quantile of sorted values, interpolated. */
export function quantile(sorted: ArrayLike<number>, q: number): number {
  if (sorted.length === 0) return NaN;
  const i = q * (sorted.length - 1);
  const lo = Math.floor(i);
  const hi = Math.min(lo + 1, sorted.length - 1);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

function extent(points: Float32Array, yaw: number, stride: number) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const n = Math.floor(points.length / 3);
  const xs = new Float64Array(Math.ceil(n / stride));
  const zs = new Float64Array(xs.length);
  let j = 0;
  for (let i = 0; i < n; i += stride, j++) {
    const x = points[3 * i];
    const z = points[3 * i + 2];
    xs[j] = x * c + z * s;
    zs[j] = -x * s + z * c;
  }
  xs.sort();
  zs.sort();
  return { minX: quantile(xs, WALL_Q), maxX: quantile(xs, 1 - WALL_Q), minZ: quantile(zs, WALL_Q), maxZ: quantile(zs, 1 - WALL_Q) };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * A box in metres around the upright splat (spec §2). `points` are xyz triples in world (upright) units; `cameras` the
 * video's camera positions in the same frame. Floor = 2nd percentile height; scale from the phone held 1.5 m up; walls =
 * the 3rd–97th percentile box at the yaw (0–89°) that gives the smallest floor area; ceiling = 98th percentile, or 2.7 m.
 */
export function fitRoom(points: Float32Array, cameras: Vec3[]): RoomFit {
  const n = Math.floor(points.length / 3);
  if (n === 0) throw new Error('No splat points to fit a room to');
  const ys = new Float64Array(n);
  for (let i = 0; i < n; i++) ys[i] = points[3 * i + 1];
  ys.sort();
  const floorY = quantile(ys, FLOOR_Q);
  const topY = quantile(ys, CEILING_Q);
  const eye = cameras.length > 0 ? cameras.reduce((sum, c) => sum + c.y, 0) / cameras.length - floorY : 0;
  const scale = eye > 1e-6 ? EYE_HEIGHT / eye : 1;

  const stride = Math.max(1, Math.floor(n / SEARCH_POINTS));
  let yaw = 0;
  let bestArea = Infinity;
  for (let deg = 0; deg < 90; deg++) {
    const a = (deg * Math.PI) / 180;
    const e = extent(points, a, stride);
    const area = (e.maxX - e.minX) * (e.maxZ - e.minZ);
    if (area < bestArea) {
      bestArea = area;
      yaw = a;
    }
  }
  const { minX, maxX, minZ, maxZ } = extent(points, yaw, 1);
  let height = (topY - floorY) * scale;
  if (!(height >= MIN_CEILING)) height = DEFAULT_CEILING;
  const { minLengthWidth: lo, maxLengthWidth: hi, minHeight, maxHeight } = LIMITS;
  return {
    dims: { length: clamp((maxX - minX) * scale, lo, hi), width: clamp((maxZ - minZ) * scale, lo, hi), height: clamp(height, minHeight, maxHeight) },
    scale,
    yaw,
    floorY,
    minX,
    minZ,
  };
}

export function toRoom(fit: RoomFit, p: Vec3): Vec3 {
  const c = Math.cos(fit.yaw);
  const s = Math.sin(fit.yaw);
  return {
    x: (p.x * c + p.z * s - fit.minX) * fit.scale,
    y: (p.y - fit.floorY) * fit.scale,
    z: (-p.x * s + p.z * c - fit.minZ) * fit.scale,
  };
}

export function toWorld(fit: RoomFit, p: Vec3): Vec3 {
  const c = Math.cos(fit.yaw);
  const s = Math.sin(fit.yaw);
  const xr = p.x / fit.scale + fit.minX;
  const zr = p.z / fit.scale + fit.minZ;
  return { x: xr * c - zr * s, y: p.y / fit.scale + fit.floorY, z: xr * s + zr * c };
}

/** The room yaw (atan2 of z over x, as binaural.listenerYaw uses) of a world direction. */
export function roomYaw(fit: RoomFit, dir: Vec3): number {
  const c = Math.cos(fit.yaw);
  const s = Math.sin(fit.yaw);
  return Math.atan2(-dir.x * s + dir.z * c, dir.x * c + dir.z * s);
}

/** room metres → world, as a matrix: things drawn inside a group with this matrix are placed in room metres. */
export function roomToWorldMatrix(fit: RoomFit): THREE.Matrix4 {
  const k = 1 / fit.scale;
  return new THREE.Matrix4()
    .makeRotationY(-fit.yaw)
    .multiply(new THREE.Matrix4().makeTranslation(fit.minX, fit.floorY, fit.minZ))
    .multiply(new THREE.Matrix4().makeScale(k, k, k));
}
