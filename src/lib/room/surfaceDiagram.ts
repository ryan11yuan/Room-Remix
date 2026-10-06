import type { Dims, SurfaceId } from './types';

/** The surface picker's drawing size, in SVG units. The SVG scales to its column and keeps this shape. */
export const DIAGRAM_W = 320;
export const DIAGRAM_H = 256;

export type Point = [x: number, y: number];
/** One tappable surface: its outline, and a point inside it for its label. */
export type DiagramShape = { surface: SurfaceId; points: Point[]; label: Point };

const PAD = 8;
const STRIP_H = 44; // the back wall's strip is a full 44-unit touch target
const GAP = 8;
const BOX_H = DIAGRAM_H - 2 * PAD - STRIP_H - GAP; // the room's open end fits in (DIAGRAM_W − 2·PAD) × BOX_H
const FALLBACK: Dims = { length: 4, width: 3.5, height: 2.6 }; // the default room, for a size that is mid-edit

const clamp = (value: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, value));
const size = (value: number, fallback: number) => (Number.isFinite(value) && value > 0 ? value : fallback);

/**
 * The room drawn from behind its back wall, looking at the front wall, with the back wall cut away: the front wall ahead,
 * the left and right walls at the sides, the floor below and the ceiling above. The back wall is a strip under the
 * drawing. The open end has the room's width-to-height shape and the front wall shrinks with the room's depth, both
 * within limits that keep every surface at least 24 units across, so each stays big enough to tap.
 */
export function surfaceDiagram(dims: Dims): DiagramShape[] {
  const length = size(dims.length, FALLBACK.length);
  const width = size(dims.width, FALLBACK.width);
  const height = size(dims.height, FALLBACK.height);
  const aspect = clamp(width / height, 0.75, 2.4); // the open end's width ÷ height
  const across = Math.max(width, height);
  const depth = clamp(across / (across + length), 0.4, 0.6); // the front wall's size ÷ the open end's: deeper rooms recede more
  const openW = Math.min(DIAGRAM_W - 2 * PAD, BOX_H * aspect);
  const openH = openW / aspect;
  const cx = DIAGRAM_W / 2;
  const cy = PAD + BOX_H / 2;
  const near = { l: cx - openW / 2, r: cx + openW / 2, t: cy - openH / 2, b: cy + openH / 2 };
  const far = { l: cx - (openW * depth) / 2, r: cx + (openW * depth) / 2, t: cy - (openH * depth) / 2, b: cy + (openH * depth) / 2 };
  const stripTop = PAD + BOX_H + GAP;

  return [
    {
      surface: 'wallX0', // the front wall, straight ahead
      points: [[far.l, far.t], [far.r, far.t], [far.r, far.b], [far.l, far.b]],
      label: [cx, cy],
    },
    {
      surface: 'floor',
      points: [[near.l, near.b], [near.r, near.b], [far.r, far.b], [far.l, far.b]],
      label: [cx, (near.b + far.b) / 2],
    },
    {
      surface: 'ceiling',
      points: [[near.l, near.t], [far.l, far.t], [far.r, far.t], [near.r, near.t]],
      label: [cx, (near.t + far.t) / 2],
    },
    {
      surface: 'wallZ1', // the left wall, on your left as you face the front wall
      points: [[near.l, near.t], [near.l, near.b], [far.l, far.b], [far.l, far.t]],
      label: [(near.l + far.l) / 2, cy],
    },
    {
      surface: 'wallZ0', // the right wall
      points: [[near.r, near.t], [far.r, far.t], [far.r, far.b], [near.r, near.b]],
      label: [(near.r + far.r) / 2, cy],
    },
    {
      surface: 'wallX1', // the back wall, behind you: drawn as a strip of its own
      points: [[PAD, stripTop], [DIAGRAM_W - PAD, stripTop], [DIAGRAM_W - PAD, stripTop + STRIP_H], [PAD, stripTop + STRIP_H]],
      label: [cx, stripTop + STRIP_H / 2],
    },
  ];
}
