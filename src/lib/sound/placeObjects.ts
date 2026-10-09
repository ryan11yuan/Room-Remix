import { isNameId } from '@/lib/explore/names';
import type { ObjectLabel, RoomObject, Vec3 } from '@/lib/room/types';
import type { CameraPose, DetectionsFile } from '@/lib/splatJobs/protocol';
import { quantile } from './roomFit';
const CORE = 0.2; // trim this share off each side of a box for the depth estimate (spec §3.2: the central 60 %)
const FRONT_Q = 0.15;
const DEPTH_BEHIND_M = 1;
const DEPTH_AHEAD_M = 0.05;
const MIN_POINTS = 20;
const EXTENT_Q = 0.1;
const MERGE_M: Partial<Record<ObjectLabel, number>> = { chair: 0.5 };
const DEFAULT_MERGE_M = 0.7;
const MIN_FRAMES = 2;

/** Pixel and depth of a raw-frame point in a camera from cameras.json (columns: right, down, forward). Null behind it. */
export function project(camera: CameraPose, x: number, y: number, z: number): { u: number; v: number; depth: number } | null {
  const r = camera.rotation;
  const dx = x - camera.position[0];
  const dy = y - camera.position[1];
  const dz = z - camera.position[2];
  const cx = dx * r[0][0] + dy * r[1][0] + dz * r[2][0];
  const cy = dx * r[0][1] + dy * r[1][1] + dz * r[2][1];
  const depth = dx * r[0][2] + dy * r[1][2] + dz * r[2][2];
  if (depth <= 1e-6) return null;
  return { u: (camera.fx * cx) / depth + camera.width / 2, v: (camera.fy * cy) / depth + camera.height / 2, depth };
}

type Candidate = { label: ObjectLabel; centre: Vec3; size: Vec3; frame: string };

/**
 * Lift each 2D detection into the room (spec §3.2): the splat centres inside its box, from the front of what the box's
 * middle sees to 1 m behind it, give its 3D box; the same label across frames merges; an object needs two frames.
 */
export function placeObjects(
  file: DetectionsFile,
  cameras: CameraPose[],
  points: Float32Array,
  toRoomPoint: (x: number, y: number, z: number) => Vec3,
  metresPerUnit: number,
): RoomObject[] {
  const byName = new Map(cameras.map((c) => [c.img_name, c]));
  const n = Math.floor(points.length / 3);
  const candidates: Candidate[] = [];
  for (const frame of file.frames) {
    const camera = byName.get(frame.img_name);
    const detections = frame.detections.filter((d) => isNameId(d.label));
    if (!camera || detections.length === 0 || !(frame.width > 0) || !(frame.height > 0)) continue;
    const us = new Float32Array(n);
    const vs = new Float32Array(n);
    const ds = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const p = project(camera, points[3 * i], points[3 * i + 1], points[3 * i + 2]);
      if (p) [us[i], vs[i], ds[i]] = [p.u, p.v, p.depth];
    }
    const su = camera.width / frame.width;
    const sv = camera.height / frame.height;
    for (const d of detections) {
      const [x0, y0, x1, y1] = [d.box[0] * su, d.box[1] * sv, d.box[2] * su, d.box[3] * sv];
      const [cx0, cy0, cx1, cy1] = [x0 + CORE * (x1 - x0), y0 + CORE * (y1 - y0), x1 - CORE * (x1 - x0), y1 - CORE * (y1 - y0)];
      const inBox: number[] = [];
      const core: number[] = [];
      for (let i = 0; i < n; i++) {
        if (ds[i] <= 0 || us[i] < x0 || us[i] > x1 || vs[i] < y0 || vs[i] > y1) continue;
        inBox.push(i);
        if (us[i] >= cx0 && us[i] <= cx1 && vs[i] >= cy0 && vs[i] <= cy1) core.push(ds[i]);
      }
      if (core.length < MIN_POINTS) continue;
      core.sort((a, b) => a - b);
      const front = quantile(core, FRONT_Q);
      const near = front - DEPTH_AHEAD_M / metresPerUnit;
      const far = front + DEPTH_BEHIND_M / metresPerUnit;
      const xs: number[] = [];
      const ys: number[] = [];
      const zs: number[] = [];
      for (const i of inBox) {
        if (ds[i] < near || ds[i] > far) continue;
        const r = toRoomPoint(points[3 * i], points[3 * i + 1], points[3 * i + 2]);
        xs.push(r.x);
        ys.push(r.y);
        zs.push(r.z);
      }
      if (xs.length < MIN_POINTS) continue;
      const span = (v: number[]) => {
        v.sort((a, b) => a - b);
        return [quantile(v, EXTENT_Q), quantile(v, 1 - EXTENT_Q)];
      };
      const [ax, bx] = span(xs);
      const [ay, by] = span(ys);
      const [az, bz] = span(zs);
      candidates.push({
        label: d.label as ObjectLabel,
        centre: { x: (ax + bx) / 2, y: (ay + by) / 2, z: (az + bz) / 2 },
        size: { x: bx - ax, y: by - ay, z: bz - az },
        frame: frame.img_name,
      });
    }
  }
  return merge(candidates);
}

const median = (v: number[]) => quantile([...v].sort((a, b) => a - b), 0.5);

function merge(candidates: Candidate[]): RoomObject[] {
  const clusters: { label: ObjectLabel; members: Candidate[]; centre: Vec3 }[] = [];
  for (const c of candidates) {
    const reach = MERGE_M[c.label] ?? DEFAULT_MERGE_M;
    let best: (typeof clusters)[number] | null = null;
    let bestDistance = reach;
    for (const k of clusters) {
      if (k.label !== c.label) continue;
      const distance = Math.hypot(k.centre.x - c.centre.x, k.centre.z - c.centre.z);
      if (distance <= bestDistance) [best, bestDistance] = [k, distance];
    }
    if (!best) {
      clusters.push({ label: c.label, members: [c], centre: { ...c.centre } });
      continue;
    }
    best.members.push(c);
    const m = best.members.length;
    best.centre = {
      x: best.centre.x + (c.centre.x - best.centre.x) / m,
      y: best.centre.y + (c.centre.y - best.centre.y) / m,
      z: best.centre.z + (c.centre.z - best.centre.z) / m,
    };
  }
  return clusters
    .filter((k) => new Set(k.members.map((m) => m.frame)).size >= MIN_FRAMES)
    .map((k) => {
      const size = { x: median(k.members.map((m) => m.size.x)), y: median(k.members.map((m) => m.size.y)), z: median(k.members.map((m) => m.size.z)) };
      return {
        label: k.label,
        min: { x: k.centre.x - size.x / 2, y: Math.max(0, k.centre.y - size.y / 2), z: k.centre.z - size.z / 2 },
        max: { x: k.centre.x + size.x / 2, y: k.centre.y + size.y / 2, z: k.centre.z + size.z / 2 },
      };
    });
}
